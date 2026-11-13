import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import type { SolidAlgorithmCompactNode } from './solid_algorithm_compact_node.js';
import { SOLID_ALGORITHM_INFINITE_PREPARED_INDEX } from './solid_algorithm_compact_node.js';
import { SolidAlgorithmBrushIntersection } from './solid_algorithm_brush_intersection.js';
import { SolidAlgorithmIntersectionType } from './solid_algorithm_intersection_type.js';
import { SolidAlgorithmIntersectingReach } from './solid_algorithm_intersecting_reach.js';

/** One intersecting node with the brushes it is made of. */
interface ConfiningNode {
  index: number;
  nodeId: number;
  parentIndex: number;
  brushes: ReadonlySet<number>;
  unbounded: boolean;
}

/** Per-hierarchy lookup data. */
interface ConfiningLayout {
  nodes: ConfiningNode[];
  nodeIndexByPrepared: Map<number, number>;
}

/**
 * Finds touching peers whose whole effect is confined to an intersecting node
 * the subject does not touch.
 *
 * Under the touch-only rule an intersecting node clips the brushes it touches
 * and leaves the others alone. A peer it clips only keeps geometry inside that
 * node, so when the subject does not touch the node the clipped peer cannot
 * cover, carve, or clip any part of the subject. Leaving such a peer in the
 * subject's routing would remove the subject's surfaces where the peer used to
 * be while the peer's own surfaces there are clipped away, which leaves an open
 * hole. Dropping it keeps both sides consistent and the mesh closed.
 */
export class SolidAlgorithmConfinedPeers {
  private static readonly layoutCache = new WeakMap<object, ConfiningLayout | null>();

  /**
   * Returns the prepared indices of touching peers to treat as untouched.
   *
   * @param prepared Prepared brushes.
   * @param subjectIndex Subject prepared index.
   * @param hierarchy Compact hierarchy (root at 0).
   * @param touchingPeers Prepared indices of peers touching the subject.
   * @param pad Bounds pad used for touch tests.
   * @param epsilon Plane epsilon used for touch tests.
   * @returns Prepared indices to drop (empty in the common case).
   */
  static find(
    prepared: readonly PreparedBrush[],
    subjectIndex: number,
    hierarchy: readonly SolidAlgorithmCompactNode[],
    touchingPeers: readonly number[],
    pad: number,
    epsilon: number,
  ): number[] {
    if (touchingPeers.length === 0) return [];
    const layout = this.layout(hierarchy);
    if (!layout) return [];
    const away = this.nodesAwayFromSubject(layout, subjectIndex, touchingPeers);
    if (away.length === 0) return [];
    const dropped: number[] = [];
    for (const peerIndex of touchingPeers) {
      const peerNode = layout.nodeIndexByPrepared.get(peerIndex);
      if (peerNode === undefined) continue;
      if (this.isConfined(prepared, hierarchy, peerIndex, peerNode, away, pad, epsilon)) dropped.push(peerIndex);
    }
    return dropped;
  }

  /**
   * Intersecting nodes made only of brushes that do not touch the subject.
   *
   * @param layout Hierarchy layout.
   * @param subjectIndex Subject prepared index.
   * @param touchingPeers Peers touching the subject.
   * @returns Nodes the subject does not touch.
   */
  private static nodesAwayFromSubject(
    layout: ConfiningLayout,
    subjectIndex: number,
    touchingPeers: readonly number[],
  ): ConfiningNode[] {
    const away: ConfiningNode[] = [];
    for (const node of layout.nodes) {
      if (node.unbounded || node.brushes.has(subjectIndex)) continue;
      if (touchingPeers.some((peer) => node.brushes.has(peer))) continue;
      away.push(node);
    }
    return away;
  }

  /**
   * Whether some node in `away` clips the peer (the peer lies in its operand
   * and touches it, and the node is not out of the peer's reach).
   *
   * @param prepared Prepared brushes.
   * @param hierarchy Compact hierarchy.
   * @param peerIndex Peer prepared index.
   * @param peerNode Peer hierarchy index.
   * @param away Nodes that do not touch the subject.
   * @param pad Bounds pad.
   * @param epsilon Plane epsilon.
   * @returns True when the peer only survives inside a node away from the
   *   subject.
   */
  private static isConfined(
    prepared: readonly PreparedBrush[],
    hierarchy: readonly SolidAlgorithmCompactNode[],
    peerIndex: number,
    peerNode: number,
    away: readonly ConfiningNode[],
    pad: number,
    epsilon: number,
  ): boolean {
    const peer = prepared[peerIndex];
    if (!peer) return false;
    let peerTouching: number[] | null = null;
    for (const node of away) {
      if (!this.isInOperand(hierarchy, peerNode, node)) continue;
      if (!this.touchesNode(prepared, peer, node, pad, epsilon)) continue;
      peerTouching ??= this.touchingOf(prepared, peer, pad, epsilon);
      const outOfReach = SolidAlgorithmIntersectingReach.findOutOfReach(
        prepared,
        peerIndex,
        hierarchy,
        peerTouching,
        pad,
      );
      if (!outOfReach.includes(node.nodeId)) return true;
    }
    return false;
  }

