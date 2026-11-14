import * as THREE from 'three';
import {
  MODIFIER_VOLUME_BEVEL_EDGE_KEY,
  MODIFIER_VOLUME_OUTLINE_KEY,
} from '@/modifier/volume/modifier_volume_bevel_keys.js';

/** UserData flag on the arrow that shows a decal projector's direction. */
export const DECAL_DIRECTION_ARROW_USERDATA_KEY = 'isDecalDirectionArrow';

/**
 * Opacity of the arrow lines: readable, yet a touch quieter than the box
 * outline.
 */
const DECAL_DIRECTION_ARROW_OPACITY = 0.85;

/** Arrow tail, tip and head base heights and radii, in unit box space. */
const DECAL_DIRECTION_ARROW_SHAPE = { tail: 0.42, tip: -0.42, headBase: -0.2, headRadius: 0.16, tailRadius: 0.08 };

/**
 * Builds the editor-only arrow inside a decal projector box. It points along
 * local -Y, the direction the image travels, follows the box because it is a
 * child of it, is never picked, and exports skip it like the box outline.
 */
export class DecalDirectionArrow {
  /**
   * Creates the arrow for a unit projector box.
   *
   * @param color Line color, matching the box outline.
   * @returns Arrow line segments in the box's local space.
   */
  static create(color: number): THREE.LineSegments {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(DecalDirectionArrow.segmentPoints(), 3));
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: DECAL_DIRECTION_ARROW_OPACITY,
      depthWrite: false,
    });
    const arrow = new THREE.LineSegments(geometry, material);
    arrow.name = 'Decal Direction';
    arrow.userData[DECAL_DIRECTION_ARROW_USERDATA_KEY] = true;
    arrow.userData[MODIFIER_VOLUME_BEVEL_EDGE_KEY] = true;
    arrow.userData[MODIFIER_VOLUME_OUTLINE_KEY] = true;
    arrow.raycast = () => undefined;
    return arrow;
  }

  /**
   * Returns the segment end points: a shaft, a four-sided head with its rim,
   * and a small cross at the tail that marks where the projection starts.
   *
   * @returns Flat xyz pairs, two points per segment.
   */
  private static segmentPoints(): number[] {
    const { tail, tip, headBase, headRadius, tailRadius } = DECAL_DIRECTION_ARROW_SHAPE;
    const rim: readonly (readonly [number, number])[] = [
      [headRadius, 0],
      [0, headRadius],
      [-headRadius, 0],
      [0, -headRadius],
    ];
    const points: number[] = [0, tail, 0, 0, tip, 0];
    rim.forEach(([x, z], index) => {
      const [nextX, nextZ] = rim[(index + 1) % rim.length] ?? [x, z];
      points.push(x, headBase, z, 0, tip, 0);
      points.push(x, headBase, z, nextX, headBase, nextZ);
    });
    points.push(-tailRadius, tail, 0, tailRadius, tail, 0, 0, tail, -tailRadius, 0, tail, tailRadius);
    return points;
  }
}
