import { Matrix4, MathUtils, Vector3 } from 'three';
import type { ModifierBevelTrackedEdge } from './modifier_bevel_brush_edges.js';
import type { ModifierBevelGirder } from './modifier_bevel_uv_girder.js';
import { modifierBevelSignedTurn } from './modifier_bevel_uv_girder_angle.js';

/** World directions from an edge toward its two wall contacts. */
interface ModifierBevelGirderContacts {
  /** Direction toward the first wall. */
  dirA: Vector3;
  /** Direction toward the second wall. */
  dirB: Vector3;
  /** World length of the profile. */
  meters: number;
}

/**
 * Converts one tracked edge into a local girder.
 *
 * @param edge Tracked world edge.
 * @param inverse World-to-local matrix.
 * @returns Girder, or null when the profile vanishes.
 */
export function modifierBevelGirderFromEdge(
  edge: ModifierBevelTrackedEdge,
  inverse: Matrix4,
): ModifierBevelGirder | null {
  const contacts = modifierBevelWorldContacts(edge);
  if (!contacts) return null;
  return modifierBevelLocalGirder(edge, contacts, inverse);
}

/**
 * Measures the wall-contact directions and the profile length.
 *
 * @param edge Tracked world edge.
 * @returns Contacts, or null when a direction vanishes.
 */
function modifierBevelWorldContacts(edge: ModifierBevelTrackedEdge): ModifierBevelGirderContacts | null {
  const direction = edge.end.clone().sub(edge.start);
  if (direction.lengthSq() < 1e-12) return null;
  direction.normalize();
  const dirA = modifierBevelContactDirection(edge.normalA, edge.normalB, direction);
  const dirB = modifierBevelContactDirection(edge.normalB, edge.normalA, direction);
  if (!dirA || !dirB) return null;
  return { dirA, dirB, meters: modifierBevelProfileMeters(edge, dirA, dirB) };
}

/**
 * Returns the direction from the edge along one wall, away from the other.
 *
 * @param faceNormal Outward normal of the wall.
 * @param otherNormal Outward normal of the other wall.
 * @param edgeDirection Unit direction along the edge.
 * @returns Unit direction, or null when it vanishes.
 */
function modifierBevelContactDirection(
  faceNormal: Vector3,
  otherNormal: Vector3,
  edgeDirection: Vector3,
): Vector3 | null {
  const inset = new Vector3().crossVectors(faceNormal, edgeDirection);
  if (inset.lengthSq() < 1e-12) return null;
  inset.normalize();
  if (inset.dot(otherNormal) > 0) inset.negate();
  return inset;
}

/**
 * Returns the world length of the full profile.
 *
 * @param edge Tracked world edge.
 * @param dirA Direction toward the first wall.
 * @param dirB Direction toward the second wall.
 * @returns Meters.
 */
function modifierBevelProfileMeters(edge: ModifierBevelTrackedEdge, dirA: Vector3, dirB: Vector3): number {
  const omega = Math.acos(MathUtils.clamp(edge.normalA.dot(edge.normalB), -1, 1));
  if (edge.segments <= 1) return modifierBevelChordMeters(dirA, dirB, edge.distance);
  return modifierBevelArcMeters(edge.distance, omega);
}

/**
 * Returns the straight distance between the two wall contacts.
 *
 * @param dirA Direction toward the first wall.
 * @param dirB Direction toward the second wall.
 * @param distance Distance along each wall.
 * @returns Meters.
 */
function modifierBevelChordMeters(dirA: Vector3, dirB: Vector3, distance: number): number {
  const left = dirA.clone().multiplyScalar(distance);
  return left.distanceTo(dirB.clone().multiplyScalar(distance));
}

/**
 * Returns the circular profile length.
 *
 * @param distance Distance along each wall.
 * @param omega Angle between the outward normals, in radians.
 * @returns Meters.
 */
function modifierBevelArcMeters(distance: number, omega: number): number {
  const tangent = Math.tan(omega * 0.5);
  if (tangent < 1e-4) return distance;
  return (distance / tangent) * omega;
}

