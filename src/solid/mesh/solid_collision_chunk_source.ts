import type { SolidBrushMeshChunk } from './solid_brush_mesh_chunk.js';

/**
 * Read-only access to the final per-brush triangle chunks of a solid model's
 * result mesh, for systems that mirror the rendered geometry (collision).
 */
export interface SolidCollisionChunkSource {
  /**
   * Returns a counter that changes whenever the result geometry changes.
   *
   * @returns Revision number.
   */
  getCollisionRevision(): number;

  /**
   * Visits every brush chunk of the current result in evaluation order.
   *
   * @param visitor Called with each brush id and its chunk.
   */
  forEachCollisionChunk(visitor: (brushId: string, chunk: SolidBrushMeshChunk) => void): void;

  /**
   * Lists the brushes whose chunk may have changed since a cursor, so readers
   * need not visit every chunk after each edit.
   *
   * @param cursor Cursor from an earlier call, or -1 for none.
   * @returns Next cursor, and the brush ids (possibly repeated), or null when
   *   the reader must visit every chunk instead.
   */
  collisionChunkChangesSince?(cursor: number): { cursor: number; brushIds: readonly string[] | null };

  /**
   * Returns one brush's chunk in the current result.
   *
   * @param brushId Brush id.
   * @returns Chunk, or undefined when the brush has none in the result.
   */
  collisionChunkOf?(brushId: string): SolidBrushMeshChunk | undefined;
}
