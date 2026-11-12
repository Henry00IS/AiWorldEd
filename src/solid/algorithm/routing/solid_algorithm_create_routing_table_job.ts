import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidAlgorithmCategoryRoutingRow } from './solid_algorithm_category_routing_row.js';
import { SolidAlgorithmCategoryStackNode } from './solid_algorithm_category_stack_node.js';
import type { SolidAlgorithmCompactNode } from './solid_algorithm_compact_node.js';
import {
  SolidAlgorithmBrushesTouched,
  solidAlgorithmMarkInfiniteBrushTouch,
} from './solid_algorithm_brushes_touched.js';
import { SolidAlgorithmCreateRoutingTableCombine } from './solid_algorithm_create_routing_table_combine.js';
import { SolidAlgorithmIntersectionType } from './solid_algorithm_intersection_type.js';
import { SolidAlgorithmIntersectingReach } from './solid_algorithm_intersecting_reach.js';
import { SolidAlgorithmRoutingLookup } from './solid_algorithm_routing_lookup.js';
import { SolidAlgorithmRoutingTable } from './solid_algorithm_routing_table.js';

/** Event kinds for the CreateRoutingTableJob walk queue. */
enum QueuedEventType {
  GetStackNode = 0,
  Combine = 1,
  ListItem = 2,
}

/** QueuedEvent (explicit layout fields; union by type). */
interface QueuedEvent {
  type: QueuedEventType;
  currIndex: number;
  leftHaveGoneBeyondSelf: number;
  intersectionType: SolidAlgorithmIntersectionType;
  outputStartIndex: number;
  leftStackStartIndex: number;
  rightStackStartIndex: number;
}

/**
 * CreateRoutingTableJob: GetStackNode / ListItem / Combine over the compact
 * hierarchy with BrushesTouchedByBrush locality.
 */
export class SolidAlgorithmCreateRoutingTableJob {
  /**
   * Builds a routing table for one subject brush.
   *
   * @param prepared Prepared brushes.
   * @param subjectIndex Subject prepared index.
   * @param hierarchy Compact hierarchy (root at 0).
   * @param invertedWorld Inverted-world flag.
   * @param boundsPad Bounds pad for touch tests.
   * @param membershipEpsilon Plane epsilon.
   * @returns Routing table for the subject.
   */
  static buildForSubject(
    prepared: readonly PreparedBrush[],
    subjectIndex: number,
    hierarchy: readonly SolidAlgorithmCompactNode[],
    invertedWorld: boolean,
    boundsPad: number,
    membershipEpsilon: number,
  ): SolidAlgorithmRoutingTable {
    if (!prepared[subjectIndex] || hierarchy.length === 0) {
      return SolidAlgorithmRoutingTable.empty(invertedWorld);
    }
    const preparedIndexToNodeId = this.buildPreparedIndexToNodeIdMap(hierarchy);
    const touched = SolidAlgorithmBrushesTouched.buildForSubject(
      prepared,
      subjectIndex,
      hierarchy,
      boundsPad,
      membershipEpsilon,
    );
    solidAlgorithmMarkInfiniteBrushTouch(hierarchy, touched);
    this.untouchOutOfReachIntersecting(prepared, subjectIndex, hierarchy, touched, boundsPad);
    const subjectNodeId = preparedIndexToNodeId.get(subjectIndex);
    if (subjectNodeId === undefined) {
      return SolidAlgorithmRoutingTable.empty(invertedWorld);
    }
    const stack = this.getStackNodes(subjectNodeId, touched, hierarchy);
    return this.buildTableFromStack(stack, preparedIndexToNodeId, invertedWorld);
  }

  /**
   * Marks intersecting nodes that touch the subject but miss the region its
   * surfaces can survive in as untouched (see
   * SolidAlgorithmIntersectingReach).
   *
   * @param prepared Prepared brushes.
   * @param subjectIndex Subject prepared index.
   * @param hierarchy Compact hierarchy.
   * @param touched Touch map, updated in place.
   * @param boundsPad Bounds pad for touch tests.
   */
  private static untouchOutOfReachIntersecting(
    prepared: readonly PreparedBrush[],
    subjectIndex: number,
    hierarchy: readonly SolidAlgorithmCompactNode[],
    touched: SolidAlgorithmBrushesTouched,
    boundsPad: number,
  ): void {
    if (!SolidAlgorithmIntersectingReach.hasIntersecting(hierarchy)) return;
    const touchedIndices = touched.getSpatialPeers().map((peer) => peer.preparedIndex);
    const outOfReach = SolidAlgorithmIntersectingReach.findOutOfReach(
      prepared,
      subjectIndex,
      hierarchy,
      touchedIndices,
      boundsPad,
    );
    for (const nodeId of outOfReach) touched.set(nodeId, SolidAlgorithmIntersectionType.NoIntersection);
  }

