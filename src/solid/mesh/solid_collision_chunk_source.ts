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
}
