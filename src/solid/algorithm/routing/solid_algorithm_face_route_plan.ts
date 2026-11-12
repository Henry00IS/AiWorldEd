import type * as THREE from 'three';
import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';
import { SOLID_FAT_PLANE_EPSILON } from '@/solid/algorithm/math/solid_math_constants.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { SolidPlane } from '@/solid/brush/solid_plane.js';
import { SurfaceCategory } from '@/solid/types/surface_category.js';
import { SOLID_ALGORITHM_INFINITE_PREPARED_INDEX } from './solid_algorithm_compact_node.js';
import type { SolidAlgorithmRoutingTable } from './solid_algorithm_routing_table.js';

/** Marks a lookup whose peer category differs between fragments of a face. */
const SOLID_FACE_ROUTE_PLAN_VARIABLE = -2;

/** Extra distance beyond the fat-plane epsilon that absorbs centroid rounding. */
const SOLID_FACE_ROUTE_PLAN_MARGIN = 1e-6;

/**
 * A run of consecutive lookups whose peer category is the same for every
 * fragment.
 */
interface SolidFaceRoutePlanRun {
  start: number;
  end: number;
  nextStateByState: Map<number, number>;
}

/** One lookup whose peer must be classified per fragment. */
interface SolidFaceRoutePlanVariable {
  lookupIndex: number;
  preparedIndex: number;
  outcomeByState: Map<number, number>;
}

/** Either kind of plan segment. */
type SolidFaceRoutePlanSegment = SolidFaceRoutePlanRun | SolidFaceRoutePlanVariable;

/**
 * Routing plan for the fragments of one face. Peers whose category is the same
 * for every point of the face's fragment bounds are resolved once, runs of such
 * lookups are collapsed into cached state transitions, and only the remaining
 * peers are classified per fragment. Routing through the plan gives the same
 * category as walking the table step by step.
 */
export class SolidAlgorithmFaceRoutePlan {
  readonly table: SolidAlgorithmRoutingTable;
  readonly bounds: THREE.Box3;
  private readonly constantByLookup: number[];
  private readonly constantByPeer = new Map<number, number>();
  private readonly segments: SolidFaceRoutePlanSegment[] = [];

  /**
   * Builds a plan for one face.
   *
   * @param table Routing table of the subject.
   * @param prepared Prepared brushes.
   * @param subjectIndex Subject prepared index.
   * @param bounds Bounds of every fragment vertex of the face.
   */
  constructor(
    table: SolidAlgorithmRoutingTable,
    prepared: readonly PreparedBrush[],
    subjectIndex: number,
    bounds: THREE.Box3,
  ) {
    this.table = table;
    this.bounds = bounds;
    this.constantByLookup = table.preparedIndexPerLookup.map((preparedIndex) =>
      this.lookupConstant(preparedIndex, prepared, subjectIndex),
    );
    this.buildSegments();
  }

  /**
   * Routes one fragment.
   *
   * @param classify Classifies the fragment centroid against a peer.
   * @returns Final surface category.
   */
  route(classify: (preparedIndex: number) => SurfaceCategory): SurfaceCategory {
    if (this.table.routingLookups.length === 0) {
      return SurfaceCategory.Outside;
    }
    let state = 0;
    for (const segment of this.segments) {
      state = 'start' in segment ? this.runTransition(segment, state) : this.variableStep(segment, state, classify);
    }
    return state as SurfaceCategory;
  }

  /**
   * Returns whether routes made with this plan stay valid after some peers
   * changed geometry: the table is the same and every changed peer resolved
   * once by the plan still has the same category over the plan bounds.
   *
   * @param table Routing table of this compile.
   * @param prepared Prepared brushes of this compile.
   * @param changedPeerIndices Peers whose geometry changed.
   * @returns True when the resolved peer categories still hold.
   */
  constantsStillHold(
    table: SolidAlgorithmRoutingTable,
    prepared: readonly PreparedBrush[],
    changedPeerIndices: readonly number[],
  ): boolean {
    if (table !== this.table) {
      return false;
    }
    for (const preparedIndex of changedPeerIndices) {
      const constant = this.constantByPeer.get(preparedIndex);
      if (constant === undefined || constant === SOLID_FACE_ROUTE_PLAN_VARIABLE) continue;
      const peer = prepared[preparedIndex];
      if (!peer || this.boundsCategory(peer.brush) !== constant) return false;
    }
    return true;
  }

  /**
   * Resolves the category a lookup peer has for every fragment, or marks it
   * variable.
   *
   * @param preparedIndex Lookup peer prepared index.
   * @param prepared Prepared brushes.
   * @param subjectIndex Subject prepared index.
   * @returns Constant category, or the variable marker.
   */
  private lookupConstant(preparedIndex: number, prepared: readonly PreparedBrush[], subjectIndex: number): number {
    if (preparedIndex === SOLID_ALGORITHM_INFINITE_PREPARED_INDEX) {
      return SurfaceCategory.Inside;
    }
    if (preparedIndex === subjectIndex) {
      return SurfaceCategory.SelfAligned;
    }
    const peer = prepared[preparedIndex];
    const constant = peer ? this.boundsCategory(peer.brush) : SurfaceCategory.Outside;
    this.constantByPeer.set(preparedIndex, constant);
    return constant;
  }