  /**
   * Maps prepared brush index → compact node id (one linear pass).
   *
   * @param hierarchy Compact hierarchy.
   * @returns Prepared index to node id map.
   */
  /**
   * Per-hierarchy prepared index to node id maps (hierarchies are immutable
   * once built).
   */
  private static readonly preparedIndexToNodeIdCache = new WeakMap<object, Map<number, number>>();
  /** Inverse maps, keyed by the forward map they were built from. */
  private static readonly nodeIdToPreparedIndexCache = new WeakMap<object, Map<number, number>>();
  private static buildPreparedIndexToNodeIdMap(hierarchy: readonly SolidAlgorithmCompactNode[]): Map<number, number> {
    const known = this.preparedIndexToNodeIdCache.get(hierarchy);
    if (known) return known;
    const built = this.buildPreparedIndexToNodeIdMapUncached(hierarchy);
    this.preparedIndexToNodeIdCache.set(hierarchy, built);
    return built;
  }
  private static buildPreparedIndexToNodeIdMapUncached(
    hierarchy: readonly SolidAlgorithmCompactNode[],
  ): Map<number, number> {
    const map = new Map<number, number>();
    for (const node of hierarchy) {
      if (node.kind === 'brush') {
        map.set(node.preparedIndex, node.nodeId);
      }
    }
    return map;
  }

  /**
   * GetStackNodes: event walk producing CategoryStackNode rows.
   *
   * @param processedNodeId Subject compact node id.
   * @param touched BrushesTouchedByBrush.
   * @param hierarchy Compact hierarchy.
   * @returns Live stack nodes.
   */
  private static getStackNodes(
    processedNodeId: number,
    touched: SolidAlgorithmBrushesTouched,
    hierarchy: readonly SolidAlgorithmCompactNode[],
  ): SolidAlgorithmCategoryStackNode[] {
    const output: SolidAlgorithmCategoryStackNode[] = [];
    const events: QueuedEvent[] = [];
    let haveGoneBeyondSelf = 0;
    let outputLength = 0;
    events.push(this.makeGetStackNode(0, 0, touched.get(hierarchy[0]!.nodeId)));
    while (events.length > 0) {
      const currEvent = events.pop()!;
      if (currEvent.type === QueuedEventType.GetStackNode) {
        outputLength = this.executeGetStackNode(
          currEvent,
          processedNodeId,
          touched,
          hierarchy,
          output,
          outputLength,
          events,
          (value) => {
            haveGoneBeyondSelf = value;
          },
          () => haveGoneBeyondSelf,
        );
      } else if (currEvent.type === QueuedEventType.ListItem) {
        this.executeListItem(currEvent, outputLength, events, haveGoneBeyondSelf);
      } else {
        outputLength = this.executeCombine(currEvent, hierarchy, output, outputLength, haveGoneBeyondSelf);
      }
    }
    if (outputLength === 0) {
      output[outputLength] = new SolidAlgorithmCategoryStackNode(
        0,
        processedNodeId,
        SolidAlgorithmCategoryRoutingRow.AllOutside,
      );
      outputLength = 1;
    }
    return output.slice(0, outputLength);
  }

