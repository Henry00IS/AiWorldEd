import * as THREE from 'three';
import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import type { SolidAlgorithmCompactNode } from './solid_algorithm_compact_node.js';
import { SOLID_ALGORITHM_INFINITE_PREPARED_INDEX } from './solid_algorithm_compact_node.js';

/**
 * One intersecting sibling that constrains the subject, with the bounds of its
 * touched brushes.
 */
interface ReachCandidate {
  nodeId: number;
  bounds: THREE.Box3;
}

/**
 * Touched brushes grouped by the sibling of the subject's chain that contains
 * them.
 */
interface ReachLevels {
  /**
   * Hierarchy index of the chain node per level (subject first, root child
   * last).
   */
  chain: number[];
  /**
   * Per level: sibling hierarchy index → union of touched brush bounds below
   * it.
   */
  boxes: Map<number, THREE.Box3>[];
}

/**
 * Finds intersecting nodes that touch a subject brush but cannot reach the
 * region where the subject's surfaces survive.
 *
 * When the subject sits under an intersecting node, its surfaces only survive
 * inside the operand that node is intersected with. Under the touch-only rule
 * an intersecting node only affects geometry it touches, so a node whose bounds
 * miss that survival region is treated as untouched. Without this a brush that
 * reaches the node while its surviving part does not would lose every surface,
 * while the brushes around it (which do not touch the node) keep theirs.
 */
export class SolidAlgorithmIntersectingReach {
  private static readonly lastIntersectingChildCache = new WeakMap<object, Int32Array>();
  private static readonly hasIntersectingCache = new WeakMap<object, boolean>();

  /**
   * Returns node ids of intersecting nodes the subject should treat as
   * untouched.
   *
   * @param prepared Prepared brushes.
   * @param subjectIndex Subject prepared index.
   * @param hierarchy Compact hierarchy (root at 0).
   * @param touchedPreparedIndices Prepared indices of brushes touching the
   *   subject.
   * @param pad Bounds pad used for touch tests.
   * @returns Node ids to drop (empty in the common case).
   */
  static findOutOfReach(
    prepared: readonly PreparedBrush[],
    subjectIndex: number,
    hierarchy: readonly SolidAlgorithmCompactNode[],
    touchedPreparedIndices: readonly number[],
    pad: number,
  ): number[] {
    if (!this.hasIntersecting(hierarchy)) return [];
    const subjectNodeIndex = this.nodeIndexByPrepared(hierarchy).get(subjectIndex) ?? -1;
    if (subjectNodeIndex < 0 || !this.hasLaterIntersecting(hierarchy, subjectNodeIndex)) return [];
    const levels = this.groupTouched(prepared, hierarchy, subjectNodeIndex, touchedPreparedIndices, pad);
    const region = prepared[subjectIndex]!.bounds.clone().expandByScalar(pad);
    const candidates = this.collectCandidates(hierarchy, levels, region);
    return this.dropUnreachable(region, candidates);
  }

  /**
   * Returns whether any ancestor-or-self of the subject has a later
   * intersecting sibling (O(depth), cached per hierarchy).
   *
   * @param hierarchy Compact hierarchy.
   * @param nodeIndex Subject hierarchy index.
   * @returns True when an intersecting node can constrain the subject.
   */
  private static hasLaterIntersecting(hierarchy: readonly SolidAlgorithmCompactNode[], nodeIndex: number): boolean {
    const last = this.lastIntersectingChildren(hierarchy);
    for (let index = nodeIndex; index >= 0; index = hierarchy[index]!.parentIndex) {
      const parentIndex = hierarchy[index]!.parentIndex;
      if (parentIndex >= 0 && last[parentIndex]! > index) return true;
    }
    return false;
  }

  /**
   * Per branch: hierarchy index of its last intersecting child, or -1.
   *
   * @param hierarchy Compact hierarchy.
   * @returns Array indexed by hierarchy index.
   */
  /**
   * Returns whether the hierarchy has any intersecting node at all (cached per
   * hierarchy), so trees without one skip every reach test.
   *
   * @param hierarchy Compact hierarchy.
   * @returns True when some node intersects.
   */
  static hasIntersecting(hierarchy: readonly SolidAlgorithmCompactNode[]): boolean {
    let known = this.hasIntersectingCache.get(hierarchy);
    if (known === undefined) {
      known = this.lastIntersectingChildren(hierarchy).some((index) => index >= 0);
      this.hasIntersectingCache.set(hierarchy, known);
    }
    return known;
  }

  private static lastIntersectingChildren(hierarchy: readonly SolidAlgorithmCompactNode[]): Int32Array {
    let last = this.lastIntersectingChildCache.get(hierarchy);
    if (last) return last;
    last = new Int32Array(hierarchy.length).fill(-1);
    for (let index = 0; index < hierarchy.length; index++) {
      const node = hierarchy[index]!;
      if (node.parentIndex >= 0 && node.operation === SolidOperation.Intersecting) {
        last[node.parentIndex] = Math.max(last[node.parentIndex]!, index);
      }
    }
    this.lastIntersectingChildCache.set(hierarchy, last);
    return last;
  }