  /**
   * Returns the category every point of the plan bounds has against a brush
   * when it is provably the same, otherwise the variable marker. A point is
   * Outside when one plane is farther than the fat epsilon, and Inside when
   * every plane is farther inside than the fat epsilon.
   *
   * @param brush Peer brush.
   * @returns Outside, Inside, or the variable marker.
   */
  private boundsCategory(brush: SolidBrush): number {
    const limit = SOLID_FAT_PLANE_EPSILON + SOLID_FACE_ROUTE_PLAN_MARGIN;
    let everyPlaneInside = true;
    for (const plane of brush.planes) {
      const [nearest, farthest] = this.planeDistanceRange(plane);
      if (nearest > limit) return SurfaceCategory.Outside;
      if (farthest >= -limit) everyPlaneInside = false;
    }
    return everyPlaneInside ? SurfaceCategory.Inside : SOLID_FACE_ROUTE_PLAN_VARIABLE;
  }

  /**
   * Returns the smallest and largest signed plane distance over the bounds.
   *
   * @param plane Peer plane.
   * @returns Minimum and maximum signed distance.
   */
  private planeDistanceRange(plane: SolidPlane): [number, number] {
    const { min, max } = this.bounds;
    const normal = plane.normal;
    const centerDistance =
      normal.x * (min.x + max.x) * 0.5 + normal.y * (min.y + max.y) * 0.5 + normal.z * (min.z + max.z) * 0.5;
    const reach =
      Math.abs(normal.x) * (max.x - min.x) * 0.5 +
      Math.abs(normal.y) * (max.y - min.y) * 0.5 +
      Math.abs(normal.z) * (max.z - min.z) * 0.5;
    return [centerDistance + plane.offset - reach, centerDistance + plane.offset + reach];
  }

  /** Groups lookups into constant runs and variable steps. */
  private buildSegments(): void {
    let lookupIndex = 0;
    const count = this.constantByLookup.length;
    while (lookupIndex < count) {
      if (this.constantByLookup[lookupIndex] === SOLID_FACE_ROUTE_PLAN_VARIABLE) {
        const preparedIndex = this.table.preparedIndexPerLookup[lookupIndex] ?? SOLID_ALGORITHM_INFINITE_PREPARED_INDEX;
        this.segments.push({ lookupIndex, preparedIndex, outcomeByState: new Map() });
        lookupIndex++;
        continue;
      }
      const start = lookupIndex;
      while (lookupIndex < count && this.constantByLookup[lookupIndex] !== SOLID_FACE_ROUTE_PLAN_VARIABLE)
        lookupIndex++;
      this.segments.push({ start, end: lookupIndex, nextStateByState: new Map() });
    }
  }

  /**
   * Applies a constant run to a state, caching the result per state.
   *
   * @param run Constant run.
   * @param state Incoming state.
   * @returns Outgoing state.
   */
  private runTransition(run: SolidFaceRoutePlanRun, state: number): number {
    const cached = run.nextStateByState.get(state);
    if (cached !== undefined) {
      return cached;
    }
    let next = state;
    for (let lookupIndex = run.start; lookupIndex < run.end; lookupIndex++) {
      const row = this.table.routingLookups[lookupIndex]?.tryGetRoute(this.table.routingRows, next);
      if (row) next = row.at(this.constantByLookup[lookupIndex] ?? SurfaceCategory.Outside);
    }
    run.nextStateByState.set(state, next);
    return next;
  }

  /**
   * Applies one variable lookup, classifying the fragment only when the next
   * state depends on the peer's category.
   *
   * @param step Variable lookup.
   * @param state Incoming state.
   * @param classify Fragment classifier.
   * @returns Outgoing state.
   */
  private variableStep(
    step: SolidFaceRoutePlanVariable,
    state: number,
    classify: (preparedIndex: number) => SurfaceCategory,
  ): number {
    let outcome = step.outcomeByState.get(state);
    if (outcome === undefined) {
      outcome = this.categoryFreeOutcome(step.lookupIndex, state);
      step.outcomeByState.set(state, outcome);
    }
    if (outcome !== SOLID_FACE_ROUTE_PLAN_VARIABLE) {
      return outcome;
    }
    const row = this.table.routingLookups[step.lookupIndex]?.tryGetRoute(this.table.routingRows, state);
    return row ? row.at(classify(step.preparedIndex)) : state;
  }

  /**
   * Returns the state a lookup leads to when it is the same for every category
   * a point classification can produce, or the variable marker otherwise.
   *
   * @param lookupIndex Lookup index.
   * @param state Incoming state.
   * @returns Category-free next state, or the variable marker.
   */
  private categoryFreeOutcome(lookupIndex: number, state: number): number {
    const row = this.table.routingLookups[lookupIndex]?.tryGetRoute(this.table.routingRows, state);
    if (!row) {
      return state;
    }
    const next = row.at(SurfaceCategory.Inside);
    const free =
      row.at(SurfaceCategory.Aligned) === next &&
      row.at(SurfaceCategory.ReverseAligned) === next &&
      row.at(SurfaceCategory.Outside) === next;
    return free ? next : SOLID_FACE_ROUTE_PLAN_VARIABLE;
  }
}