  /**
   * GetStackNode case.
   *
   * @param currEvent Event.
   * @param processedNodeId Subject node id.
   * @param touched Touch map.
   * @param hierarchy Hierarchy.
   * @param output Stack.
   * @param outputLength Length.
   * @param events Queue.
   * @param setBeyondSelf Beyond-self setter.
   * @param getBeyondSelf Beyond-self getter.
   * @returns New output length.
   */
  private static executeGetStackNode(
    currEvent: QueuedEvent,
    processedNodeId: number,
    touched: SolidAlgorithmBrushesTouched,
    hierarchy: readonly SolidAlgorithmCompactNode[],
    output: SolidAlgorithmCategoryStackNode[],
    outputLength: number,
    events: QueuedEvent[],
    setBeyondSelf: (value: number) => void,
    getBeyondSelf: () => number,
  ): number {
    const intersectionType = currEvent.intersectionType;
    if (
      intersectionType === SolidAlgorithmIntersectionType.NoIntersection ||
      intersectionType === SolidAlgorithmIntersectionType.InvalidValue
    ) {
      return outputLength;
    }
    const currentNode = hierarchy[currEvent.currIndex];
    if (!currentNode) {
      return outputLength;
    }
    if (currentNode.kind === 'brush') {
      return this.appendBrushStackNode(
        currentNode,
        processedNodeId,
        intersectionType,
        output,
        outputLength,
        setBeyondSelf,
        getBeyondSelf,
      );
    }
    return this.queueBranchChildren(currentNode, currEvent, touched, hierarchy, outputLength, events);
  }

  /**
   * Appends one brush CategoryStackNode.
   *
   * @param currentNode Brush node.
   * @param processedNodeId Subject node id.
   * @param intersectionType Touch type.
   * @param output Stack.
   * @param outputLength Length.
   * @param setBeyondSelf Beyond-self setter.
   * @param getBeyondSelf Beyond-self getter.
   * @returns New length.
   */
  private static appendBrushStackNode(
    currentNode: SolidAlgorithmCompactNode,
    processedNodeId: number,
    intersectionType: SolidAlgorithmIntersectionType,
    output: SolidAlgorithmCategoryStackNode[],
    outputLength: number,
    setBeyondSelf: (value: number) => void,
    getBeyondSelf: () => number,
  ): number {
    if (intersectionType === SolidAlgorithmIntersectionType.AInsideB) {
      output[outputLength] = new SolidAlgorithmCategoryStackNode(
        0,
        currentNode.nodeId,
        SolidAlgorithmCategoryRoutingRow.AllInside,
      );
      return outputLength + 1;
    }
    if (intersectionType === SolidAlgorithmIntersectionType.BInsideA) {
      output[outputLength] = new SolidAlgorithmCategoryStackNode(
        0,
        currentNode.nodeId,
        SolidAlgorithmCategoryRoutingRow.AllOutside,
      );
      return outputLength + 1;
    }
    if (processedNodeId === currentNode.nodeId) {
      setBeyondSelf(1);
      output[outputLength] = new SolidAlgorithmCategoryStackNode(
        0,
        currentNode.nodeId,
        SolidAlgorithmCategoryRoutingRow.AllSelfAligned,
      );
      return outputLength + 1;
    }
    if (getBeyondSelf() > 0) {
      setBeyondSelf(2);
    }
    output[outputLength] = new SolidAlgorithmCategoryStackNode(
      0,
      currentNode.nodeId,
      SolidAlgorithmCategoryRoutingRow.Identity,
    );
    return outputLength + 1;
  }

  /**
   * Queues ListItem/GetStackNode for a branch.
   *
   * @param currentNode Branch node.
   * @param currEvent Parent event.
   * @param touched Touch map.
   * @param hierarchy Hierarchy.
   * @param outputLength Current length (kept when branch is empty).
   * @param events Queue.
   * @returns New output length (leftStackStart when children are queued).
   */
  private static queueBranchChildren(
    currentNode: SolidAlgorithmCompactNode,
    currEvent: QueuedEvent,
    touched: SolidAlgorithmBrushesTouched,
    hierarchy: readonly SolidAlgorithmCompactNode[],
    outputLength: number,
    events: QueuedEvent[],
  ): number {
    const nodeCount = currentNode.childCount;
    if (nodeCount === 0) {
      return outputLength;
    }
    let firstIndex = currentNode.childOffset;
    const lastIndex = firstIndex + nodeCount;
    while (
      firstIndex < lastIndex &&
      hierarchy[firstIndex] &&
      hierarchy[firstIndex]!.operation !== SolidOperation.Additive
    ) {
      firstIndex++;
    }
    if (lastIndex - firstIndex <= 0) {
      return outputLength;
    }
    const leftStackStartIndex = currEvent.outputStartIndex;
    // Visit only touched children, in the same descending order a full scan
    // over the branch range would (untouched children never queue events).
    const touchedIndices = touched.hierarchyIndicesIn(hierarchy, firstIndex + 1, lastIndex);
    for (const index of touchedIndices) {
      const child = hierarchy[index];
      if (!child) {
        continue;
      }
      const childType = touched.get(child.nodeId);
      if (
        childType !== SolidAlgorithmIntersectionType.NoIntersection &&
        childType !== SolidAlgorithmIntersectionType.InvalidValue
      ) {
        events.push(this.makeListItem(index, leftStackStartIndex, childType));
      }
    }
    const firstChild = hierarchy[firstIndex];
    if (firstChild) {
      const firstType = touched.get(firstChild.nodeId);
      if (
        firstType !== SolidAlgorithmIntersectionType.NoIntersection &&
        firstType !== SolidAlgorithmIntersectionType.InvalidValue
      ) {
        events.push(this.makeGetStackNode(firstIndex, leftStackStartIndex, firstType));
      }
    }
    return leftStackStartIndex;
  }