/**
 * Stores the edge in brush-local space.
 *
 * @param edge Tracked world edge.
 * @param contacts World contact directions.
 * @param inverse World-to-local matrix.
 * @returns Local girder.
 */
function modifierBevelLocalGirder(
  edge: ModifierBevelTrackedEdge,
  contacts: ModifierBevelGirderContacts,
  inverse: Matrix4,
): ModifierBevelGirder {
  const start = edge.start.clone().applyMatrix4(inverse);
  const end = edge.end.clone().applyMatrix4(inverse);
  return modifierBevelGirderRecord(edge, contacts, inverse, start, end);
}

/**
 * Assembles the local girder fields.
 *
 * @param edge Tracked world edge.
 * @param contacts World contact directions.
 * @param inverse World-to-local matrix.
 * @param start Local start.
 * @param end Local end.
 * @returns Local girder.
 */
function modifierBevelGirderRecord(
  edge: ModifierBevelTrackedEdge,
  contacts: ModifierBevelGirderContacts,
  inverse: Matrix4,
  start: Vector3,
  end: Vector3,
): ModifierBevelGirder {
  return {
    direction: modifierBevelLocalDirection(start, end, contacts, inverse),
    origin: modifierBevelLengthOrigin(start, end),
    start,
    end,
    contactA: contacts.dirA.clone().transformDirection(inverse),
    contactB: contacts.dirB.clone().transformDirection(inverse),
    profileMeters: Math.max(contacts.meters, 1e-8),
    edgeMeters: Math.max(edge.start.distanceTo(edge.end), 1e-8),
  };
}

/**
 * Returns a local edge direction whose profile turn is positive.
 *
 * @param start Local start.
 * @param end Local end.
 * @param contacts World contact directions.
 * @param inverse World-to-local matrix.
 * @returns Unit direction.
 */
function modifierBevelLocalDirection(
  start: Vector3,
  end: Vector3,
  contacts: ModifierBevelGirderContacts,
  inverse: Matrix4,
): Vector3 {
  const direction = end.clone().sub(start);
  if (direction.lengthSq() < 1e-12) return new Vector3(1, 0, 0);
  direction.normalize();
  return modifierBevelOrientDirection(direction, contacts, inverse);
}

/**
 * Flips the direction when the profile turn is negative.
 *
 * @param direction Candidate unit direction.
 * @param contacts World contact directions.
 * @param inverse World-to-local matrix.
 * @returns Oriented direction.
 */
function modifierBevelOrientDirection(
  direction: Vector3,
  contacts: ModifierBevelGirderContacts,
  inverse: Matrix4,
): Vector3 {
  const contactA = contacts.dirA.clone().transformDirection(inverse);
  const contactB = contacts.dirB.clone().transformDirection(inverse);
  if (modifierBevelSignedTurn(contactA, contactB, direction) < 0) direction.negate();
  return direction;
}

/**
 * Picks the endpoint closer to the brush origin.
 *
 * @param start Local start.
 * @param end Local end.
 * @returns Length origin.
 */
function modifierBevelLengthOrigin(start: Vector3, end: Vector3): Vector3 {
  if (Math.abs(start.lengthSq() - end.lengthSq()) > 1e-8) return modifierBevelNearerOrigin(start, end);
  return modifierBevelLowerPoint(start, end);
}

/**
 * Returns the endpoint nearer the brush origin.
 *
 * @param start Local start.
 * @param end Local end.
 * @returns Closer point.
 */
function modifierBevelNearerOrigin(start: Vector3, end: Vector3): Vector3 {
  return start.lengthSq() < end.lengthSq() ? start.clone() : end.clone();
}

/**
 * Breaks an origin tie by the lower coordinate.
 *
 * @param start Local start.
 * @param end Local end.
 * @returns Lower point.
 */
function modifierBevelLowerPoint(start: Vector3, end: Vector3): Vector3 {
  if (start.x !== end.x) return start.x < end.x ? start.clone() : end.clone();
  if (start.y !== end.y) return start.y < end.y ? start.clone() : end.clone();
  return start.z <= end.z ? start.clone() : end.clone();
}
