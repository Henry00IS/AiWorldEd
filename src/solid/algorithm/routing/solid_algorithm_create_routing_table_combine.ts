import { SolidOperation } from '@/solid/types/solid_operation.js';
import {
  SOLID_ALGORITHM_CATEGORY_ROUTING_ROW_LENGTH,
  SolidAlgorithmCategoryRoutingRow,
  solidAlgorithmOperationTableIndex,
} from './solid_algorithm_category_routing_row.js';
import { SolidAlgorithmCategoryStackNode } from './solid_algorithm_category_stack_node.js';

/**
 * Merges left and right category stacks for one hierarchy child operation, with
 * row dedup and index remapping.
 */
export class SolidAlgorithmCreateRoutingTableCombine {
  /**
   * Combines rightStack into leftStack in place using the child operation.
   *
   * @param leftStack Mutable left/output stack.
   * @param leftHaveGoneBeyondSelf Left-side beyond-self flag snapshot.
   * @param leftStackStart Start index of the left region in leftStack.
   * @param leftStackEnd Exclusive end of left region (mutated).
   * @param rightStack Right stack copy.
   * @param rightHaveGoneBeyondSelf Right-side beyond-self flag (currently
   *   unused).
   * @param rightStackLength Live length of rightStack.
   * @param operation Child CSG operation tying the stacks.
   */
  static combine(
    leftStack: SolidAlgorithmCategoryStackNode[],
    leftHaveGoneBeyondSelf: number,
    leftStackStart: number,
    leftStackEnd: { value: number },
    rightStack: SolidAlgorithmCategoryStackNode[],
    rightHaveGoneBeyondSelf: number,
    rightStackLength: number,
    operation: SolidOperation,
  ): void {
    void rightHaveGoneBeyondSelf;
    if (rightStackLength <= 0) {
      return;
    }
    const routingSteps = this.countRoutingSteps(rightStack, rightStackLength);
    const combineUsedIndices = new Set<number>();
    this.seedUsedIndices(leftStack, leftStackStart, leftStackEnd.value, combineUsedIndices);
    this.duplicateAndBake(
      leftStack,
      leftStackStart,
      leftStackEnd,
      rightStack,
      rightStackLength,
      routingSteps,
      operation,
      leftHaveGoneBeyondSelf,
      combineUsedIndices,
    );
  }

  /**
   * Counts consecutive row runs per unique node id on the right stack.
   *
   * @param rightStack Right stack.
   * @param rightStackLength Live length.
   * @returns Per-node row counts in order.
   */
  private static countRoutingSteps(rightStack: SolidAlgorithmCategoryStackNode[], rightStackLength: number): number[] {
    const steps: number[] = [];
    let rightNodeId = rightStack[0]!.nodeIdValue;
    let counter = 1;
    for (let index = 1; index < rightStackLength; index++) {
      if (rightNodeId !== rightStack[index]!.nodeIdValue) {
        steps.push(counter);
        counter = 0;
        rightNodeId = rightStack[index]!.nodeIdValue;
      }
      counter++;
    }
    steps.push(counter);
    return steps;
  }

  /**
   * Seeds combineUsedIndices from the last left-stack node rows (or all columns
   * when the left stack is empty).
   *
   * @param leftStack Left stack.
   * @param leftStackStart Left region start.
   * @param leftStackEnd Left region end.
   * @param combineUsedIndices Destination set.
   */
  private static seedUsedIndices(
    leftStack: SolidAlgorithmCategoryStackNode[],
    leftStackStart: number,
    leftStackEnd: number,
    combineUsedIndices: Set<number>,
  ): void {
    const leftStackCount = leftStackEnd - leftStackStart;
    if (leftStackCount === 0) {
      for (let column = 0; column < SOLID_ALGORITHM_CATEGORY_ROUTING_ROW_LENGTH; column++) {
        combineUsedIndices.add(column);
      }
      return;
    }
    let prevNodeIndex = leftStackEnd - 1;
    while (prevNodeIndex > leftStackStart) {
      if (leftStack[prevNodeIndex - 1]!.nodeIdValue !== leftStack[prevNodeIndex]!.nodeIdValue) {
        break;
      }
      prevNodeIndex--;
    }
    for (let index = prevNodeIndex; index < leftStackEnd; index++) {
      const row = leftStack[index]!.routingRow;
      for (let column = 0; column < SOLID_ALGORITHM_CATEGORY_ROUTING_ROW_LENGTH; column++) {
        combineUsedIndices.add(row.at(column));
      }
    }
  }

