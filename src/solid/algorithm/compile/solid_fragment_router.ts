import * as THREE from 'three';
import { SurfaceCategory } from '@/solid/types/surface_category.js';
import { BrushMembership } from '@/solid/algorithm/spatial/brush_membership.js';
import type { PreparedBrush } from './solid_compile_types.js';
import { SolidCsgTree } from './solid_csg_tree.js';
import type { SolidAlgorithmRoutingTable } from '@/solid/algorithm/routing/solid_algorithm_routing_table.js';
import { SolidAlgorithmRoutingTableCache } from '@/solid/algorithm/routing/solid_algorithm_routing_table_cache.js';
import { SOLID_ALGORITHM_INFINITE_PREPARED_INDEX } from '@/solid/algorithm/routing/solid_algorithm_compact_node.js';

/**
 * Routes fragment surface categories through per-subject routing tables
 * (compact hierarchy, touch locality, infinite inverted brush).
 */
export class SolidFragmentRouter {
  private invertedWorld = false;
  private csgTree: SolidCsgTree | null = null;
  private readonly routingTables = new SolidAlgorithmRoutingTableCache();
  private readonly scratchCentroid = new THREE.Vector3();

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
   * @returns Final routed category.
   */
  routeFragmentCategory(
    fragment: THREE.Vector3[],
    normal: THREE.Vector3,
    prepared: PreparedBrush[],
    subjectIndex: number,
    interactionPeerIndices?: ReadonlySet<number>,
  ): SurfaceCategory {
    BrushMembership.polygonCentroidInto(fragment, this.scratchCentroid);
    const table = this.resolveTable(prepared, subjectIndex);
    return table.route(
      (preparedIndex) => this.classifyForTable(preparedIndex, subjectIndex, prepared, normal),
      (preparedIndex) =>
        this.hasSurfaceInteractionForTable(preparedIndex, subjectIndex, prepared, normal, interactionPeerIndices),
    );
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
    return BrushMembership.classifyPoint(this.scratchCentroid, peer.brush, normal);
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
    const relative = BrushMembership.classifyPoint(this.scratchCentroid, peer.brush, normal);
    return relative !== SurfaceCategory.Outside;
  }
}