  /**
   * ListItem case: queue Combine then GetStackNode (LIFO).
   *
   * @param currEvent ListItem event.
   * @param outputLength Current length.
   * @param events Queue.
   * @param haveGoneBeyondSelf Beyond-self snapshot.
   */
  private static executeListItem(
    currEvent: QueuedEvent,
    outputLength: number,
    events: QueuedEvent[],
    haveGoneBeyondSelf: number,
  ): void {
    const rightStackStartIndex = outputLength;
    events.push(
      this.makeCombine(currEvent.currIndex, haveGoneBeyondSelf, currEvent.leftStackStartIndex, rightStackStartIndex),
    );
    events.push(this.makeGetStackNode(currEvent.currIndex, rightStackStartIndex, currEvent.intersectionType));
  }

  /**
   * Combine case.
   *
   * @param currEvent Combine event.
   * @param hierarchy Hierarchy.
   * @param output Stack.
   * @param outputLength Length.
   * @param haveGoneBeyondSelf Beyond-self flag.
   * @returns New length.
   */
  private static executeCombine(
    currEvent: QueuedEvent,
    hierarchy: readonly SolidAlgorithmCompactNode[],
    output: SolidAlgorithmCategoryStackNode[],
    outputLength: number,
    haveGoneBeyondSelf: number,
  ): number {
    const operation = hierarchy[currEvent.currIndex]?.operation ?? SolidOperation.Additive;
    const leftCount = currEvent.rightStackStartIndex - currEvent.leftStackStartIndex;
    const rightCount = outputLength - currEvent.rightStackStartIndex;
    if (leftCount === 0) {
      if (rightCount === 0) {
        return currEvent.leftStackStartIndex;
      }
      if (operation === SolidOperation.Additive) {
        return outputLength;
      }
      return currEvent.rightStackStartIndex;
    }
    if (rightCount === 0) {
      if (operation === SolidOperation.Intersecting) {
        return currEvent.leftStackStartIndex;
      }
      return currEvent.rightStackStartIndex;
    }
    const rightStack: SolidAlgorithmCategoryStackNode[] = [];
    for (let index = currEvent.rightStackStartIndex; index < outputLength; index++) {
      rightStack.push(output[index]!.clone());
    }
    const leftStackEnd = { value: currEvent.rightStackStartIndex };
    SolidAlgorithmCreateRoutingTableCombine.combine(
      output,
      currEvent.leftHaveGoneBeyondSelf,
      currEvent.leftStackStartIndex,
      leftStackEnd,
      rightStack,
      haveGoneBeyondSelf,
      rightStack.length,
      operation,
    );
    return leftStackEnd.value;
  }

