import * as THREE from 'three';
import { SEAM_CORNER_ON_EDGE_DISTANCE } from './seam_constants.js';

/** Values stored per slot: min x, y, z, max x, y, z. */
const SEAM_BOUNDS_STRIDE = 6;

/**
 * Corner bounds of every filed brush in one flat array indexed by owner slot,
 * so finding the brushes near a change scans contiguous numbers instead of
 * visiting every brush record.
 */
export class SeamBrushBoundsIndex {
  private values = new Float64Array(SEAM_BOUNDS_STRIDE * 256).fill(NaN);
  private readonly brushIds: Array<string | undefined> = [];

  /** Forgets every brush. */
  clear(): void {
    this.values.fill(NaN);
    this.brushIds.length = 0;
  }

  /**
   * Stores the bounds of a brush slot.
   *
   * @param slot Owner slot.
   * @param brushId Brush id of the slot.
   * @param bounds Corner bounds.
   */
  set(slot: number, brushId: string, bounds: THREE.Box3): void {
    this.ensureCapacity(slot);
    const offset = slot * SEAM_BOUNDS_STRIDE;
    this.values.set([bounds.min.x, bounds.min.y, bounds.min.z, bounds.max.x, bounds.max.y, bounds.max.z], offset);
    this.brushIds[slot] = brushId;
  }

  /**
   * Forgets one slot.
   *
   * @param slot Owner slot.
   */
  remove(slot: number): void {
    if (slot * SEAM_BOUNDS_STRIDE >= this.values.length) return;
    this.values.fill(NaN, slot * SEAM_BOUNDS_STRIDE, (slot + 1) * SEAM_BOUNDS_STRIDE);
    this.brushIds[slot] = undefined;
  }

  /**
   * Brush ids whose bounds come within tolerance of a box.
   *
   * @param box Query box.
   * @returns Matching brush ids.
   */
  overlapping(box: THREE.Box3): string[] {
    const found: string[] = [];
    if (box.isEmpty()) return found;
    const reach = SEAM_CORNER_ON_EDGE_DISTANCE;
    const values = this.values;
    for (let slot = 0; slot < this.brushIds.length; slot++) {
      const offset = slot * SEAM_BOUNDS_STRIDE;
      if (!(values[offset]! <= box.max.x + reach && values[offset + 3]! >= box.min.x - reach)) continue;
      if (!(values[offset + 1]! <= box.max.y + reach && values[offset + 4]! >= box.min.y - reach)) continue;
      if (!(values[offset + 2]! <= box.max.z + reach && values[offset + 5]! >= box.min.z - reach)) continue;
      const brushId = this.brushIds[slot];
      if (brushId !== undefined) found.push(brushId);
    }
    return found;
  }

  /**
   * Grows the value array so a slot fits.
   *
   * @param slot Owner slot.
   */
  private ensureCapacity(slot: number): void {
    if ((slot + 1) * SEAM_BOUNDS_STRIDE <= this.values.length) return;
    const grown = new Float64Array(Math.max(this.values.length * 2, (slot + 1) * SEAM_BOUNDS_STRIDE)).fill(NaN);
    grown.set(this.values);
    this.values = grown;
  }
}