  /**
   * Duplicates intermediate right nodes and bakes the operation on the last
   * right node.
   *
   * @param leftStack Output stack.
   * @param leftStackStart Output region start.
   * @param leftStackEnd Mutable end.
   * @param rightStack Right stack.
   * @param rightStackLength Right length.
   * @param routingSteps Per-node row counts.
   * @param operation Child operation.
   * @param leftHaveGoneBeyondSelf Left-side beyond-self flag (currently
   *   unused).
   * @param combineUsedIndices Live destination set.
   */
  private static duplicateAndBake(
    leftStack: SolidAlgorithmCategoryStackNode[],
    leftStackStart: number,
    leftStackEnd: { value: number },
    rightStack: SolidAlgorithmCategoryStackNode[],
    rightStackLength: number,
    routingSteps: number[],
    operation: SolidOperation,
    leftHaveGoneBeyondSelf: number,
    combineUsedIndices: Set<number>,
  ): void {
    void leftHaveGoneBeyondSelf;
    void rightStackLength;
    let startSearchRowIndex = leftStackEnd.value;
    let prevNodeIndex = this.findLastLeftNodeStart(leftStack, leftStackStart, startSearchRowIndex);
    let startRightStackRowIndex = 0;
    let routingLength = routingSteps[0]!;
    const combineIndexRemap = new Map<number, number>();
    for (let stackIndex = 1; stackIndex < routingSteps.length; stackIndex++) {
      const routingStep = routingSteps[stackIndex]!;
      const endRight = startRightStackRowIndex + routingLength;
      this.duplicateIntermediateNode(
        leftStack,
        leftStackEnd,
        startSearchRowIndex,
        rightStack,
        startRightStackRowIndex,
        endRight,
        routingStep,
        combineUsedIndices,
        combineIndexRemap,
      );
      if (prevNodeIndex >= leftStackStart) {
        this.remapIndicesOrAbort(leftStack, combineIndexRemap, prevNodeIndex, startSearchRowIndex);
      }
      combineIndexRemap.clear();
      combineUsedIndices.clear();
      this.collectUsedFromRange(leftStack, startSearchRowIndex, leftStackEnd.value, combineUsedIndices);
      prevNodeIndex = startSearchRowIndex;
      startSearchRowIndex = leftStackEnd.value;
      startRightStackRowIndex += routingLength;
      routingLength = routingStep;
    }
    this.bakeFinalNode(
      leftStack,
      leftStackEnd,
      startSearchRowIndex,
      rightStack,
      startRightStackRowIndex,
      startRightStackRowIndex + routingLength,
      operation,
      combineUsedIndices,
      combineIndexRemap,
    );
    this.finalizeRemapAndTrim(
      leftStack,
      leftStackStart,
      prevNodeIndex,
      startSearchRowIndex,
      leftStackEnd,
      combineIndexRemap,
    );
  }

  /**
   * Walks back from the end of the left stack to the first row of the last node
   * that shares the same node id.
   *
   * @param leftStack Left stack.
   * @param leftStackStart Left region start.
   * @param leftStackEnd Exclusive end of the left region.
   * @returns Start index of the last left node, or leftStackEnd - 1 when empty.
   */
  private static findLastLeftNodeStart(
    leftStack: SolidAlgorithmCategoryStackNode[],
    leftStackStart: number,
    leftStackEnd: number,
  ): number {
    if (leftStackEnd <= leftStackStart) {
      return leftStackEnd - 1;
    }
    let prevNodeIndex = leftStackEnd - 1;
    while (prevNodeIndex > leftStackStart) {
      if (leftStack[prevNodeIndex - 1]!.nodeIdValue !== leftStack[prevNodeIndex]!.nodeIdValue) {
        break;
      }
      prevNodeIndex--;
    }
    return prevNodeIndex;
  }