  /**
   * Builds RoutingTable from live stack.
   *
   * @param stack Live stack.
   * @param preparedIndexToNodeId Prepared index → node id map (inverted for
   *   preparedIndexPerLookup).
   * @param invertedWorld Inverted-world flag.
   * @returns Routing table.
   */
  private static buildTableFromStack(
    stack: SolidAlgorithmCategoryStackNode[],
    preparedIndexToNodeId: ReadonlyMap<number, number>,
    invertedWorld: boolean,
  ): SolidAlgorithmRoutingTable {
    if (stack.length === 0) {
      return SolidAlgorithmRoutingTable.empty(invertedWorld);
    }
    const nodeIdToPreparedIndex = this.invertPreparedIndexMap(preparedIndexToNodeId);
    const routingRows = stack.map((node) => node.routingRow);
    const lookups: SolidAlgorithmRoutingLookup[] = [];
    const preparedIndexPerLookup: number[] = [];
    let index = 0;
    while (index < stack.length) {
      const cuttingNodeId = stack[index]!.nodeIdValue;
      const startIndex = index;
      index++;
      while (index < stack.length && stack[index]!.nodeIdValue === cuttingNodeId) {
        index++;
      }
      lookups.push(new SolidAlgorithmRoutingLookup(startIndex, index));
      preparedIndexPerLookup.push(nodeIdToPreparedIndex.get(cuttingNodeId) ?? -2);
    }
    let minNodeId = 0;
    let maxNodeId = 0;
    for (const lookup of lookups) {
      const nodeId = stack[lookup.startIndex]!.nodeIdValue;
      minNodeId = Math.min(minNodeId, nodeId);
      maxNodeId = Math.max(maxNodeId, nodeId);
    }
    const mapSize = maxNodeId + 1 - minNodeId;
    const nodeIdToTableIndex = new Array<number>(mapSize).fill(-1);
    for (let lookupIndex = 0; lookupIndex < lookups.length; lookupIndex++) {
      const nodeId = stack[lookups[lookupIndex]!.startIndex]!.nodeIdValue;
      nodeIdToTableIndex[nodeId - minNodeId] = lookupIndex;
    }
    return new SolidAlgorithmRoutingTable(
      routingRows,
      lookups,
      preparedIndexPerLookup,
      nodeIdToTableIndex,
      minNodeId,
      invertedWorld,
    );
  }

  /**
   * Inverts prepared-index → node-id into node-id → prepared-index.
   *
   * @param preparedIndexToNodeId Forward map.
   * @returns Inverted map.
   */
  private static invertPreparedIndexMap(preparedIndexToNodeId: ReadonlyMap<number, number>): Map<number, number> {
    const known = this.nodeIdToPreparedIndexCache.get(preparedIndexToNodeId);
    if (known) return known;
    const built = this.invertPreparedIndexMapUncached(preparedIndexToNodeId);
    this.nodeIdToPreparedIndexCache.set(preparedIndexToNodeId, built);
    return built;
  }
  private static invertPreparedIndexMapUncached(
    preparedIndexToNodeId: ReadonlyMap<number, number>,
  ): Map<number, number> {
    const inverted = new Map<number, number>();
    for (const [preparedIndex, nodeId] of preparedIndexToNodeId) {
      inverted.set(nodeId, preparedIndex);
    }
    return inverted;
  }

  /**
   * Creates a GetStackNode event.
   *
   * @param currIndex Hierarchy index.
   * @param outputStartIndex Output start.
   * @param intersectionType Touch type.
   * @returns Event.
   */
  private static makeGetStackNode(
    currIndex: number,
    outputStartIndex: number,
    intersectionType: SolidAlgorithmIntersectionType,
  ): QueuedEvent {
    return {
      type: QueuedEventType.GetStackNode,
      currIndex,
      leftHaveGoneBeyondSelf: 0,
      intersectionType,
      outputStartIndex,
      leftStackStartIndex: 0,
      rightStackStartIndex: 0,
    };
  }

  /**
   * Creates a ListItem event.
   *
   * @param currIndex Hierarchy index.
   * @param leftStackStartIndex Left start.
   * @param intersectionType Touch type.
   * @returns Event.
   */
  private static makeListItem(
    currIndex: number,
    leftStackStartIndex: number,
    intersectionType: SolidAlgorithmIntersectionType,
  ): QueuedEvent {
    return {
      type: QueuedEventType.ListItem,
      currIndex,
      leftHaveGoneBeyondSelf: 0,
      intersectionType,
      outputStartIndex: 0,
      leftStackStartIndex,
      rightStackStartIndex: 0,
    };
  }

  /**
   * Creates a Combine event.
   *
   * @param currIndex Hierarchy index.
   * @param leftHaveGoneBeyondSelf Beyond-self snapshot.
   * @param leftStackStartIndex Left start.
   * @param rightStackStartIndex Right start.
   * @returns Event.
   */
  private static makeCombine(
    currIndex: number,
    leftHaveGoneBeyondSelf: number,
    leftStackStartIndex: number,
    rightStackStartIndex: number,
  ): QueuedEvent {
    return {
      type: QueuedEventType.Combine,
      currIndex,
      leftHaveGoneBeyondSelf,
      intersectionType: SolidAlgorithmIntersectionType.InvalidValue,
      outputStartIndex: 0,
      leftStackStartIndex,
      rightStackStartIndex,
    };
  }
}
