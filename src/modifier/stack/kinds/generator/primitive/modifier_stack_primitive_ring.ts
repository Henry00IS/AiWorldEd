import * as THREE from 'three';

/** Elliptical ring fitted to a box, seen from above. */
export interface ModifierStackRingFrame {
  /** Box centre; only X and Z are used. */
  center: THREE.Vector3;
  /** Semi-axis along X, in metres. */
  radiusX: number;
  /** Semi-axis along Z, in metres. */
  radiusZ: number;
  /** 1 turns counter-clockwise seen from above, -1 clockwise. */
  direction: number;
}

/**
 * Builds the ring that touches the box on all four sides.
 *
 * @param box Volume box in frame coordinates.
 * @param direction 1 for counter-clockwise seen from above, -1 for clockwise.
 * @returns Ring frame.
 */
export function modifierStackRingFrame(box: THREE.Box3, direction = 1): ModifierStackRingFrame {
  const size = box.getSize(new THREE.Vector3());
  return { center: box.getCenter(new THREE.Vector3()), radiusX: size.x / 2, radiusZ: size.z / 2, direction };
}

/**
 * Returns the boundary angles of the segments of a sweep, in radians. A whole
 * turn uses the side count; a partial sweep uses the same angle per segment,
 * rounded up to whole segments.
 *
 * @param sweepDegrees Sweep angle in degrees.
 * @param sides Segments of a whole turn.
 * @returns Segment boundary angles from 0 to the sweep.
 */
export function modifierStackRingAngles(sweepDegrees: number, sides: number): number[] {
  const sweep = THREE.MathUtils.degToRad(sweepDegrees);
  const segments = Math.max(1, Math.ceil((sides * sweepDegrees) / 360 - 1e-9));
  return Array.from({ length: segments + 1 }, (_, index) => (sweep * index) / segments);
}

/**
 * Returns a point moved inward from the ring along its normal, so walls keep
 * the same thickness all the way around an oval ring.
 *
 * @param frame Ring frame.
 * @param angle Angle in radians from +X.
 * @param inset Distance inward from the ring, in metres.
 * @param y Height in frame coordinates.
 * @returns Point in frame coordinates.
 */
export function modifierStackRingPoint(
  frame: ModifierStackRingFrame,
  angle: number,
  inset: number,
  y: number,
): THREE.Vector3 {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle) * frame.direction;
  const normal = new THREE.Vector2(cosine / Math.max(frame.radiusX, 1e-9), sine / Math.max(frame.radiusZ, 1e-9));
  normal.normalize();
  const x = frame.radiusX * cosine - inset * normal.x;
  const z = frame.radiusZ * sine - inset * normal.y;
  return new THREE.Vector3(frame.center.x + x, y, frame.center.z - z);
}

/**
 * Returns a point on a smaller copy of the ring, scaled toward its centre.
 *
 * @param frame Ring frame.
 * @param angle Angle in radians from +X.
 * @param scale 1 on the ring, 0 at the centre.
 * @param y Height in frame coordinates.
 * @returns Point in frame coordinates.
 */
export function modifierStackRingScaledPoint(
  frame: ModifierStackRingFrame,
  angle: number,
  scale: number,
  y: number,
): THREE.Vector3 {
  const x = frame.radiusX * Math.cos(angle) * scale;
  const z = frame.radiusZ * Math.sin(angle) * frame.direction * scale;
  return new THREE.Vector3(frame.center.x + x, y, frame.center.z - z);
}

/**
 * Returns the largest inset that keeps the inner outline of an oval ring free
 * of loops: its tightest radius of curvature.
 *
 * @param frame Ring frame.
 * @returns Inset limit in metres.
 */
export function modifierStackRingInsetLimit(frame: ModifierStackRingFrame): number {
  const small = Math.min(frame.radiusX, frame.radiusZ);
  const large = Math.max(frame.radiusX, frame.radiusZ, 1e-9);
  return (small * small) / large;
}
