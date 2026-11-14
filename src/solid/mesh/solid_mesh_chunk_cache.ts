import { SolidBrushMeshChunk } from './solid_brush_mesh_chunk.js';

/**
 * Caches per-brush triangulated mesh chunks so partial CSG updates only remesh
 * brushes that actually recompiled.
 */
export class SolidMeshChunkCache {
  /** Longest change log kept; older readers fall back to a full scan. */
  static readonly changeLogLimit = 8192;

  private readonly chunksByBrushId = new Map<string, SolidBrushMeshChunk>();
  /** Brush ids whose chunk was stored or dropped, oldest first. */
  private changeLog: string[] = [];
  /** Change number of the first log entry. */
  private changeLogStart = 0;

  /** Clears every cached mesh chunk. */
  clear(): void {
    this.chunksByBrushId.clear();
    this.changeLogStart = this.changeCursor() + 1;
    this.changeLog = [];
  }

  /**
   * Returns the number of the next change, a cursor for changesSince.
   *
   * @returns Change cursor.
   */
  changeCursor(): number {
    return this.changeLogStart + this.changeLog.length;
  }

  /**
   * Lists the brushes whose chunk was stored or dropped since a cursor.
   *
   * @param cursor Cursor from an earlier changeCursor call.
   * @returns Brush ids, possibly repeated, or null when the log no longer
   *   reaches back that far and the reader must look at every chunk.
   */
  changesSince(cursor: number): readonly string[] | null {
    if (cursor < this.changeLogStart || cursor > this.changeCursor()) return null;
    return this.changeLog.slice(cursor - this.changeLogStart);
  }

  /**
   * Appends a brush to the change log, halving the log when it grows too long.
   * Owners call it too when a chunk joins or leaves the result without being
   * stored or dropped here.
   *
   * @param brushId Brush id.
   */
  changeNote(brushId: string): void {
    this.changeLog.push(brushId);
    if (this.changeLog.length <= SolidMeshChunkCache.changeLogLimit) return;
    const dropped = this.changeLog.length >> 1;
    this.changeLog = this.changeLog.slice(dropped);
    this.changeLogStart += dropped;
  }

  /**
   * Returns a cached chunk for a brush.
   *
   * @param brushId Brush instance id.
   * @returns Chunk or undefined.
   */
  get(brushId: string): SolidBrushMeshChunk | undefined {
    return this.chunksByBrushId.get(brushId);
  }

  /**
   * Stores a mesh chunk for a brush.
   *
   * @param brushId Brush instance id.
   * @param chunk Triangulated chunk.
   */
  set(brushId: string, chunk: SolidBrushMeshChunk): void {
    this.chunksByBrushId.set(brushId, chunk);
    this.changeNote(brushId);
  }

  /**
   * Removes one brush chunk.
   *
   * @param brushId Brush instance id.
   */
  remove(brushId: string): void {
    if (this.chunksByBrushId.delete(brushId)) this.changeNote(brushId);
  }

  /**
   * Drops chunks for brushes no longer present.
   *
   * @param activeIds Active brush ids.
   */
  pruneToIds(activeIds: Set<string>): void {
    for (const brushId of this.chunksByBrushId.keys()) {
      if (!activeIds.has(brushId)) {
        this.chunksByBrushId.delete(brushId);
        this.changeNote(brushId);
      }
    }
  }

  /**
   * Returns whether every listed brush has a mesh chunk.
   *
   * @param brushIds Brush ids in tree order.
   * @returns True when all chunks exist.
   */
  hasAll(brushIds: readonly string[]): boolean {
    for (const brushId of brushIds) {
      if (!this.chunksByBrushId.has(brushId)) return false;
    }
    return true;
  }
}
