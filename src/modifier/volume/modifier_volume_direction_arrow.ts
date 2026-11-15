import * as THREE from 'three';
import { MODIFIER_VOLUME_BEVEL_EDGE_KEY, MODIFIER_VOLUME_OUTLINE_KEY } from './modifier_volume_bevel_keys.js';

/** UserData flag on every editor-only direction arrow. */
export const MODIFIER_VOLUME_DIRECTION_ARROW_USERDATA_KEY = 'isVolumeDirectionArrow';

/**
 * Opacity of the arrow lines: readable, yet a touch quieter than the box
 * outline.
 */
const MODIFIER_VOLUME_DIRECTION_ARROW_OPACITY = 0.85;

/** Arrow tail, tip and head base heights and radii, in unit box space. */
const MODIFIER_VOLUME_DIRECTION_ARROW_SHAPE = {
  tail: 0.42,
  tip: -0.42,
  headBase: -0.2,
  headRadius: 0.16,
  tailRadius: 0.08,
};

/**
 * Builds editor-only direction arrows for volumes. An arrow points along its
 * local -Y, is never picked, and exports skip it like a volume outline.
 */
export class ModifierVolumeDirectionArrow {
  /**
   * Creates an arrow that fills a unit box.
   *
   * @param color Line color.
   * @param name Object name shown in debugging tools.
   * @returns Arrow line segments in unit box space.
   */
  static create(color: number, name = 'Direction'): THREE.LineSegments {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.segmentPoints(), 3));
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: MODIFIER_VOLUME_DIRECTION_ARROW_OPACITY,
      depthWrite: false,
    });
    const arrow = new THREE.LineSegments(geometry, material);
    arrow.name = name;
    arrow.userData[MODIFIER_VOLUME_DIRECTION_ARROW_USERDATA_KEY] = true;
    arrow.userData[MODIFIER_VOLUME_BEVEL_EDGE_KEY] = true;
    arrow.userData[MODIFIER_VOLUME_OUTLINE_KEY] = true;
    arrow.raycast = () => undefined;
    return arrow;
  }

  /**
   * Returns the matrix that places a unit arrow so its tip sits on a point and
   * it points along a direction.
   *
   * @param tip Point the arrow tip touches.
   * @param direction Pointing direction; need not be unit length.
   * @param length Arrow length from tail to tip.
   * @returns Placement matrix.
   */
  static placement(tip: THREE.Vector3, direction: THREE.Vector3, length: number): THREE.Matrix4 {
    const unit = direction.lengthSq() > 1e-12 ? direction.clone().normalize() : new THREE.Vector3(0, -1, 0);
    const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), unit);
    const { tail, tip: tipHeight } = MODIFIER_VOLUME_DIRECTION_ARROW_SHAPE;
    const scale = length / (tail - tipHeight);
    const position = tip.clone().addScaledVector(unit, tipHeight * scale);
    return new THREE.Matrix4().compose(position, turn, new THREE.Vector3(scale, scale, scale));
  }

  /**
   * Returns the segment end points: a shaft, a four-sided head with its rim,
   * and a small cross at the tail.
   *
   * @returns Flat xyz pairs, two points per segment.
   */
  private static segmentPoints(): number[] {
    const { tail, tip, headBase, headRadius, tailRadius } = MODIFIER_VOLUME_DIRECTION_ARROW_SHAPE;
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
