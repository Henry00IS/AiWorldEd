import * as THREE from 'three';

/** Grid cell size of the corner hash, in metres. */
const MODIFIER_SMOOTH_CELL = 1e-3;

/** Largest distance at which two corners count as the same point, in metres. */
const MODIFIER_SMOOTH_WELD = 1e-4;

/** A face meeting at a corner. */
export interface ModifierSmoothFace {
  /** Model-space outward normal. */
  normal: THREE.Vector3;
  /** Smoothing class; faces only smooth with faces of the same class. */
  smoothClass: number;
}

/** One welded corner and the faces meeting there. */
interface ModifierSmoothCorner {
  /** Model-space position. */
  point: THREE.Vector3;
  /** Faces meeting at the corner. */
  faces: ModifierSmoothFace[];
}

/**
 * Model-space corners of a smoothing group, welded across brushes so normals
 * blend across the pieces of one shape.
 */
export class ModifierSmoothCorners {
  private readonly cells = new Map<string, ModifierSmoothCorner[]>();

  /**
   * Adds a face at a corner.
   *
   * @param point Model-space corner.
   * @param face Face meeting there.
   */
  add(point: THREE.Vector3, face: ModifierSmoothFace): void {
    const found = this.find(point);
    if (found) {
      found.faces.push(face);
      return;
    }
    const key = this.cellKey(point, 0, 0, 0);
    const list = this.cells.get(key) ?? [];
    list.push({ point: point.clone(), faces: [face] });
    this.cells.set(key, list);
  }

  /**
   * Returns the faces meeting at a point.
   *
   * @param point Model-space point.
   * @returns Faces, or empty when the point is not a known corner.
   */
  facesAt(point: THREE.Vector3): readonly ModifierSmoothFace[] {
    return this.find(point)?.faces ?? [];
  }

  /**
   * Finds the welded corner at a point in its cell or a neighbouring one.
   *
   * @param point Model-space point.
   * @returns Corner, or undefined.
   */
  private find(point: THREE.Vector3): ModifierSmoothCorner | undefined {
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++) {
          const hit = this.cells
            .get(this.cellKey(point, x, y, z))
            ?.find((corner) => corner.point.distanceTo(point) < MODIFIER_SMOOTH_WELD);
          if (hit) return hit;
        }
    return undefined;
  }

  /**
   * Returns the key of the cell holding a point, shifted by whole cells.
   *
   * @param point Point.
   * @param x Cell shift along X.
   * @param y Cell shift along Y.
   * @param z Cell shift along Z.
   * @returns Cell key.
   */
  private cellKey(point: THREE.Vector3, x: number, y: number, z: number): string {
    const cell = (value: number, shift: number) => Math.floor(value / MODIFIER_SMOOTH_CELL) + shift;
    return `${cell(point.x, x)},${cell(point.y, y)},${cell(point.z, z)}`;
  }
}
