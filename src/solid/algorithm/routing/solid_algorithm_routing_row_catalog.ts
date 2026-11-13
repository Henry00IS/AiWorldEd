import type { SolidAlgorithmCategoryRoutingRow } from './solid_algorithm_category_routing_row.js';

/** Distinct rows a catalog compares one by one before it switches to hashing. */
const SOLID_ALGORITHM_ROUTING_ROW_CATALOG_LINEAR_LIMIT = 16;

/**
 * Remembers the distinct routing rows of one node block together with a number
 * per row, so an identical row can be found again. Small blocks are searched in
 * order; larger ones are looked up by row content.
 */
export class SolidAlgorithmRoutingRowCatalog {
  private readonly distinctRows: SolidAlgorithmCategoryRoutingRow[] = [];
  private readonly numberPerDistinctRow: number[] = [];
  private numberByContentKey: Map<string, number> | null = null;

  /** Forgets every row so the catalog can serve the next block. */
  reset(): void {
    this.distinctRows.length = 0;
    this.numberPerDistinctRow.length = 0;
    this.numberByContentKey = null;
  }

  /**
   * Returns the number stored with the row identical to the given one.
   *
   * @param routingRow Row to look for.
   * @returns Stored number, or undefined when no identical row was added.
   */
  find(routingRow: SolidAlgorithmCategoryRoutingRow): number | undefined {
    if (this.numberByContentKey) {
      return this.numberByContentKey.get(routingRow.contentKey());
    }
    for (let index = 0; index < this.distinctRows.length; index++) {
      if (this.distinctRows[index]!.equals(routingRow)) {
        return this.numberPerDistinctRow[index];
      }
    }
    return undefined;
  }

  /**
   * Adds a row that find did not know, with its number.
   *
   * @param routingRow Distinct row to add.
   * @param rowNumber Number to return for identical rows later.
   */
  add(routingRow: SolidAlgorithmCategoryRoutingRow, rowNumber: number): void {
    this.distinctRows.push(routingRow);
    this.numberPerDistinctRow.push(rowNumber);
    if (this.numberByContentKey) {
      this.numberByContentKey.set(routingRow.contentKey(), rowNumber);
    } else if (this.distinctRows.length > SOLID_ALGORITHM_ROUTING_ROW_CATALOG_LINEAR_LIMIT) {
      this.switchToContentKeys();
    }
  }

  /**
   * Number of distinct rows added so far.
   *
   * @returns Distinct row count.
   */
  get size(): number {
    return this.distinctRows.length;
  }

  /** Indexes every row added so far by content for constant-time lookups. */
  private switchToContentKeys(): void {
    const numberByContentKey = new Map<string, number>();
    for (let index = 0; index < this.distinctRows.length; index++) {
      numberByContentKey.set(this.distinctRows[index]!.contentKey(), this.numberPerDistinctRow[index]!);
    }
    this.numberByContentKey = numberByContentKey;
  }
}
