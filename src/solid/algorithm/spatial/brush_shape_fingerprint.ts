import { SolidBrush } from '@/solid/brush/solid_brush.js';

/**
 * Builds a compact fingerprint of brush topology and local vertex positions so
 * shape edits invalidate prepared geometry without comparing full clones.
 */
export class BrushShapeFingerprint {
  /**
   * Computes a shape fingerprint for a local-space brush.
   *
   * @param brush Local brush geometry.
   * @returns Stable string fingerprint for equality checks.
   */
  static fromBrush(brush: SolidBrush): string {
    const counts = `${brush.vertices.length}:${brush.faces.length}:${brush.wingEdges.length}`;
    return `${counts}:${this.hashVertices(brush.vertices)}`;
  }

  /**
   * Mixes every vertex into one hash.
   *
   * @param vertices Local vertex positions.
   * @returns Hex hash.
   */
  private static hashVertices(vertices: readonly { x: number; y: number; z: number }[]): string {
    let hash = 2166136261;
    for (const vertex of vertices) hash = this.mixVertex(hash, vertex);
    return (hash >>> 0).toString(16);
  }

  /**
   * Mixes one vertex into a hash.
   *
   * @param hash Running hash.
   * @param vertex Local vertex position.
   * @returns Next hash.
   */
  private static mixVertex(hash: number, vertex: { x: number; y: number; z: number }): number {
    return this.mixNumber(this.mixNumber(this.mixNumber(hash, vertex.x), vertex.y), vertex.z);
  }

  /**
   * Mixes one quantized coordinate into a hash.
   *
   * @param hash Running hash.
   * @param value Coordinate.
   * @returns Next hash.
   */
  private static mixNumber(hash: number, value: number): number {
    const mixed = hash ^ Math.round(value * 100000);
    return Math.imul(mixed, 16777619);
  }
}