  /**
   * Duplicates one intermediate right-node block once per routing-row column,
   * applying a stride offset derived from the next node row count.
   *
   * @param leftStack Output stack.
   * @param leftStackEnd Mutable end.
   * @param startSearchRowIndex Dedup search start.
   * @param rightStack Right stack.
   * @param startRight Start right index.
   * @param endRight End right index.
   * @param routingStep Next node row count (offset stride).
   * @param combineUsedIndices Used destination set.
   * @param combineIndexRemap Remap from old vIndex to new input plus one.
   */
  private static duplicateIntermediateNode(
    leftStack: SolidAlgorithmCategoryStackNode[],
    leftStackEnd: { value: number },
    startSearchRowIndex: number,
    rightStack: SolidAlgorithmCategoryStackNode[],
    startRight: number,
    endRight: number,
    routingStep: number,
    combineUsedIndices: Set<number>,
    combineIndexRemap: Map<number, number>,
  ): void {
    let vIndex = 0;
    const inputHolder = { value: 0 };
    let routingOffset = 0;
    for (let t = 0; t < SOLID_ALGORITHM_CATEGORY_ROUTING_ROW_LENGTH; t++, routingOffset += routingStep) {
      for (let rightIndex = startRight; rightIndex < endRight; rightIndex++, vIndex++) {
        const routingRow = rightStack[rightIndex]!.routingRow.plusOffset(routingOffset);
        const skip = !combineUsedIndices.has(vIndex);
        const added = skip
          ? 0
          : this.addRowToOutput(
              leftStack,
              leftStackEnd,
              startSearchRowIndex,
              inputHolder,
              routingRow,
              rightStack[rightIndex]!.nodeIdValue,
            );
        combineIndexRemap.set(vIndex, added);
      }
    }
  }

  /**
   * Bakes the operation into the final right-node block.
   *
   * @param leftStack Output stack.
   * @param leftStackEnd Mutable end.
   * @param startSearchRowIndex Dedup search start.
   * @param rightStack Right stack.
   * @param startRight Start right index.
   * @param endRight End right index.
   * @param operation Child operation.
   * @param combineUsedIndices Used destination set.
   * @param combineIndexRemap Remap map.
   */
  private static bakeFinalNode(
    leftStack: SolidAlgorithmCategoryStackNode[],
    leftStackEnd: { value: number },
    startSearchRowIndex: number,
    rightStack: SolidAlgorithmCategoryStackNode[],
    startRight: number,
    endRight: number,
    operation: SolidOperation,
    combineUsedIndices: Set<number>,
    combineIndexRemap: Map<number, number>,
  ): void {
    const operationTableOffset = solidAlgorithmOperationTableIndex(operation);
    let vIndex = 0;
    const inputHolder = { value: 0 };
    for (let t = 0; t < SOLID_ALGORITHM_CATEGORY_ROUTING_ROW_LENGTH; t++) {
      for (let rightIndex = startRight; rightIndex < endRight; rightIndex++, vIndex++) {
        const routingRow = SolidAlgorithmCategoryRoutingRow.fromOperation(
          operationTableOffset,
          t,
          rightStack[rightIndex]!.routingRow,
        );
        const skip = !combineUsedIndices.has(vIndex);
        const added = skip
          ? 0
          : this.addRowToOutput(
              leftStack,
              leftStackEnd,
              startSearchRowIndex,
              inputHolder,
              routingRow,
              rightStack[rightIndex]!.nodeIdValue,
            );
        combineIndexRemap.set(vIndex, added);
      }
    }
  }

  /**
   * Remaps previous-node destinations after the final bake, collapses constant
   * final nodes, and strips leading all-Inside single-node rows.
   *
   * @param leftStack Output stack.
   * @param leftStackStart Region start.
   * @param prevNodeIndex Previous node start.
   * @param startSearchRowIndex Final-node start.
   * @param leftStackEnd Mutable exclusive end.
   * @param combineIndexRemap Final-node remap (Input+1 values).
   */
  private static finalizeRemapAndTrim(
    leftStack: SolidAlgorithmCategoryStackNode[],
    leftStackStart: number,
    prevNodeIndex: number,
    startSearchRowIndex: number,
    leftStackEnd: { value: number },
    combineIndexRemap: Map<number, number>,
  ): void {
    if (prevNodeIndex >= leftStackStart) {
      this.remapIndicesOrAbort(leftStack, combineIndexRemap, prevNodeIndex, startSearchRowIndex);
      this.collapseAllEqualFinalNode(leftStack, prevNodeIndex, startSearchRowIndex, leftStackEnd, combineIndexRemap);
    }
    this.stripLeadingAllZeroNodes(leftStack, leftStackStart, leftStackEnd);
  }