  /**
   * Whether the peer sits under a sibling that comes before the node, i.e. in
   * the operand the node is intersected with.
   *
   * @param hierarchy Compact hierarchy.
   * @param peerNode Peer hierarchy index.
   * @param node Intersecting node.
   * @returns True when the node applies to the peer.
   */
  private static isInOperand(
    hierarchy: readonly SolidAlgorithmCompactNode[],
    peerNode: number,
    node: ConfiningNode,
  ): boolean {
    for (let index = peerNode; index >= 0; index = hierarchy[index]!.parentIndex) {
      if (hierarchy[index]!.parentIndex === node.parentIndex) return index < node.index;
    }
    return false;
  }

  /**
   * Whether any brush of the node touches the peer.
   *
   * @param prepared Prepared brushes.
   * @param peer Peer brush.
   * @param node Intersecting node.
   * @param pad Bounds pad.
   * @param epsilon Plane epsilon.
   * @returns True when touching.
   */
  private static touchesNode(
    prepared: readonly PreparedBrush[],
    peer: PreparedBrush,
    node: ConfiningNode,
    pad: number,
    epsilon: number,
  ): boolean {
    for (const other of peer.overlappingPeerIndices) {
      if (!node.brushes.has(other)) continue;
      if (this.touches(SolidAlgorithmBrushIntersection.classify(peer, other, prepared, pad, epsilon))) return true;
    }
    return false;
  }

  /**
   * Prepared indices of the brushes touching a peer.
   *
   * @param prepared Prepared brushes.
   * @param peer Peer brush.
   * @param pad Bounds pad.
   * @param epsilon Plane epsilon.
   * @returns Touching prepared indices.
   */
  private static touchingOf(
    prepared: readonly PreparedBrush[],
    peer: PreparedBrush,
    pad: number,
    epsilon: number,
  ): number[] {
    const out: number[] = [];
    for (const other of peer.overlappingPeerIndices) {
      if (this.touches(SolidAlgorithmBrushIntersection.classify(peer, other, prepared, pad, epsilon))) out.push(other);
    }
    return out;
  }

  private static touches(type: SolidAlgorithmIntersectionType): boolean {
    return (
      type !== SolidAlgorithmIntersectionType.NoIntersection && type !== SolidAlgorithmIntersectionType.InvalidValue
    );
  }

  /**
   * Intersecting nodes with their brushes, cached per hierarchy (null when the
   * hierarchy has none).
   *
   * @param hierarchy Compact hierarchy.
   * @returns Layout or null.
   */
  private static layout(hierarchy: readonly SolidAlgorithmCompactNode[]): ConfiningLayout | null {
    const known = this.layoutCache.get(hierarchy);
    if (known !== undefined) return known;
    const nodes: ConfiningNode[] = [];
    const nodeIndexByPrepared = new Map<number, number>();
    for (let index = 0; index < hierarchy.length; index++) {
      const node = hierarchy[index]!;
      if (node.kind === 'brush') nodeIndexByPrepared.set(node.preparedIndex, index);
      if (node.parentIndex < 0 || node.operation !== SolidOperation.Intersecting) continue;
      const brushes = new Set<number>();
      this.collectBrushes(hierarchy, index, brushes);
      nodes.push({
        index,
        nodeId: node.nodeId,
        parentIndex: node.parentIndex,
        brushes,
        unbounded: brushes.has(SOLID_ALGORITHM_INFINITE_PREPARED_INDEX),
      });
    }
    const layout = nodes.length > 0 ? { nodes, nodeIndexByPrepared } : null;
    this.layoutCache.set(hierarchy, layout);
    return layout;
  }

  /**
   * Collects the prepared indices of all brushes at or below a node.
   *
   * @param hierarchy Compact hierarchy.
   * @param index Node hierarchy index.
   * @param out Destination set.
   */
  private static collectBrushes(
    hierarchy: readonly SolidAlgorithmCompactNode[],
    index: number,
    out: Set<number>,
  ): void {
    const node = hierarchy[index]!;
    if (node.kind === 'brush') {
      out.add(node.preparedIndex);
      return;
    }
    for (let child = node.childOffset; child < node.childOffset + node.childCount; child++) {
      this.collectBrushes(hierarchy, child, out);
    }
  }
}
