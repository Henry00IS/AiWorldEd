import { MathUtils, Vector3 } from 'three';
import { SolidPlane } from '@/solid/brush/solid_plane.js';
import { modifierBevelPlaneForEdge } from './modifier_bevel_plane.js';

/**
 * Builds clip planes for one edge. One segment is the flat chamfer. More
 * segments sample a circular arc between the same face contact points.
 *
 * @param edgePoint A point on the edge.
 * @param edgeDirection Unit direction along the edge.
 * @param normalA Outward unit normal of the first face.
 * @param normalB Outward unit normal of the second face.
 * @param distance Distance along each face from the edge.
 * @param segments Profile face count, at least 1.
 * @returns Planes, or an empty list when the corner cannot be cut.
 */
export function modifierBevelPlanesForEdge(
  edgePoint: Vector3,
  edgeDirection: Vector3,
  normalA: Vector3,
  normalB: Vector3,
  distance: number,
  segments: number,
): SolidPlane[] {
  if (segments <= 1) {
    const plane = modifierBevelPlaneForEdge(edgePoint, normalA, normalB, distance);
    return plane ? [plane] : [];
  }
  return modifierBevelArcPlanes(edgePoint, edgeDirection, normalA, normalB, distance, segments);
}

/**
 * Samples a circular profile and emits one plane per arc chord.
 *
 * @param edgePoint A point on the edge.
 * @param edgeDirection Unit direction along the edge.
 * @param normalA Outward unit normal of the first face.
 * @param normalB Outward unit normal of the second face.
 * @param distance Distance along each face from the edge.
 * @param segments Profile face count.
 * @returns Chord planes.
 */
function modifierBevelArcPlanes(
  edgePoint: Vector3,
  edgeDirection: Vector3,
  normalA: Vector3,
  normalB: Vector3,
  distance: number,
  segments: number,
): SolidPlane[] {
  const radius = modifierBevelProfileRadius(normalA, normalB, distance);
  if (radius === null) return [];
  const omega = Math.acos(MathUtils.clamp(normalA.dot(normalB), -1, 1));
  const center = modifierBevelArcCenter(edgePoint, normalA, normalB, radius, omega);
  const samples = modifierBevelArcSamples(center, normalA, normalB, radius, omega, segments);
  return modifierBevelChordPlanes(samples, edgeDirection, normalA, normalB);
}

/**
 * Returns the circle radius whose tangents meet the faces at `distance`.
 *
 * @param normalA First outward unit normal.
 * @param normalB Second outward unit normal.
 * @param distance Distance along each face.
 * @returns Radius, or null when the corner is too flat.
 */
export function modifierBevelProfileRadius(normalA: Vector3, normalB: Vector3, distance: number): number | null {
  const omega = Math.acos(MathUtils.clamp(normalA.dot(normalB), -1, 1));
  return modifierBevelArcRadius(distance, omega);
}

/**
 * Returns the circle radius whose tangents meet the faces at `distance`.
 *
 * @param distance Distance along each face.
 * @param omega Angle between the outward normals, in radians.
 * @returns Radius, or null when the corner is too flat.
 */
function modifierBevelArcRadius(distance: number, omega: number): number | null {
  const tangent = Math.tan(omega * 0.5);
  if (tangent < 1e-4) return null;
  return distance / tangent;
}

/**
 * Places the profile circle center inside the solid.
 *
 * @param edgePoint A point on the edge.
 * @param normalA First outward normal.
 * @param normalB Second outward normal.
 * @param radius Circle radius.
 * @param omega Angle between the normals.
 * @returns Center point.
 */
function modifierBevelArcCenter(
  edgePoint: Vector3,
  normalA: Vector3,
  normalB: Vector3,
  radius: number,
  omega: number,
): Vector3 {
  const inward = new Vector3().addVectors(normalA, normalB).negate().normalize();
  return edgePoint.clone().addScaledVector(inward, radius / Math.cos(omega * 0.5));
}

/**
 * Samples the arc from the first face normal to the second, including both
 * ends.
 *
 * @param center Circle center.
 * @param normalA First outward normal.
 * @param normalB Second outward normal.
 * @param radius Circle radius.
 * @param omega Angle between the normals.
 * @param segments Chord count.
 * @returns Sample points from the first contact to the second.
 */
function modifierBevelArcSamples(
  center: Vector3,
  normalA: Vector3,
  normalB: Vector3,
  radius: number,
  omega: number,
  segments: number,
): Vector3[] {
  const samples: Vector3[] = [];
  for (let step = 0; step <= segments; step += 1) {
    const direction = modifierBevelSlerpNormal(normalA, normalB, step / segments, omega);
    samples.push(center.clone().addScaledVector(direction, radius));
  }
  return samples;
}

/**
 * Spherical lerp between two unit normals.
 *
 * @param normalA Start normal.
 * @param normalB End normal.
 * @param factor 0 at the start, 1 at the end.
 * @param omega Angle between the normals.
 * @returns Unit direction.
 */
export function modifierBevelSlerpNormal(normalA: Vector3, normalB: Vector3, factor: number, omega: number): Vector3 {
  if (omega < 1e-5) return normalA.clone().lerp(normalB, factor).normalize();
  const sine = Math.sin(omega);
  const weightA = Math.sin((1 - factor) * omega) / sine;
  const weightB = Math.sin(factor * omega) / sine;
  return normalA.clone().multiplyScalar(weightA).addScaledVector(normalB, weightB).normalize();
}

/**
 * Builds an outward plane for each consecutive arc sample.
 *
 * @param samples Arc samples including both ends.
 * @param edgeDirection Unit edge direction.
 * @param normalA First face normal, used to face the plane outward.
 * @param normalB Second face normal, used to face the plane outward.
 * @returns Chord planes.
 */
function modifierBevelChordPlanes(
  samples: Vector3[],
  edgeDirection: Vector3,
  normalA: Vector3,
  normalB: Vector3,
): SolidPlane[] {
  const outward = new Vector3().addVectors(normalA, normalB);
  const planes: SolidPlane[] = [];
  for (let index = 1; index < samples.length; index += 1) {
    const start = samples[index - 1];
    const end = samples[index];
    if (!start || !end) continue;
    const plane = modifierBevelChordPlane(start, end, edgeDirection, outward);
    if (plane) planes.push(plane);
  }
  return planes;
}

/**
 * Builds one plane containing an arc chord extruded along the edge.
 *
 * @param start Chord start.
 * @param end Chord end.
 * @param edgeDirection Unit edge direction.
 * @param outwardHint Direction that must agree with the plane normal.
 * @returns Plane, or null when the chord is degenerate.
 */
function modifierBevelChordPlane(
  start: Vector3,
  end: Vector3,
  edgeDirection: Vector3,
  outwardHint: Vector3,
): SolidPlane | null {
  const chord = new Vector3().subVectors(end, start);
  if (chord.lengthSq() < 1e-12) return null;
  const normal = new Vector3().crossVectors(edgeDirection, chord);
  if (normal.lengthSq() < 1e-12) return null;
  normal.normalize();
  if (normal.dot(outwardHint) < 0) normal.negate();
  return new SolidPlane(normal, -normal.dot(start));
}
