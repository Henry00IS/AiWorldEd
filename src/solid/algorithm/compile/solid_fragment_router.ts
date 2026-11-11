import * as THREE from 'three';
import { SurfaceCategory } from '@/solid/types/surface_category.js';
import { BrushMembership } from '@/solid/algorithm/spatial/brush_membership.js';
import type { PreparedBrush } from './solid_compile_types.js';
import { SolidCsgTree } from './solid_csg_tree.js';
import type { SolidFragmentClassificationMemo } from './solid_fragment_classification_memo.js';
import type { SolidAlgorithmRoutingTable } from '@/solid/algorithm/routing/solid_algorithm_routing_table.js';
import { SolidAlgorithmRoutingTableCache } from '@/solid/algorithm/routing/solid_algorithm_routing_table_cache.js';
import { SOLID_ALGORITHM_INFINITE_PREPARED_INDEX } from '@/solid/algorithm/routing/solid_algorithm_compact_node.js';
import type { SolidAlgorithmFaceRoutePlan } from '@/solid/algorithm/routing/solid_algorithm_face_route_plan.js';

/** Marker for "no peer classified yet" in the per-route classification cache. */
const SOLID_FRAGMENT_ROUTER_NO_PEER = -3;

/**
 * Routes fragment surface categories through per-subject routing tables
 * (compact hierarchy, touch locality, infinite inverted brush).
 */
export class SolidFragmentRouter {
  private invertedWorld = false;
  private csgTree: SolidCsgTree | null = null;
  private readonly routingTables = new SolidAlgorithmRoutingTableCache();
  private readonly scratchCentroid = new THREE.Vector3();
  private activeClassificationMemo: SolidFragmentClassificationMemo | null = null;
  private lastClassifiedPeerIndex = SOLID_FRAGMENT_ROUTER_NO_PEER;
  private lastClassifiedCategory: SurfaceCategory = SurfaceCategory.Outside;
  private planPrepared: readonly PreparedBrush[] = [];
  private planNormal = new THREE.Vector3(0, 1, 0);
  /** Plan classifier created once so routing a fragment allocates no closure. */
  private readonly classifyForPlan = (preparedIndex: number): SurfaceCategory => {
    const peer = this.planPrepared[preparedIndex];
    return peer ? this.classifyCentroidAgainstPeer(preparedIndex, peer, this.planNormal) : SurfaceCategory.Outside;
  };

  /**
   * Kept for call-site compatibility.
   *
   * @param _value Unused.
   */
  setHasIntersectingOperations(_value: boolean): void {
    void _value;
  }

  /**
   * Sets inverted-world mode (infinite brush in the hierarchy).
   *
   * @param value True when inverted world is enabled.
   */
  setInvertedWorld(value: boolean): void {
    this.invertedWorld = value;
  }

  /**
   * Installs the CSG tree for compact-hierarchy construction.
   *
   * @param tree Hierarchical tree, or null for flat prepared order.
   */
  setCsgTree(tree: SolidCsgTree | null): void {
    this.csgTree = tree;
  }

  /** Clears cached routing tables. */
  clearRoutingTables(): void {
    this.forgetResolvedTable();
    this.routingTables.clear();
  }

  /**
   * Drops cached tables after brush removal or reorder.
   *
   * @param brushId Brush instance id.
   */
  invalidateRoutingTable(brushId: string): void {
    this.forgetResolvedTable();
    this.routingTables.invalidateBrush(brushId);
  }

  /**
   * Routes a fragment through the subject's routing table.
   *
   * @param fragment Fragment polygon.
   * @param normal Face normal.
   * @param prepared All brushes.
   * @param subjectIndex Subject brush index.
   * @param interactionPeerIndices Peers with a surface loop on the parent face
   *   (CreateIntersectionLoops presence). When omitted, relative columns are
   *   used whenever the fragment is not Outside the peer.
   * @param classificationMemo Optional per-fragment memo of peer
   *   classifications to consult and fill.
   * @returns Final routed category.
   */
  routeFragmentCategory(
    fragment: THREE.Vector3[],
    normal: THREE.Vector3,
    prepared: PreparedBrush[],
    subjectIndex: number,
    interactionPeerIndices?: ReadonlySet<number>,
    classificationMemo?: SolidFragmentClassificationMemo,
  ): SurfaceCategory {
    BrushMembership.polygonCentroidInto(fragment, this.scratchCentroid);
    this.activeClassificationMemo = classificationMemo ?? null;
    this.lastClassifiedPeerIndex = SOLID_FRAGMENT_ROUTER_NO_PEER;
    const table = this.resolveTable(prepared, subjectIndex);
    return table.route(
      (preparedIndex) => this.classifyForTable(preparedIndex, subjectIndex, prepared, normal),
      (preparedIndex) =>
        this.hasSurfaceInteractionForTable(preparedIndex, subjectIndex, prepared, normal, interactionPeerIndices),
    );
  }

  /**
   * Routes a fragment through a face routing plan, classifying only the peers
   * the plan could not resolve for the whole face.
   *
   * @param fragment Fragment polygon.
   * @param normal Face normal.
   * @param prepared All brushes.
   * @param plan Routing plan of the fragment's face.
   * @param classificationMemo Per-fragment memo of peer classifications to
   *   consult and fill.
   * @returns Final routed category.
   */
  routeFragmentWithPlan(
    fragment: THREE.Vector3[],
    normal: THREE.Vector3,
    prepared: PreparedBrush[],
    plan: SolidAlgorithmFaceRoutePlan,
    classificationMemo: SolidFragmentClassificationMemo,
  ): SurfaceCategory {
    BrushMembership.polygonCentroidInto(fragment, this.scratchCentroid);
    this.activeClassificationMemo = classificationMemo;
    this.lastClassifiedPeerIndex = SOLID_FRAGMENT_ROUTER_NO_PEER;
    this.planPrepared = prepared;
    this.planNormal = normal;
    return plan.route(this.classifyForPlan);
  }

