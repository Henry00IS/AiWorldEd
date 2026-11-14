import type { SolidBrushMeshChunk } from './solid_brush_mesh_chunk.js';
import type { SolidMeshChunkCache } from './solid_mesh_chunk_cache.js';

/**
 * Brush evaluation order of the last compile, with a revision that moves when
 * it is set.
 */
export interface SolidCollisionOrderSource {
  /** Returns the revision of the evaluation order. */
  getLastBrushOrderRevision(): number;
  /** Returns the evaluation order. */
  getLastBrushOrder(): string[];
}

/**
 * Answers which result chunks changed since a reader last looked, from the
 * chunk cache's change log plus brushes joining or leaving the evaluation
 * order, so readers skip the unchanged chunks of a large level.
 */
export class SolidCollisionChunkChanges {
  private order: string[] = [];
  private orderIndex = new Map<string, number>();
  private orderRevision = -1;

  /**
   * @param cache Chunk cache whose log records stored and dropped chunks.
   * @param orderSource Evaluation order of the last compile.
   */
  constructor(
    private readonly cache: SolidMeshChunkCache,
    private readonly orderSource: SolidCollisionOrderSource,
  ) {}

  /**
   * Lists the brushes whose chunk may have changed since a cursor: ordered
   * brushes first, in evaluation order, then brushes no longer ordered.
   *
   * @param cursor Cursor from an earlier call, or -1 for none.
   * @returns Next cursor and the brush ids, or null ids for a full visit.
   */
  since(cursor: number): { cursor: number; brushIds: readonly string[] | null } {
    this.orderFollow();
    const logged = this.cache.changesSince(cursor);
    const next = this.cache.changeCursor();
    if (!logged) return { cursor: next, brushIds: null };
    const present: string[] = [];
    const absent: string[] = [];
    for (const brushId of new Set(logged)) (this.orderIndex.has(brushId) ? present : absent).push(brushId);
    present.sort((a, b) => this.orderIndex.get(a)! - this.orderIndex.get(b)!);
    return { cursor: next, brushIds: [...present, ...absent] };
  }

  /**
   * Returns one brush's chunk when the brush is in the evaluation order.
   *
   * @param brushId Brush id.
   * @returns Chunk or undefined.
   */
  chunkOf(brushId: string): SolidBrushMeshChunk | undefined {
    this.orderFollow();
    return this.orderIndex.has(brushId) ? this.cache.get(brushId) : undefined;
  }

  /**
   * Brings the ordered brush ids up to date and logs every brush that joined or
   * left them, so readers see chunks enter or leave the result.
   */
  private orderFollow(): void {
    const revision = this.orderSource.getLastBrushOrderRevision();
    if (revision === this.orderRevision) return;
    this.orderRevision = revision;
    const order = this.orderSource.getLastBrushOrder();
    const previous = this.order;
    this.order = order;
    if (order.length === previous.length && order.every((brushId, index) => brushId === previous[index])) return;
    const index = new Map<string, number>();
    order.forEach((brushId, position) => index.set(brushId, position));
    for (const brushId of index.keys()) if (!this.orderIndex.has(brushId)) this.cache.changeNote(brushId);
    for (const brushId of this.orderIndex.keys()) if (!index.has(brushId)) this.cache.changeNote(brushId);
    this.orderIndex = index;
  }
}
