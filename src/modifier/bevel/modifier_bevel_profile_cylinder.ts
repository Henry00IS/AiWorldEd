import { MathUtils, Vector3 } from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { modifierBevelCenterPlane, modifierBevelWallNormal } from './modifier_bevel_center_plane.js';
import type { ModifierBevelDerivedBrush } from './modifier_bevel_derived.js';
import type { ModifierBevelGirder } from './modifier_bevel_uv_girder.js';
import type { SolidPlane } from '@/solid/brush/solid_plane.js';

/** Circle swept along one authored edge. */
interface ModifierBevelProfileCylinder {
  /** Point on the circle-center line. */
  origin: Vector3;
  /** Unit edge direction. */
  direction: Vector3;
  /** Circle radius. */
  radius: number;
  /** Outward normal of the first wall. */
  normalA: Vector3;
  /** Outward normal of the second wall. */
  normalB: Vector3;
  /** Angle between the outward normals. */
  omega: number;
  /** Authored edge start. */
  start: Vector3;
  /** Authored edge end. */
  end: Vector3;
}

/**
 * Returns the girder whose profile cylinder contains every vertex of a face.
 *
 * @param brush Chamfered brush.
 * @param girders Authored edges.
 * @param faceIndex Face index.
 * @returns Girder index, or -1 when the face is not one edge's strip.
 */
export function modifierBevelGirderForFace(
  brush: SolidBrush,
  girders: readonly ModifierBevelGirder[],
  faceIndex: number,
): number {
  const face = brush.faces[faceIndex];
  const normal = brush.planes[faceIndex]?.normal;
  const points = face ? brush.getFaceVertices(face) : [];
  if (!normal || points.length < 3) return -1;
  return modifierBevelMatchingGirder(girders, points, normal);
}

/**
 * Returns whether every vertex of a face lies on one profile cylinder.
 *
 * @param brush Chamfered brush.
 * @param girders Authored edges.
 * @param faceIndex Face index.
 * @returns True when the face belongs to one edge.
 */
export function modifierBevelFaceOnGirderCylinder(
  brush: SolidBrush,
  girders: readonly ModifierBevelGirder[],
  faceIndex: number,
): boolean {
  return modifierBevelGirderForFace(brush, girders, faceIndex) >= 0;
}

/**
 * Returns the center plane of the edge that owns a profile face.
 *
 * @param shell Derived brush.
 * @param faceIndex Face on the curve.
 * @returns Plane, or null when the face is not on one cylinder.
 */
export function modifierBevelFaceCenterPlane(shell: ModifierBevelDerivedBrush, faceIndex: number): SolidPlane | null {
  const index = modifierBevelGirderForFace(shell.localBrush, shell.girders, faceIndex);
  return modifierBevelCenterPlane(shell.girders[index]);
}

/**
 * Returns the only girder that contains every point.
 *
 * @param girders Authored edges.
 * @param points Face vertices.
 * @returns Girder index, or -1 when none or more than one match.
 */
function modifierBevelMatchingGirder(
  girders: readonly ModifierBevelGirder[],
  points: readonly Vector3[],
  normal: Vector3,
): number {
  let found = -1;
  for (let index = 0; index < girders.length; index += 1) {
    if (!modifierBevelPointsFitGirder(girders[index], points, normal)) continue;
    if (found >= 0) return -1;
    found = index;
  }
  return found;
}

/**
 * Returns whether a face lies on one girder's profile chords.
 *
 * @param girder Authored edge.
 * @param points Face vertices.
 * @param normal Face normal.
 * @returns True when the points belong to that edge.
 */
function modifierBevelPointsFitGirder(
  girder: ModifierBevelGirder | undefined,
  points: readonly Vector3[],
  normal: Vector3,
): boolean {
  const cylinder = modifierBevelProfileCylinder(girder);
  if (!cylinder || Math.abs(normal.dot(cylinder.direction)) > 0.02) return false;
  return modifierBevelWithinChord(cylinder, points);
}

