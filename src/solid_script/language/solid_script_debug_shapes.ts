import * as THREE from 'three';

/** One segment of a drawing, from x, y, z to x, y, z. */
export type SolidScriptDebugSegment = readonly [number, number, number, number, number, number];

/** Segments a drawn circle is made of. */
const SOLID_SCRIPT_DEBUG_CIRCLE_SEGMENTS = 32;

/** Length of an arrow head, as a part of the arrow. */
const SOLID_SCRIPT_DEBUG_HEAD = 0.2;

/**
 * Returns the segment between two points.
 *
 * @param from Start.
 * @param to End.
 * @returns Segment.
 */
export function solidScriptDebugSegment(from: THREE.Vector3, to: THREE.Vector3): SolidScriptDebugSegment {
  return [from.x, from.y, from.z, to.x, to.y, to.z];
}

/**
 * Returns the 12 edges of a box.
 *
 * @param center Center.
 * @param size Size along x, y and z.
 * @returns Segments.
 */
export function solidScriptDebugBox(center: THREE.Vector3, size: THREE.Vector3): SolidScriptDebugSegment[] {
  const corner = (index: number): THREE.Vector3 =>
    new THREE.Vector3(index & 1 ? 0.5 : -0.5, index & 2 ? 0.5 : -0.5, index & 4 ? 0.5 : -0.5)
      .multiply(size)
      .add(center);
  const segments: SolidScriptDebugSegment[] = [];
  for (let index = 0; index < 8; index++)
    for (const bit of [1, 2, 4])
      if (!(index & bit)) segments.push(solidScriptDebugSegment(corner(index), corner(index | bit)));
  return segments;
}

/**
 * Returns a circle around an axis.
 *
 * @param center Center.
 * @param radius Radius.
 * @param normal Axis the circle turns around; need not be 1 long.
 * @returns Segments.
 */
export function solidScriptDebugCircle(
  center: THREE.Vector3,
  radius: number,
  normal: THREE.Vector3,
): SolidScriptDebugSegment[] {
  const axis = normal.lengthSq() > 1e-12 ? normal.clone().normalize() : new THREE.Vector3(0, 1, 0);
  const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
  const at = (step: number): THREE.Vector3 => {
    const angle = (step / SOLID_SCRIPT_DEBUG_CIRCLE_SEGMENTS) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0).applyQuaternion(turn).add(center);
  };
  return Array.from({ length: SOLID_SCRIPT_DEBUG_CIRCLE_SEGMENTS }, (_, step) =>
    solidScriptDebugSegment(at(step), at(step + 1)),
  );
}

/**
 * Returns a sphere as its three circles around x, y and z.
 *
 * @param center Center.
 * @param radius Radius.
 * @returns Segments.
 */
export function solidScriptDebugSphere(center: THREE.Vector3, radius: number): SolidScriptDebugSegment[] {
  return [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)].flatMap((axis) =>
    solidScriptDebugCircle(center, radius, axis),
  );
}

/**
 * Returns an arrow: its shaft, then four strokes of its head.
 *
 * @param from Tail.
 * @param to Tip.
 * @returns Segments, the shaft first.
 */
export function solidScriptDebugArrow(from: THREE.Vector3, to: THREE.Vector3): SolidScriptDebugSegment[] {
  const shaft = to.clone().sub(from);
  const length = shaft.length();
  if (length < 1e-12) return [solidScriptDebugSegment(from, to)];
  const back = shaft.clone().multiplyScalar(-SOLID_SCRIPT_DEBUG_HEAD);
  const side = new THREE.Vector3().crossVectors(
    shaft,
    Math.abs(shaft.y) < length * 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0),
  );
  side.setLength(length * SOLID_SCRIPT_DEBUG_HEAD * 0.5);
  const up = new THREE.Vector3().crossVectors(shaft, side).setLength(side.length());
  const heads = [side, side.clone().negate(), up, up.clone().negate()].map((offset) =>
    solidScriptDebugSegment(to, to.clone().add(back).add(offset)),
  );
  return [solidScriptDebugSegment(from, to), ...heads];
}
