import {
  SOLID_ALGORITHM_CATEGORY_ROUTING_ROW_LENGTH,
  SolidAlgorithmCategoryRoutingRow,
} from './solid_algorithm_category_routing_row.js';
import type { SolidAlgorithmCategoryStackNode } from './solid_algorithm_category_stack_node.js';
import { SolidAlgorithmRoutingRowCatalog } from './solid_algorithm_routing_row_catalog.js';

/** Where the walk stands relative to the block it folded last. */
interface SolidAlgorithmRoutingFoldWalkState {
  laterBlockStart: number;
  laterBlockRowCount: number;
  laterBlockLostRows: boolean;
}

/**
 * Folds rows of one node block that route every category to the same place into
 * a single row, walking the blocks of a category stack from the last one to the
 * first, so a row that only differed by pointing at two now-folded rows folds
 * as well. Routing results are unchanged; only redundant rows go.
 */
export class SolidAlgorithmRoutingStackRowFolder {
  /** Distinct rows of the block being folded, reset per block. */
  private static readonly blockRowCatalog = new SolidAlgorithmRoutingRowCatalog();

  /** Per-row folded index, relative to the folded region start. */
  private static foldedIndexByRegionRow = new Int32Array(256);

  /** Per-row survival flag (1 kept, 0 folded into an earlier row). */
  private static survivesByRegionRow = new Uint8Array(256);

  /**
   * Folds equivalent rows in [regionStart, regionEnd) of the stack in place.
   *
   * @param stack Category stack holding consecutive node blocks.
   * @param regionStart First row the fold may touch.
   * @param regionEnd Mutable exclusive end of the region (shrinks on fold).
   * @param firstFreshRow First row written by the combine that just ran; blocks
   *   entirely before it were folded already and are only revisited when the
   *   block after them lost rows.
   */
  static foldEquivalentRows(
    stack: SolidAlgorithmCategoryStackNode[],
    regionStart: number,
    regionEnd: { value: number },
    firstFreshRow: number,
  ): void {
    this.ensureScratchCapacity(regionEnd.value - regionStart);
    const firstVisitedRow = this.foldBlocksFromTheEnd(stack, regionStart, regionEnd.value, firstFreshRow);
    this.compactSurvivingRows(stack, regionStart, firstVisitedRow, regionEnd);
  }

  /**
   * Grows the per-row scratch arrays so they cover the region.
   *
   * @param regionRowCount Number of rows in the region.
   */
  private static ensureScratchCapacity(regionRowCount: number): void {
    if (this.foldedIndexByRegionRow.length >= regionRowCount) {
      return;
    }
    const capacity = Math.max(regionRowCount, this.foldedIndexByRegionRow.length * 2);
    this.foldedIndexByRegionRow = new Int32Array(capacity);
    this.survivesByRegionRow = new Uint8Array(capacity);
  }

  /**
   * Visits node blocks from the region end backwards, folding each one, and
   * stops at the first already-folded block whose successor kept its rows.
   *
   * @param stack Category stack.
   * @param regionStart Region start.
   * @param regionEnd Region exclusive end.
   * @param firstFreshRow First row written by the latest combine.
   * @returns First row of the earliest block that was visited.
   */
  private static foldBlocksFromTheEnd(
    stack: SolidAlgorithmCategoryStackNode[],
    regionStart: number,
    regionEnd: number,
    firstFreshRow: number,
  ): number {
    const walk: SolidAlgorithmRoutingFoldWalkState = {
      laterBlockStart: regionEnd,
      laterBlockRowCount: 0,
      laterBlockLostRows: false,
    };
    let blockEnd = regionEnd;
    while (blockEnd > regionStart) {
      const blockStart = this.findBlockStart(stack, regionStart, blockEnd);
      if (this.blockIsAlreadySettled(blockStart, blockEnd, firstFreshRow, walk.laterBlockLostRows)) {
        break;
      }
      const lostRows = this.foldOneBlock(stack, regionStart, blockStart, blockEnd, walk);
      walk.laterBlockStart = blockStart;
      walk.laterBlockRowCount = blockEnd - blockStart;
      walk.laterBlockLostRows = lostRows;
      blockEnd = blockStart;
    }
    return blockEnd;
  }

  /**
   * Finds the first row of the node block that ends at blockEnd.
   *
   * @param stack Category stack.
   * @param regionStart Region start.
   * @param blockEnd Exclusive block end.
   * @returns First row of the block.
   */
  private static findBlockStart(
    stack: SolidAlgorithmCategoryStackNode[],
    regionStart: number,
    blockEnd: number,
  ): number {
    const nodeIdValue = stack[blockEnd - 1]!.nodeIdValue;
    let blockStart = blockEnd - 1;
    while (blockStart > regionStart && stack[blockStart - 1]!.nodeIdValue === nodeIdValue) {
      blockStart--;
    }
    return blockStart;
  }