  /**
   * Groups touched brushes by the sibling of the subject chain they sit under.
   *
   * @param prepared Prepared brushes.
   * @param hierarchy Compact hierarchy.
   * @param subjectNodeIndex Subject hierarchy index.
   * @param touched Touched prepared indices.
   * @param pad Bounds pad.
   * @returns Chain and per-level sibling boxes.
   */
  private static groupTouched(
    prepared: readonly PreparedBrush[],
    hierarchy: readonly SolidAlgorithmCompactNode[],
    subjectNodeIndex: number,
    touched: readonly number[],
    pad: number,
  ): ReachLevels {
    const chain: number[] = [];
    for (let index = subjectNodeIndex; index >= 0; index = hierarchy[index]!.parentIndex) chain.push(index);
    const levelByParent = new Map<number, number>();
    for (let level = 0; level + 1 < chain.length; level++) levelByParent.set(chain[level + 1]!, level);
    const boxes = chain.map(() => new Map<number, THREE.Box3>());
    const nodeIndexByPrepared = this.nodeIndexByPrepared(hierarchy);
    for (const preparedIndex of touched) {
      const nodeIndex = nodeIndexByPrepared.get(preparedIndex);
      const peer = prepared[preparedIndex];
      if (nodeIndex === undefined || !peer) continue;
      this.addToLevel(hierarchy, chain, levelByParent, boxes, nodeIndex, peer.bounds.clone().expandByScalar(pad));
    }
    return { chain, boxes };
  }

  private static readonly nodeIndexByPreparedCache = new WeakMap<object, Map<number, number>>();

  /**
   * Prepared index → hierarchy index (cached per hierarchy).
   *
   * @param hierarchy Compact hierarchy.
   * @returns Lookup map.
   */
  private static nodeIndexByPrepared(hierarchy: readonly SolidAlgorithmCompactNode[]): Map<number, number> {
    let map = this.nodeIndexByPreparedCache.get(hierarchy);
    if (map) return map;
    map = new Map();
    for (let index = 0; index < hierarchy.length; index++) {
      if (hierarchy[index]!.kind === 'brush') map.set(hierarchy[index]!.preparedIndex, index);
    }
    this.nodeIndexByPreparedCache.set(hierarchy, map);
    return map;
  }

  /**
   * Adds one touched brush box to the sibling of the chain that contains it.
   *
   * @param hierarchy Compact hierarchy.
   * @param chain Subject chain.
   * @param levelByParent Chain parent index → level.
   * @param boxes Per-level boxes.
   * @param nodeIndex Touched brush hierarchy index.
   * @param box Touched brush bounds (padded).
   */
  private static addToLevel(
    hierarchy: readonly SolidAlgorithmCompactNode[],
    chain: readonly number[],
    levelByParent: ReadonlyMap<number, number>,
    boxes: Map<number, THREE.Box3>[],
    nodeIndex: number,
    box: THREE.Box3,
  ): void {
    for (let index = nodeIndex; index >= 0; index = hierarchy[index]!.parentIndex) {
      const level = levelByParent.get(hierarchy[index]!.parentIndex);
      if (level === undefined) continue;
      if (index === chain[level]) return;
      const known = boxes[level]!.get(index);
      if (known) known.union(box);
      else boxes[level]!.set(index, box);
      return;
    }
  }

  /**
   * Narrows the region by intersected operands and collects later intersecting
   * siblings as candidates.
   *
   * @param hierarchy Compact hierarchy.
   * @param levels Grouped touched boxes.
   * @param region Subject region, narrowed in place.
   * @returns Candidates.
   */
  private static collectCandidates(
    hierarchy: readonly SolidAlgorithmCompactNode[],
    levels: ReachLevels,
    region: THREE.Box3,
  ): ReachCandidate[] {
    const candidates: ReachCandidate[] = [];
    for (let level = 0; level + 1 < levels.chain.length; level++) {
      const chainIndex = levels.chain[level]!;
      if (hierarchy[chainIndex]!.operation === SolidOperation.Intersecting) {
        this.narrowByLeftOperand(hierarchy, chainIndex, levels.boxes[level]!, region);
      }
      for (const [siblingIndex, box] of levels.boxes[level]!) {
        const sibling = hierarchy[siblingIndex]!;
        if (siblingIndex > chainIndex && sibling.operation === SolidOperation.Intersecting) {
          candidates.push({ nodeId: sibling.nodeId, bounds: box });
        }
      }
    }
    return candidates;
  }

  /**
   * Narrows the region to the touched operand an intersecting chain node is
   * intersected with (siblings before it), unless that operand is unbounded.
   *
   * @param hierarchy Compact hierarchy.
   * @param chainIndex Intersecting chain node index.
   * @param boxes Sibling boxes at this level.
   * @param region Region narrowed in place.
   */
  private static narrowByLeftOperand(
    hierarchy: readonly SolidAlgorithmCompactNode[],
    chainIndex: number,
    boxes: ReadonlyMap<number, THREE.Box3>,
    region: THREE.Box3,
  ): void {
    const parent = hierarchy[hierarchy[chainIndex]!.parentIndex]!;
    for (let index = parent.childOffset; index < chainIndex; index++) {
      const node = hierarchy[index]!;
      if (node.kind === 'brush' && node.preparedIndex === SOLID_ALGORITHM_INFINITE_PREPARED_INDEX) return;
    }
    const left = new THREE.Box3();
    for (const [siblingIndex, box] of boxes) if (siblingIndex < chainIndex) left.union(box);
    if (!left.isEmpty()) region.intersect(left);
  }

  /**
   * Drops candidates whose bounds miss the survival region. Only the operands
   * the subject's own chain is intersected with narrow the region; other later
   * intersecting siblings are candidates themselves and never narrow it.
   *
   * @param region Subject survival region.
   * @param candidates Candidates.
   * @returns Dropped node ids.
   */
  private static dropUnreachable(region: THREE.Box3, candidates: readonly ReachCandidate[]): number[] {
    const dropped: number[] = [];
    if (region.isEmpty()) return dropped;
    for (const candidate of candidates) {
      if (!region.intersectsBox(candidate.bounds)) dropped.push(candidate.nodeId);
    }
    return dropped;
  }
}