  /**
   * Drops the final node when every final row is constant, remapping the
   * previous node straight to those constant destinations.
   *
   * @param leftStack Output stack.
   * @param prevNodeIndex Previous node start.
   * @param startSearchRowIndex Final-node start.
   * @param leftStackEnd Mutable exclusive end.
   * @param combineIndexRemap Remap map reused for collapse.
   */
  private static collapseAllEqualFinalNode(
    leftStack: SolidAlgorithmCategoryStackNode[],
    prevNodeIndex: number,
    startSearchRowIndex: number,
    leftStackEnd: { value: number },
    combineIndexRemap: Map<number, number>,
  ): void {
    if (!this.finalNodeRowsAreAllConstant(leftStack, startSearchRowIndex, leftStackEnd.value)) {
      return;
    }
    combineIndexRemap.clear();
    this.fillAllEqualCollapseRemap(leftStack, startSearchRowIndex, leftStackEnd.value, combineIndexRemap);
    leftStackEnd.value = startSearchRowIndex;
    this.remapIndicesOrAbort(leftStack, combineIndexRemap, prevNodeIndex, startSearchRowIndex);
  }

  /**
   * Returns whether every row in the final node block has identical columns.
   *
   * @param leftStack Output stack.
   * @param start Final-node start.
   * @param end Exclusive end.
   * @returns True when the range is non-empty and every row has identical
   *   column values.
   */
  private static finalNodeRowsAreAllConstant(
    leftStack: SolidAlgorithmCategoryStackNode[],
    start: number,
    end: number,
  ): boolean {
    for (let index = start; index < end; index++) {
      if (!leftStack[index]!.routingRow.areAllTheSame()) {
        return false;
      }
    }
    return start < end;
  }

  /**
   * Fills remap[Input] = constantDestination + 1 for each final-node row.
   *
   * @param leftStack Output stack.
   * @param start Final-node start.
   * @param end Exclusive end.
   * @param combineIndexRemap Destination remap map.
   */
  private static fillAllEqualCollapseRemap(
    leftStack: SolidAlgorithmCategoryStackNode[],
    start: number,
    end: number,
    combineIndexRemap: Map<number, number>,
  ): void {
    for (let index = start; index < end; index++) {
      const node = leftStack[index]!;
      combineIndexRemap.set(node.input, node.routingRow.at(0) + 1);
    }
  }

  /**
   * Removes leading single-row nodes whose destinations are all Inside (0).
   *
   * @param leftStack Output stack.
   * @param leftStackStart Region start.
   * @param leftStackEnd Mutable exclusive end.
   */
  private static stripLeadingAllZeroNodes(
    leftStack: SolidAlgorithmCategoryStackNode[],
    leftStackStart: number,
    leftStackEnd: { value: number },
  ): void {
    const removeThrough = this.countLeadingAllZeroSingleNodes(leftStack, leftStackStart, leftStackEnd.value);
    if (removeThrough > leftStackStart) {
      this.removeRange(leftStack, leftStackStart, removeThrough - leftStackStart, leftStackEnd);
    }
  }

  /**
   * Counts how far leading all-Inside single-node rows extend.
   *
   * @param leftStack Output stack.
   * @param leftStackStart Region start.
   * @param leftStackEnd Exclusive end.
   * @returns Exclusive end index of the removable leading run.
   */
  private static countLeadingAllZeroSingleNodes(
    leftStack: SolidAlgorithmCategoryStackNode[],
    leftStackStart: number,
    leftStackEnd: number,
  ): number {
    let lastRemoveCount = leftStackStart;
    while (
      lastRemoveCount < leftStackEnd - 1 &&
      leftStack[lastRemoveCount]!.nodeIdValue !== leftStack[lastRemoveCount + 1]!.nodeIdValue &&
      leftStack[lastRemoveCount]!.routingRow.areAllValue(0)
    ) {
      lastRemoveCount++;
    }
    return lastRemoveCount;
  }