/**
 * Builds the swept circle of one edge.
 *
 * @param girder Authored edge.
 * @returns Cylinder, or null when the profile is flat.
 */
function modifierBevelProfileCylinder(girder: ModifierBevelGirder | undefined): ModifierBevelProfileCylinder | null {
  if (!girder) return null;
  const normalA = modifierBevelWallNormal(girder.direction, girder.contactA, girder.contactB);
  const normalB = modifierBevelWallNormal(girder.direction, girder.contactB, girder.contactA);
  const omega = Math.acos(MathUtils.clamp(normalA.dot(normalB), -1, 1));
  if (omega < 1e-3 || normalA.lengthSq() < 0.5 || normalB.lengthSq() < 0.5) return null;
  return modifierBevelCylinderRecord(girder, normalA, normalB, omega);
}

/**
 * Stores the circle center line and the two walls.
 *
 * @param girder Authored edge.
 * @param normalA First outward normal.
 * @param normalB Second outward normal.
 * @param omega Angle between the normals.
 * @returns Cylinder.
 */
function modifierBevelCylinderRecord(
  girder: ModifierBevelGirder,
  normalA: Vector3,
  normalB: Vector3,
  omega: number,
): ModifierBevelProfileCylinder {
  const radius = modifierBevelLocalRadius(girder, omega);
  const inward = normalA.clone().add(normalB).negate().normalize();
  return {
    origin: girder.start.clone().addScaledVector(inward, radius / Math.cos(omega * 0.5)),
    direction: girder.direction,
    radius,
    normalA,
    normalB,
    omega,
    start: girder.start,
    end: girder.end,
  };
}

/**
 * Returns how far a point sits from the profile circle.
 *
 * @param cylinder Swept circle.
 * @param point Candidate.
 * @returns Absolute radial error.
 */
function modifierBevelRadialGap(cylinder: ModifierBevelProfileCylinder, point: Vector3): number {
  return Math.abs(modifierBevelRadial(cylinder, point).length() - cylinder.radius);
}

/**
 * Returns whether every point stays within the chord of its own profile span.
 *
 * @param cylinder Swept circle.
 * @param points Face vertices.
 * @returns True when no vertex sinks deeper than that chord.
 */
function modifierBevelWithinChord(cylinder: ModifierBevelProfileCylinder, points: readonly Vector3[]): boolean {
  if (!points.every((point) => modifierBevelPointOnArc(cylinder, point))) return false;
  const span = modifierBevelAngleSpan(cylinder, points);
  const sag = cylinder.radius * (1 - Math.cos(Math.min(span, Math.PI)));
  return points.every((point) => modifierBevelRadialGap(cylinder, point) <= sag + 1e-4);
}

/**
 * Returns the circle radius in brush-local units.
 *
 * @param girder Authored edge.
 * @param omega Angle between the outward normals.
 * @returns Local radius.
 */
function modifierBevelLocalRadius(girder: ModifierBevelGirder, omega: number): number {
  const localSpan = girder.start.distanceTo(girder.end);
  const scale = girder.edgeMeters > 1e-8 ? localSpan / girder.edgeMeters : 1;
  return (girder.profileMeters / omega) * scale;
}

const modifierBevelExplainedBrushes = new WeakMap<SolidBrush, boolean>();

/**
 * Returns whether any generated face lies on a profile cylinder.
 *
 * @param brush Chamfered brush.
 * @param girders Authored edges.
 * @returns True when the cylinder test can reject corner faces.
 */
export function modifierBevelCylinderExplains(derived: ModifierBevelDerivedBrush): boolean {
  const cached = modifierBevelExplainedBrushes.get(derived.localBrush);
  if (cached !== undefined) return cached;
  const explained = modifierBevelBrushHasCylinderFace(derived);
  modifierBevelExplainedBrushes.set(derived.localBrush, explained);
  return explained;
}

/**
 * Returns whether most plain chamfer faces lie on a profile cylinder.
 *
 * @param derived Derived brush.
 * @returns True when the cylinder test can reject corner faces.
 */