  /**
   * Classifies the current fragment centroid against one peer, consulting and
   * filling the active classification memo when one is installed.
   *
   * @param preparedIndex Peer prepared index.
   * @param peer Peer prepared brush.
   * @param normal Fragment normal.
   * @returns Relative category of the centroid.
   */
  private classifyCentroidAgainstPeer(
    preparedIndex: number,
    peer: PreparedBrush,
    normal: THREE.Vector3,
  ): SurfaceCategory {
    if (preparedIndex === this.lastClassifiedPeerIndex) {
      return this.lastClassifiedCategory;
    }
    const memo = this.activeClassificationMemo;
    const remembered = memo?.categoryFor(preparedIndex, peer.brush);
    const category = remembered ?? BrushMembership.classifyPoint(this.scratchCentroid, peer.brush, normal);
    if (memo && remembered === undefined) {
      memo.remember(preparedIndex, peer.brush, category);
    }
    this.lastClassifiedPeerIndex = preparedIndex;
    this.lastClassifiedCategory = category;
    return category;
  }

  /**
   * Resolves or builds the routing table for a subject.
   *
   * @param prepared Prepared brushes.
   * @param subjectIndex Subject index.
   * @returns Routing table.
   */
  resolveTable(prepared: PreparedBrush[], subjectIndex: number): SolidAlgorithmRoutingTable {
    if (
      this.resolvedPrepared === prepared &&
      this.resolvedSubject === subjectIndex &&
      this.resolvedTable !== null &&
      this.resolvedTree === this.csgTree &&
      this.resolvedInverted === this.invertedWorld
    ) {
      return this.resolvedTable;
    }
    const tree = this.csgTree ?? SolidCsgTree.fromPreparedFlat(prepared);
    const table = this.routingTables.getOrBuild(prepared, subjectIndex, tree, this.invertedWorld, false);
    this.resolvedPrepared = prepared;
    this.resolvedSubject = subjectIndex;
    this.resolvedTable = table;
    this.resolvedTree = this.csgTree;
    this.resolvedInverted = this.invertedWorld;
    return table;
  }

  /** Drops the remembered per-subject table so the next resolve hits the cache. */
  private forgetResolvedTable(): void {
    this.resolvedPrepared = null;
    this.resolvedTable = null;
    this.resolvedTree = null;
  }

  /*
   * Last resolved routing table. Every fragment of one subject routes through
   * the same table, and the prepared array is rebuilt for every compile, so
   * (prepared identity, subject, tree, inverted) identifies it without
   * rebuilding the string cache key per fragment.
   */
  private resolvedPrepared: PreparedBrush[] | null = null;
  private resolvedSubject = -1;
  private resolvedTable: SolidAlgorithmRoutingTable | null = null;
  private resolvedTree: SolidCsgTree | null = null;
  private resolvedInverted = false;

  /**
   * Classifies the fragment centroid against one table step brush.
   *
   * @param preparedIndex Step brush index (may be infinite).
   * @param subjectIndex Subject index.
   * @param prepared Prepared brushes.
   * @param normal Face normal.
   * @returns Relative category.
   */
  private classifyForTable(
    preparedIndex: number,
    subjectIndex: number,
    prepared: PreparedBrush[],
    normal: THREE.Vector3,
  ): SurfaceCategory {
    if (preparedIndex === SOLID_ALGORITHM_INFINITE_PREPARED_INDEX) {
      return SurfaceCategory.Inside;
    }
    if (preparedIndex === subjectIndex) {
      return SurfaceCategory.SelfAligned;
    }
    const peer = prepared[preparedIndex];
    if (!peer) {
      return SurfaceCategory.Outside;
    }
    return this.classifyCentroidAgainstPeer(preparedIndex, peer, normal);
  }

  /**
   * Returns whether this fragment should use relative category columns for a
   * peer (PerformCSG intersection-loop path) rather than Outside-only.
   * Face-level interaction peers replace per-fragment plane scans; non-Outside
   * relative categories still count as loops (submerged / coplanar pieces).
   *
   * @param preparedIndex Step brush index.
   * @param subjectIndex Subject index.
   * @param prepared Prepared brushes.
   * @param normal Face normal.
   * @param interactionPeerIndices Face-level loop peers, when known.
   * @returns True when relative columns may apply.
   */
  private hasSurfaceInteractionForTable(
    preparedIndex: number,
    subjectIndex: number,
    prepared: PreparedBrush[],
    normal: THREE.Vector3,
    interactionPeerIndices: ReadonlySet<number> | undefined,
  ): boolean {
    if (preparedIndex === SOLID_ALGORITHM_INFINITE_PREPARED_INDEX) {
      return true;
    }
    if (preparedIndex === subjectIndex) {
      return true;
    }
    if (interactionPeerIndices && interactionPeerIndices.has(preparedIndex)) {
      return true;
    }
    const peer = prepared[preparedIndex];
    if (!peer) {
      return false;
    }
    const relative = this.classifyCentroidAgainstPeer(preparedIndex, peer, normal);
    return relative !== SurfaceCategory.Outside;
  }
}
