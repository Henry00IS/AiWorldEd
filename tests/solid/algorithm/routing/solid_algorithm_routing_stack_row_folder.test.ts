import { describe, it, expect } from 'vitest';
import {
  SOLID_ALGORITHM_CATEGORY_ROUTING_ROW_LENGTH,
  SolidAlgorithmCategoryRoutingRow,
} from '@/solid/algorithm/routing/solid_algorithm_category_routing_row.js';
import { SolidAlgorithmCategoryStackNode } from '@/solid/algorithm/routing/solid_algorithm_category_stack_node.js';
import { SolidAlgorithmRoutingStackRowFolder } from '@/solid/algorithm/routing/solid_algorithm_routing_stack_row_folder.js';

/**
 * Builds a stack from per-block rows; block b gets node id 100 + b.
 *
 * @param blocks Destination lists per row, grouped per block.
 * @returns Stack with each row's input set to its position in its block.
 */
function stackBuild(blocks: number[][][]): SolidAlgorithmCategoryStackNode[] {
  const stack: SolidAlgorithmCategoryStackNode[] = [];
  blocks.forEach((rows, blockIndex) => {
    rows.forEach((destinations, rowIndex) => {
      stack.push(
        new SolidAlgorithmCategoryStackNode(
          rowIndex,
          100 + blockIndex,
          new SolidAlgorithmCategoryRoutingRow(destinations),
        ),
      );
    });
  });
  return stack;
}

/**
 * Routes one category per block through the stack like a routing table does.
 *
 * @param stack Stack of consecutive node blocks.
 * @param end Exclusive end of the live stack.
 * @param categories Category seen at each block, in block order.
 * @returns Final routed value.
 */
function stackRoute(stack: SolidAlgorithmCategoryStackNode[], end: number, categories: number[]): number {
  let state = 0;
  let blockStart = 0;
  let blockIndex = 0;
  while (blockStart < end) {
    let blockEnd = blockStart + 1;
    while (blockEnd < end && stack[blockEnd]!.nodeIdValue === stack[blockStart]!.nodeIdValue) blockEnd++;
    if (blockStart + state < blockEnd) state = stack[blockStart + state]!.routingRow.at(categories[blockIndex]!);
    blockStart = blockEnd;
    blockIndex++;
  }
  return state;
}

/**
 * Lists every category sequence for a number of blocks.
 *
 * @param blockCount Number of blocks.
 * @returns All sequences of categories, one per block.
 */
function categorySequences(blockCount: number): number[][] {
  let sequences: number[][] = [[]];
  for (let block = 0; block < blockCount; block++) {
    sequences = sequences.flatMap((prefix) =>
      Array.from({ length: SOLID_ALGORITHM_CATEGORY_ROUTING_ROW_LENGTH }, (_, category) => [...prefix, category]),
    );
  }
  return sequences;
}

/**
 * Creates random blocks whose rows only address rows of the following block,
 * and whose last block routes to categories, with few distinct values so
 * equivalent rows are common.
 *
 * @param seed Pseudo-random seed.
 * @param blockCount Number of blocks.
 * @returns Destination lists per row per block.
 */
function randomBlocks(seed: number, blockCount: number): number[][][] {
  let value = seed;
  const next = (limit: number) => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value % limit;
  };
  const rowCounts = Array.from({ length: blockCount }, (_, block) => (block === 0 ? 1 : 1 + next(6)));
  return rowCounts.map((rowCount, block) => {
    const limit = block + 1 < blockCount ? rowCounts[block + 1]! : 2;
    return Array.from({ length: rowCount }, () =>
      Array.from({ length: SOLID_ALGORITHM_CATEGORY_ROUTING_ROW_LENGTH }, () => next(limit)),
    );
  });
}

describe('SolidAlgorithmRoutingStackRowFolder', () => {
  it('folds rows that only differ by pointing at rows that fold together', () => {
    const stack = stackBuild([
      [[0, 1, 0, 1, 0, 1]],
      [
        [0, 0, 0, 0, 0, 1],
        [0, 0, 0, 0, 0, 2],
      ],
      [
        [5, 5, 5, 5, 5, 0],
        [5, 5, 5, 5, 5, 5],
        [5, 5, 5, 5, 5, 5],
      ],
    ]);
    const end = { value: stack.length };
    SolidAlgorithmRoutingStackRowFolder.foldEquivalentRows(stack, 0, end, 1);
    expect(end.value).toBe(4);
    expect(Array.from(stack[0]!.routingRow.destinations)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('keeps every routed result of random stacks while dropping rows', () => {
    let rowsBefore = 0;
    let rowsAfter = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const blocks = randomBlocks(seed, 4);
      const reference = stackBuild(blocks);
      const folded = stackBuild(blocks);
      const end = { value: folded.length };
      SolidAlgorithmRoutingStackRowFolder.foldEquivalentRows(folded, 0, end, 1);
      for (const categories of categorySequences(4)) {
        expect(stackRoute(folded, end.value, categories)).toBe(stackRoute(reference, reference.length, categories));
      }
      rowsBefore += reference.length;
      rowsAfter += end.value;
    }
    expect(rowsAfter).toBeLessThan(rowsBefore);
  });

  it('numbers surviving rows by their position in their block', () => {
    const blocks = randomBlocks(7, 5);
    const stack = stackBuild(blocks);
    const end = { value: stack.length };
    SolidAlgorithmRoutingStackRowFolder.foldEquivalentRows(stack, 0, end, 1);
    for (let row = 0; row < end.value; row++) {
      const sameBlockBefore = row > 0 && stack[row - 1]!.nodeIdValue === stack[row]!.nodeIdValue;
      expect(stack[row]!.input).toBe(sameBlockBefore ? stack[row - 1]!.input + 1 : 0);
    }
  });
});