  /**
   * Removes count entries starting at start and shifts the tail down.
   *
   * @param stack Mutable stack.
   * @param start Inclusive removal start.
   * @param count Number of entries to remove.
   * @param end Mutable exclusive end.
   */
  private static removeRange(
    stack: SolidAlgorithmCategoryStackNode[],
    start: number,
    count: number,
    end: { value: number },
  ): void {
    if (count <= 0) {
      return;
    }
    const newEnd = end.value - count;
    for (let index = start; index < newEnd; index++) {
      stack[index] = stack[index + count]!;
    }
    end.value = newEnd;
  }

  /**
   * Collects destination indices that appear in rows in [start, end).
   *
   * @param stack Stack.
   * @param start Inclusive start.
   * @param end Exclusive end.
   * @param used Destination set.
   */
  private static collectUsedFromRange(
    stack: SolidAlgorithmCategoryStackNode[],
    start: number,
    end: number,
    used: Set<number>,
  ): void {
    for (let index = start; index < end; index++) {
      const row = stack[index]!.routingRow;
      for (let column = 0; column < SOLID_ALGORITHM_CATEGORY_ROUTING_ROW_LENGTH; column++) {
        used.add(row.at(column));
      }
    }
  }

  /**
   * Adds a unique row to the output stack (dedup against existing rows).
   *
   * @param outputStack Output stack.
   * @param outputLength Mutable exclusive end of the written region.
   * @param startSearchRowIndex Dedup search start.
   * @param input Mutable next input index.
   * @param routingRow Row to add.
   * @param nodeIdValue Compact node id.
   * @returns One more than the matching or newly assigned stack node input
   *   index.
   */
  private static addRowToOutput(
    outputStack: SolidAlgorithmCategoryStackNode[],
    outputLength: { value: number },
    startSearchRowIndex: number,
    input: { value: number },
    routingRow: SolidAlgorithmCategoryRoutingRow,
    nodeIdValue: number,
  ): number {
    for (let index = startSearchRowIndex; index < outputLength.value; index++) {
      if (outputStack[index]!.routingRow.equals(routingRow)) {
        return outputStack[index]!.input + 1;
      }
    }
    outputStack[outputLength.value] = new SolidAlgorithmCategoryStackNode(input.value, nodeIdValue, routingRow);
    outputLength.value++;
    input.value++;
    return input.value;
  }

  /**
   * Remaps destinations in [start, last) using remap values. If any key is
   * missing or maps to zero, returns false without modifying the stack;
   * otherwise rewrites every destination and returns true.
   *
   * @param stack Stack.
   * @param remap Old destination to new destination plus one.
   * @param start Inclusive start.
   * @param last Exclusive end.
   * @returns True when every destination remapped successfully.
   */
  private static remapIndicesOrAbort(
    stack: SolidAlgorithmCategoryStackNode[],
    remap: Map<number, number>,
    start: number,
    last: number,
  ): boolean {
    for (let index = start; index < last; index++) {
      const row = stack[index]!.routingRow;
      for (let column = 0; column < SOLID_ALGORITHM_CATEGORY_ROUTING_ROW_LENGTH; column++) {
        const mapped = remap.get(row.at(column));
        if (mapped === undefined || mapped === 0) {
          return false;
        }
      }
    }
    for (let index = start; index < last; index++) {
      const node = stack[index]!;
      const row = node.routingRow;
      const next = new Uint8Array(SOLID_ALGORITHM_CATEGORY_ROUTING_ROW_LENGTH);
      for (let column = 0; column < SOLID_ALGORITHM_CATEGORY_ROUTING_ROW_LENGTH; column++) {
        next[column] = remap.get(row.at(column))! - 1;
      }
      node.routingRow = new SolidAlgorithmCategoryRoutingRow(next);
    }
    return true;
  }
}