  /**
   * Returns whether a block was folded by an earlier combine and nothing after
   * it changed since, so neither it nor any block before it can fold further.
   *
   * @param blockStart Block start.
   * @param blockEnd Block exclusive end.
   * @param firstFreshRow First row written by the latest combine.
   * @param laterBlockLostRows Whether the following block lost rows.
   * @returns True when the walk can stop.
   */
  private static blockIsAlreadySettled(
    blockStart: number,
    blockEnd: number,
    firstFreshRow: number,
    laterBlockLostRows: boolean,
  ): boolean {
    return blockStart < firstFreshRow && blockEnd !== firstFreshRow && !laterBlockLostRows;
  }

  /**
   * Points every row of a block at the folded rows of the following block, then
   * gives each row the folded index of the first identical row.
   *
   * @param stack Category stack.
   * @param regionStart Region start (scratch origin).
   * @param blockStart Block start.
   * @param blockEnd Block exclusive end.
   * @param walk Facts about the following block.
   * @returns True when at least one row folded into an earlier one.
   */
  private static foldOneBlock(
    stack: SolidAlgorithmCategoryStackNode[],
    regionStart: number,
    blockStart: number,
    blockEnd: number,
    walk: SolidAlgorithmRoutingFoldWalkState,
  ): boolean {
    const distinctRowsOfBlock = this.blockRowCatalog;
    distinctRowsOfBlock.reset();
    let anyRowFolded = false;
    for (let row = blockStart; row < blockEnd; row++) {
      const node = stack[row]!;
      if (walk.laterBlockLostRows) {
        node.routingRow = this.retargetRow(node.routingRow, regionStart, walk);
      }
      anyRowFolded = this.assignFoldedIndex(node, row - regionStart, distinctRowsOfBlock) || anyRowFolded;
    }
    return anyRowFolded;
  }

  /**
   * Records the folded index of one row, reusing an identical earlier row of
   * the same block when there is one.
   *
   * @param node Stack node of the row.
   * @param regionRow Row position relative to the region start.
   * @param distinctRowsOfBlock Distinct rows of the block with their folded
   *   index.
   * @returns True when the row folded into an earlier identical row.
   */
  private static assignFoldedIndex(
    node: SolidAlgorithmCategoryStackNode,
    regionRow: number,
    distinctRowsOfBlock: SolidAlgorithmRoutingRowCatalog,
  ): boolean {
    const earlierFoldedIndex = distinctRowsOfBlock.find(node.routingRow);
    if (earlierFoldedIndex !== undefined) {
      this.foldedIndexByRegionRow[regionRow] = earlierFoldedIndex;
      this.survivesByRegionRow[regionRow] = 0;
      return true;
    }
    const foldedIndex = distinctRowsOfBlock.size;
    distinctRowsOfBlock.add(node.routingRow, foldedIndex);
    this.foldedIndexByRegionRow[regionRow] = foldedIndex;
    this.survivesByRegionRow[regionRow] = 1;
    return false;
  }

  /**
   * Rewrites destinations that address rows of the following block to their
   * folded indices; other destinations are kept as they are.
   *
   * @param routingRow Row to retarget.
   * @param regionStart Region start (scratch origin).
   * @param walk Facts about the following block.
   * @returns The same row when no destination moves, otherwise a new row.
   */
  private static retargetRow(
    routingRow: SolidAlgorithmCategoryRoutingRow,
    regionStart: number,
    walk: SolidAlgorithmRoutingFoldWalkState,
  ): SolidAlgorithmCategoryRoutingRow {
    const laterBlockOrigin = walk.laterBlockStart - regionStart;
    let retargeted: Uint16Array | null = null;
    for (let column = 0; column < SOLID_ALGORITHM_CATEGORY_ROUTING_ROW_LENGTH; column++) {
      const destination = routingRow.at(column);
      if (destination >= walk.laterBlockRowCount) continue;
      const foldedDestination = this.foldedIndexByRegionRow[laterBlockOrigin + destination]!;
      if (foldedDestination === destination) continue;
      retargeted ??= Uint16Array.from(routingRow.destinations);
      retargeted[column] = foldedDestination;
    }
    return retargeted ? new SolidAlgorithmCategoryRoutingRow(retargeted) : routingRow;
  }

  /**
   * Drops folded rows from the visited part of the region and numbers the
   * survivors by their folded index.
   *
   * @param stack Category stack.
   * @param regionStart Region start (scratch origin).
   * @param firstVisitedRow First row of the earliest visited block.
   * @param regionEnd Mutable exclusive region end.
   */
  private static compactSurvivingRows(
    stack: SolidAlgorithmCategoryStackNode[],
    regionStart: number,
    firstVisitedRow: number,
    regionEnd: { value: number },
  ): void {
    let writeRow = firstVisitedRow;
    for (let row = firstVisitedRow; row < regionEnd.value; row++) {
      if (this.survivesByRegionRow[row - regionStart] === 0) {
        continue;
      }
      const node = stack[row]!;
      node.input = this.foldedIndexByRegionRow[row - regionStart]!;
      stack[writeRow] = node;
      writeRow++;
    }
    regionEnd.value = writeRow;
  }
}