function modifierBevelBrushHasCylinderFace(derived: ModifierBevelDerivedBrush): boolean {
  let plain = 0;
  let matched = 0;
  for (let face = 0; face < derived.faces.length; face += 1) {
    const record = derived.faces[face];
    if (!record?.chamferEdge || record.cornerFace) continue;
    plain += 1;
    if (modifierBevelFaceOnGirderCylinder(derived.localBrush, derived.girders, face)) matched += 1;
  }
  return plain > 0 && matched * 2 >= plain;
}

/**
 * Returns whether a point lies along the edge and on the minor arc.
 *
 * @param cylinder Swept circle.
 * @param point Candidate.
 * @returns True when the point is in the profile wedge.
 */
function modifierBevelPointOnArc(cylinder: ModifierBevelProfileCylinder, point: Vector3): boolean {
  if (!modifierBevelAlongEdge(cylinder, point)) return false;
  return modifierBevelOnMinorArc(modifierBevelRadial(cylinder, point), cylinder);
}

/**
 * Returns the angle covered by the face around the profile.
 *
 * @param cylinder Swept circle.
 * @param points Face vertices.
 * @returns Radians from the first wall toward the second.
 */
function modifierBevelAngleSpan(cylinder: ModifierBevelProfileCylinder, points: readonly Vector3[]): number {
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    const angle = modifierBevelProfileAngle(cylinder, point);
    low = Math.min(low, angle);
    high = Math.max(high, angle);
  }
  if (!Number.isFinite(low) || !Number.isFinite(high)) return 0;
  return Math.max(0, high - low);
}

/**
 * Returns the angle of a point from the first wall.
 *
 * @param cylinder Swept circle.
 * @param point Candidate.
 * @returns Radians.
 */
function modifierBevelProfileAngle(cylinder: ModifierBevelProfileCylinder, point: Vector3): number {
  const radial = modifierBevelRadial(cylinder, point);
  const side = new Vector3().crossVectors(cylinder.direction, cylinder.normalA);
  if (side.dot(cylinder.normalB) < 0) side.negate();
  if (side.lengthSq() < 1e-12) return 0;
  return Math.atan2(radial.dot(side.normalize()), radial.dot(cylinder.normalA));
}

/**
 * Returns whether a point projects onto the authored edge.
 *
 * @param cylinder Swept circle.
 * @param point Candidate.
 * @returns True when the projection stays on the segment.
 */
function modifierBevelAlongEdge(cylinder: ModifierBevelProfileCylinder, point: Vector3): boolean {
  const axis = cylinder.end.clone().sub(cylinder.start);
  const length = axis.lengthSq();
  if (length < 1e-12) return false;
  const travel = point.clone().sub(cylinder.start).dot(axis) / length;
  return travel >= -1e-3 && travel <= 1 + 1e-3;
}

/**
 * Returns the vector from the circle center line to a point.
 *
 * @param cylinder Swept circle.
 * @param point Candidate.
 * @returns Radial vector.
 */
function modifierBevelRadial(cylinder: ModifierBevelProfileCylinder, point: Vector3): Vector3 {
  const offset = point.clone().sub(cylinder.origin);
  return offset.sub(cylinder.direction.clone().multiplyScalar(offset.dot(cylinder.direction)));
}

/**
 * Returns whether a radial vector lies on the arc between the two walls.
 *
 * @param radial Vector from the circle center to the point.
 * @param cylinder Swept circle.
 * @returns True when the direction is between the outward normals.
 */
function modifierBevelOnMinorArc(radial: Vector3, cylinder: ModifierBevelProfileCylinder): boolean {
  if (radial.lengthSq() < 1e-12) return false;
  const direction = radial.clone().normalize();
  const fromA = Math.acos(MathUtils.clamp(direction.dot(cylinder.normalA), -1, 1));
  const fromB = Math.acos(MathUtils.clamp(direction.dot(cylinder.normalB), -1, 1));
  return fromA <= cylinder.omega + 0.05 && fromB <= cylinder.omega + 0.05;
}
