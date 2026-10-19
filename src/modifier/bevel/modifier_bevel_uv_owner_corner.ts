import { Vector3 } from 'three';
import type { SolidPlane } from '@/solid/brush/solid_plane.js';
import type { ModifierBevelFaceRecord } from './modifier_bevel_face_record.js';
import type { ModifierBevelDerivedBrush } from './modifier_bevel_derived.js';
import {
  modifierBevelNeighborFaces,
  modifierBevelSharedEdge,
  modifierBevelSharedEdgeLength,
} from './modifier_bevel_face_graph.js';
import { modifierBevelSmearEdge } from './modifier_bevel_face_record.js';
import { modifierBevelProfileStrip } from './modifier_bevel_uv_layout_profile.js';
import { modifierBevelCylinderExplains, modifierBevelFaceCenterPlane } from './modifier_bevel_profile_cylinder.js';
import { modifierBevelBisectCornerFaces } from './modifier_bevel_corner_face_bisect.js';
import { modifierBevelApplyStripLips, modifierBevelClaimCutBands } from './modifier_bevel_corner_strip_lip.js';
import { modifierBevelRetargetForeignSmears } from './modifier_bevel_corner_face_bisect_apply.js';
import { modifierBevelPullCornerSeams } from './modifier_bevel_corner_seam.js';
import { modifierBevelAbsorbCornerSpecks } from './modifier_bevel_corner_sector.js';
import { modifierBevelSplitSpanningCorners } from './modifier_bevel_corner_face_span.js';

/**
 * Gives split-owned corners the wall each face actually meets.
 *
 * @param shell Derived brush.
 * @param records Face records after the edge curves were divided.
 * @param claimed Faces already given to a curve, including lips.
 */
export function modifierBevelSplitCornerOwners(
  shell: ModifierBevelDerivedBrush,
  records: ModifierBevelFaceRecord[],
  claimed: ReadonlySet<number>,
): void {
  shell.faces = records;
  modifierBevelBisectCornerFaces(shell, records, claimed);
  modifierBevelApplyStripLips(shell, records);
  modifierBevelSplitSpanningCorners(shell, records, claimed);
  const seen = new Set<number>(claimed);
  for (let face = 0; face < records.length; face += 1) modifierBevelAssignCornerComponent(shell, records, seen, face);
  modifierBevelAbsorbCornerSpecks(shell, records, claimed);
  modifierBevelCorrectDistantParents(shell, records);
  modifierBevelPullCornerSeams(shell, records);
  modifierBevelClaimCutBands(shell, records);
  modifierBevelRetargetForeignSmears(shell, records);
}

/**
 * Gives a corner face the authored wall it actually sits against.
 *
 * @param shell Derived brush.
 * @param records Face records.
 */
function modifierBevelCorrectDistantParents(
  shell: ModifierBevelDerivedBrush,
  records: ModifierBevelFaceRecord[],
): void {
  for (let face = 0; face < records.length; face += 1) modifierBevelCorrectDistantParent(shell, records, face);
}

/**
 * Reparents one corner face when its wall is far from the nearest wall.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param face Face index.
 */
function modifierBevelCorrectDistantParent(
  shell: ModifierBevelDerivedBrush,
  records: ModifierBevelFaceRecord[],
  face: number,
): void {
  const record = records[face];
  if (!record?.cornerFace || modifierBevelProfileStrip(shell, face)) return;
  if (modifierBevelSidedStrip(shell, records, new Set<number>(), face) >= 0) return;
  const center = modifierBevelFaceCenter(shell, face);
  const nearest = modifierBevelClosestAuthoredParent(shell, records, center);
  if (nearest < 0 || !modifierBevelParentIsDistant(shell, records, record.parentSurfaceIndex, nearest, center)) return;
  modifierBevelWriteCornerParent(shell, records, face, nearest, modifierBevelWallFace(records, nearest));
}

/**
 * Returns whether the current wall is clearly farther than another.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param parent Current wall.
 * @param nearest Closer wall.
 * @param center Face center.
 * @returns True when the face should change walls.
 */
function modifierBevelParentIsDistant(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  parent: number,
  nearest: number,
  center: Vector3,
): boolean {
  const current = modifierBevelAuthoredParentDistance(shell, records, parent, center);
  const limit = modifierBevelAuthoredParentDistance(shell, records, nearest, center) + 0.05;
  return current > limit;
}

/**
 * Returns the authored wall closest to a point.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param point Face center.
 * @returns Parent index, or -1 when no wall remains.
 */
function modifierBevelClosestAuthoredParent(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  point: Vector3,
): number {
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < records.length; index += 1) {
    const chosen = modifierBevelCloserAuthoredParent(shell, records, point, index, best, bestDistance);
    best = chosen.parent;
    bestDistance = chosen.distance;
  }
  return best;
}

/**
 * Keeps the closer of the current wall and one authored face.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param point Face center.
 * @param index Face index.
 * @param best Best parent so far.
 * @param bestDistance Best distance so far.
 * @returns Updated parent and distance.
 */
function modifierBevelCloserAuthoredParent(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  point: Vector3,
  index: number,
  best: number,
  bestDistance: number,
): { parent: number; distance: number } {
  const distance = modifierBevelAuthoredFaceDistance(shell, records, index, point);
  const parent = records[index]?.parentSurfaceIndex ?? -1;
  if (parent < 0 || distance >= bestDistance) return { parent: best, distance: bestDistance };
  return { parent, distance };
}

/**
 * Returns the distance from a point to an authored face.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param index Face index.
 * @param point Face center.
 * @returns Absolute distance, or a huge value when the face is generated.
 */
function modifierBevelAuthoredFaceDistance(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  index: number,
  point: Vector3,
): number {
  const record = records[index];
  const plane = shell.localBrush.planes[index];
  if (!record || !plane || record.chamferEdge || record.cornerFace) return Number.POSITIVE_INFINITY;
  return Math.abs(plane.signedDistance(point));
}

/**
 * Returns the distance from a point to an authored parent.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param parent Authored parent.
 * @param point Face center.
 * @returns Absolute distance.
 */
function modifierBevelAuthoredParentDistance(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  parent: number,
  point: Vector3,
): number {
  for (let index = 0; index < records.length; index += 1) {
    if (records[index]?.parentSurfaceIndex !== parent) continue;
    const distance = modifierBevelAuthoredFaceDistance(shell, records, index, point);
    if (distance < Number.POSITIVE_INFINITY) return distance;
  }
  return Number.POSITIVE_INFINITY;
}

/**
 * Assigns one corner component when the face has not been visited.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param seen Faces already assigned.
 * @param face Candidate face.
 */
function modifierBevelAssignCornerComponent(
  shell: ModifierBevelDerivedBrush,
  records: ModifierBevelFaceRecord[],
  seen: Set<number>,
  face: number,
): void {
  if (seen.has(face) || !modifierBevelIsCornerPiece(shell, face)) return;
  const component = modifierBevelCornerComponent(shell, seen, face);
  for (const index of component) seen.add(index);
  if (modifierBevelFlowTriangle(shell, component)) return;
  modifierBevelAssignSectors(shell, records, component);
}

/**
 * Returns whether a component is the single straight chamfer triangle.
 *
 * @param shell Derived brush.
 * @param component Corner faces.
 * @returns True when the flow parent should stay.
 */
function modifierBevelFlowTriangle(shell: ModifierBevelDerivedBrush, component: readonly number[]): boolean {
  if (component.length !== 1) return false;
  const face = component[0];
  if (face === undefined) return false;
  const neighbors = modifierBevelNeighborFaces(shell.localBrush, face);
  if (neighbors.length !== 3) return false;
  return neighbors.every((neighbor) => modifierBevelProfileStrip(shell, neighbor));
}

/**
 * Returns whether a face is a corner cap rather than a profile strip.
 *
 * @param shell Derived brush.
 * @param faceIndex Face index.
 * @returns True when split ownership should retouch the face.
 */
function modifierBevelIsCornerPiece(shell: ModifierBevelDerivedBrush, faceIndex: number): boolean {
  const record = shell.faces[faceIndex];
  if (!record?.cornerFace && !record?.chamferEdge) return false;
  return !modifierBevelProfileStrip(shell, faceIndex);
}

/**
 * Lists the corner faces connected to a start, skipping faces already claimed.
 *
 * @param shell Derived brush.
 * @param blocked Faces a curve already owns.
 * @param start Start face.
 * @returns Component.
 */
function modifierBevelCornerComponent(
  shell: ModifierBevelDerivedBrush,
  blocked: ReadonlySet<number>,
  start: number,
): number[] {
  const component: number[] = [];
  const pending = [start];
  const seen = new Set<number>([start]);
  while (pending.length > 0) modifierBevelTakeCornerPiece(shell, blocked, component, pending, seen);
  return component;
}

/**
 * Claims one queued corner face and queues its corner neighbors.
 *
 * @param shell Derived brush.
 * @param blocked Faces a curve already owns.
 * @param component Component accumulator.
 * @param pending Faces still to visit.
 * @param seen Faces already queued.
 */
function modifierBevelTakeCornerPiece(
  shell: ModifierBevelDerivedBrush,
  blocked: ReadonlySet<number>,
  component: number[],
  pending: number[],
  seen: Set<number>,
): void {
  const faceIndex = pending.shift();
  if (faceIndex === undefined) return;
  component.push(faceIndex);
  modifierBevelQueueCornerPieces(shell, blocked, faceIndex, pending, seen);
}

/**
 * Queues neighboring corner faces that no curve owns.
 *
 * @param shell Derived brush.
 * @param blocked Faces a curve already owns.
 * @param faceIndex Current face.
 * @param pending Faces still to visit.
 * @param seen Faces already queued.
 */
function modifierBevelQueueCornerPieces(
  shell: ModifierBevelDerivedBrush,
  blocked: ReadonlySet<number>,
  faceIndex: number,
  pending: number[],
  seen: Set<number>,
): void {
  for (const neighbor of modifierBevelNeighborFaces(shell.localBrush, faceIndex)) {
    if (blocked.has(neighbor) || seen.has(neighbor) || !modifierBevelIsCornerPiece(shell, neighbor)) continue;
    seen.add(neighbor);
    pending.push(neighbor);
  }
}

/**
 * Writes a parent and smear source for every face in a component.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param component Corner faces.
 */
function modifierBevelAssignSectors(
  shell: ModifierBevelDerivedBrush,
  records: ModifierBevelFaceRecord[],
  component: readonly number[],
): void {
  const group = new Set(component);
  const walls = modifierBevelIncidentWalls(shell, records, component);
  for (const face of component) modifierBevelAssignSector(shell, records, group, walls, face);
  modifierBevelBalanceTiedSectors(shell, records, component, walls);
  modifierBevelLinkInteriorSectors(shell, records, component);
}

/**
 * Folds interior faces from a same-parent neighbor.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param component Corner faces.
 */
function modifierBevelLinkInteriorSectors(
  shell: ModifierBevelDerivedBrush,
  records: ModifierBevelFaceRecord[],
  component: readonly number[],
): void {
  for (let pass = 0; pass < component.length; pass += 1) {
    for (const face of component) modifierBevelLinkInteriorFace(shell, records, component, face);
  }
}

/**
 * Points one interior face at a same-parent neighbor.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param component Corner faces.
 * @param face Corner face.
 */
function modifierBevelLinkInteriorFace(
  shell: ModifierBevelDerivedBrush,
  records: ModifierBevelFaceRecord[],
  component: readonly number[],
  face: number,
): void {
  const record = records[face];
  if (!record || modifierBevelSharedEdge(shell.localBrush, face, record.smearFromDerivedIndex)) return;
  const source = modifierBevelSameParentNeighbor(shell, records, component, face, record.parentSurfaceIndex);
  if (source < 0) return;
  modifierBevelWriteCornerParent(shell, records, face, record.parentSurfaceIndex, source);
}

/**
 * Returns a neighbor in the component with the same parent.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param component Corner faces.
 * @param face Corner face.
 * @param parent Authored parent.
 * @returns Neighbor face, or -1.
 */
function modifierBevelSameParentNeighbor(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  component: readonly number[],
  face: number,
  parent: number,
): number {
  for (const neighbor of modifierBevelNeighborFaces(shell.localBrush, face)) {
    if (!component.includes(neighbor) || records[neighbor]?.parentSurfaceIndex !== parent) continue;
    if (modifierBevelSharedEdge(shell.localBrush, face, neighbor)) return neighbor;
  }
  return -1;
}

/**
 * Assigns one corner face to the wall its normal faces.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param group Faces in the component.
 * @param walls Walls that meet the component.
 * @param face Face index.
 */
function modifierBevelAssignSector(
  shell: ModifierBevelDerivedBrush,
  records: ModifierBevelFaceRecord[],
  group: ReadonlySet<number>,
  walls: readonly number[],
  face: number,
): void {
  const strip = modifierBevelSidedStrip(shell, records, group, face);
  const parent = modifierBevelNearestWall(shell, records, walls, face);
  if (strip >= 0) {
    modifierBevelWriteCornerParent(shell, records, face, records[strip]?.parentSurfaceIndex ?? parent, strip);
    return;
  }
  const touch = modifierBevelTouchOfParent(shell, records, group, face, parent);
  const source = touch >= 0 ? touch : modifierBevelWallFace(records, parent);
  modifierBevelWriteCornerParent(shell, records, face, parent, source);
}

/**
 * Returns the longest strip that owns the same side of its center plane.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param group Corner faces.
 * @param face Corner face.
 * @returns Strip face, or -1 when no strip owns this side.
 */
function modifierBevelSidedStrip(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  group: ReadonlySet<number>,
  face: number,
): number {
  const longest = modifierBevelLongestStrip(shell, group, face);
  if (longest < 0 || !modifierBevelFaceCenterPlane(shell, longest)) {
    if (longest >= 0 && modifierBevelCylinderExplains(shell)) return longest;
    if (longest < 0 || !modifierBevelStripIsNear(shell, records, face, longest)) return -1;
    return longest;
  }
  if (modifierBevelStripKeepsFace(shell, records, face, longest)) return longest;
  return modifierBevelSameSideStrip(shell, records, group, face);
}

/**
 * Returns the longest strip on the same side of its center plane.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param group Corner faces.
 * @param face Corner face.
 * @returns Strip face, or -1.
 */
function modifierBevelSameSideStrip(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  group: ReadonlySet<number>,
  face: number,
): number {
  let best = -1;
  let bestLength = 0;
  for (const neighbor of modifierBevelNeighborFaces(shell.localBrush, face)) {
    const chosen = modifierBevelConsiderSidedStrip(shell, records, group, face, neighbor, best, bestLength);
    best = chosen.strip;
    bestLength = chosen.length;
  }
  return best;
}

/**
 * Returns the profile strip that shares the longest edge.
 *
 * @param shell Derived brush.
 * @param group Corner faces.
 * @param face Corner face.
 * @returns Strip face, or -1.
 */
function modifierBevelLongestStrip(shell: ModifierBevelDerivedBrush, group: ReadonlySet<number>, face: number): number {
  let best = -1;
  let bestLength = 0;
  for (const neighbor of modifierBevelNeighborFaces(shell.localBrush, face)) {
    if (!modifierBevelOwnedStrip(shell, group, neighbor)) continue;
    const length = modifierBevelSharedEdgeLength(shell.localBrush, face, neighbor);
    if (length <= bestLength) continue;
    best = neighbor;
    bestLength = length;
  }
  return best;
}

/**
 * Keeps a strip when it is longer and on the same side as the face.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param group Corner faces.
 * @param face Corner face.
 * @param neighbor Candidate strip.
 * @param best Current strip.
 * @param bestLength Length of the current strip edge.
 * @returns Updated strip.
 */
function modifierBevelConsiderSidedStrip(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  group: ReadonlySet<number>,
  face: number,
  neighbor: number,
  best: number,
  bestLength: number,
): { strip: number; length: number } {
  if (!modifierBevelOwnedStrip(shell, group, neighbor)) return { strip: best, length: bestLength };
  if (!modifierBevelStripKeepsFace(shell, records, face, neighbor)) return { strip: best, length: bestLength };
  const length = modifierBevelSharedEdgeLength(shell.localBrush, face, neighbor);
  if (length <= bestLength) return { strip: best, length: bestLength };
  return { strip: neighbor, length };
}

/**
 * Returns whether a strip and a corner face share one side of the center plane.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param face Corner face.
 * @param strip Profile strip.
 * @returns True when the strip can own the face.
 */
function modifierBevelStripKeepsFace(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  face: number,
  strip: number,
): boolean {
  const plane = modifierBevelFaceCenterPlane(shell, strip);
  if (!plane) return modifierBevelStripIsNear(shell, records, face, strip);
  return modifierBevelSamePlaneSide(plane, modifierBevelFaceCenter(shell, face), modifierBevelFaceCenter(shell, strip));
}

/**
 * Returns whether two points are not on opposite sides of a plane.
 *
 * @param plane Center plane.
 * @param face Center of the corner face.
 * @param strip Center of the strip.
 * @returns True when the points agree.
 */
function modifierBevelSamePlaneSide(plane: SolidPlane, face: Vector3, strip: Vector3): boolean {
  const faceSide = plane.signedDistance(face);
  const stripSide = plane.signedDistance(strip);
  if (Math.abs(faceSide) <= 1e-3 || Math.abs(stripSide) <= 1e-3) return true;
  return faceSide * stripSide > 0;
}

/**
 * Returns whether a strip's wall is about as close as the nearest authored
 * wall.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param face Corner face.
 * @param strip Profile strip.
 * @returns True when the strip wall is near the face.
 */
function modifierBevelStripIsNear(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  face: number,
  strip: number,
): boolean {
  const parent = records[strip]?.parentSurfaceIndex ?? -1;
  if (parent < 0) return false;
  const center = modifierBevelFaceCenter(shell, face);
  const nearest = modifierBevelClosestAuthoredParent(shell, records, center);
  const distance = modifierBevelWallDistance(shell, records, parent, center);
  const limit = modifierBevelWallDistance(shell, records, nearest, center) + 0.05;
  return distance <= limit;
}

/**
 * Returns whether a neighbor is a profile strip from the original curve.
 *
 * @param shell Derived brush.
 * @param group Corner faces.
 * @param neighbor Neighbor face.
 * @returns True when the neighbor can give this face its wall.
 */
function modifierBevelOwnedStrip(
  shell: ModifierBevelDerivedBrush,
  group: ReadonlySet<number>,
  neighbor: number,
): boolean {
  const record = shell.faces[neighbor];
  if (!record || record.cornerFace || group.has(neighbor)) return false;
  return modifierBevelProfileStrip(shell, neighbor);
}

/**
 * Lists authored walls close to a corner.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param component Corner faces.
 * @returns Parent indices.
 */
function modifierBevelIncidentWalls(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  component: readonly number[],
): number[] {
  const center = modifierBevelComponentCenter(shell, component);
  const nearest = modifierBevelNearestWallDistance(shell, records, center);
  return modifierBevelWallsWithin(shell, records, center, nearest * 8 + 1e-4);
}

/**
 * Returns the centroid of a corner component.
 *
 * @param shell Derived brush.
 * @param component Corner faces.
 * @returns Average face center.
 */
function modifierBevelComponentCenter(shell: ModifierBevelDerivedBrush, component: readonly number[]): Vector3 {
  const center = new Vector3();
  for (const face of component) center.add(modifierBevelFaceCenter(shell, face));
  return center.multiplyScalar(1 / Math.max(component.length, 1));
}

/**
 * Returns the center of one face.
 *
 * @param shell Derived brush.
 * @param faceIndex Face index.
 * @returns Centroid.
 */
function modifierBevelFaceCenter(shell: ModifierBevelDerivedBrush, faceIndex: number): Vector3 {
  const face = shell.localBrush.faces[faceIndex];
  const points = face ? shell.localBrush.getFaceVertices(face) : [];
  const center = new Vector3();
  for (const point of points) center.add(point);
  if (points.length === 0) return center;
  return center.multiplyScalar(1 / points.length);
}

/**
 * Returns the distance from a point to the nearest authored wall.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param point Corner center.
 * @returns Distance.
 */
function modifierBevelNearestWallDistance(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  point: Vector3,
): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < records.length; index += 1) {
    if (records[index]?.chamferEdge) continue;
    const plane = shell.localBrush.planes[index];
    if (!plane) continue;
    nearest = Math.min(nearest, Math.abs(plane.signedDistance(point)));
  }
  return nearest;
}

/**
 * Lists authored walls no farther than a limit from a point.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param point Corner center.
 * @param limit Maximum distance.
 * @returns Parent indices.
 */
function modifierBevelWallsWithin(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  point: Vector3,
  limit: number,
): number[] {
  const walls = new Set<number>();
  for (let index = 0; index < records.length; index += 1) {
    const parent = modifierBevelWallWithin(shell, records, index, point, limit);
    if (parent >= 0) walls.add(parent);
  }
  return [...walls];
}

/**
 * Returns a wall parent when that wall is close to a point.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param index Face index.
 * @param point Corner center.
 * @param limit Maximum distance.
 * @returns Parent index, or -1.
 */
function modifierBevelWallWithin(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  index: number,
  point: Vector3,
  limit: number,
): number {
  const record = records[index];
  const plane = shell.localBrush.planes[index];
  if (!record || record.chamferEdge || !plane) return -1;
  if (Math.abs(plane.signedDistance(point)) > limit) return -1;
  return record.parentSurfaceIndex;
}

/**
 * Returns the outside face of one parent that shares the longest edge.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param group Corner faces.
 * @param face Corner face.
 * @param parent Authored parent.
 * @returns Neighbor face, or -1.
 */
function modifierBevelTouchOfParent(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  group: ReadonlySet<number>,
  face: number,
  parent: number,
): number {
  let best = -1;
  let bestLength = 0;
  for (const neighbor of modifierBevelNeighborFaces(shell.localBrush, face)) {
    if (group.has(neighbor) || records[neighbor]?.parentSurfaceIndex !== parent) continue;
    const length = modifierBevelSharedEdgeLength(shell.localBrush, face, neighbor);
    if (length <= bestLength) continue;
    best = neighbor;
    bestLength = length;
  }
  return best;
}

/**
 * Returns the incident wall closest to the face center.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param walls Incident walls.
 * @param face Corner face.
 * @returns Authored parent.
 */
function modifierBevelNearestWall(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  walls: readonly number[],
  face: number,
): number {
  const normal = shell.localBrush.planes[face]?.normal;
  const center = modifierBevelFaceCenter(shell, face);
  let best = walls[0] ?? records[face]?.parentSurfaceIndex ?? 0;
  let bestDot = Number.NEGATIVE_INFINITY;
  let bestDistance = Number.POSITIVE_INFINITY;
  if (!normal) return best;
  for (const wall of walls) {
    const scored = modifierBevelScoreWall(shell, records, wall, normal, center, best, bestDot, bestDistance);
    best = scored.wall;
    bestDot = scored.dot;
    bestDistance = scored.distance;
  }
  return best;
}

/**
 * Keeps the wall closest to the face center, using the facing dot when
 * distances tie.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param wall Candidate wall.
 * @param normal Face normal.
 * @param center Face center.
 * @param best Best wall so far.
 * @param bestDot Best dot so far.
 * @param bestDistance Best distance so far.
 * @returns Updated score.
 */
function modifierBevelScoreWall(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  wall: number,
  normal: Vector3,
  center: Vector3,
  best: number,
  bestDot: number,
  bestDistance: number,
): { wall: number; dot: number; distance: number } {
  const dot = modifierBevelWallDot(shell, records, wall, normal);
  const distance = modifierBevelWallDistance(shell, records, wall, center);
  if (distance < bestDistance - 1e-4) return { wall, dot, distance };
  if (Math.abs(distance - bestDistance) <= 1e-4 && dot > bestDot) return { wall, dot, distance };
  return { wall: best, dot: bestDot, distance: bestDistance };
}

/**
 * Returns the distance from a point to a wall.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param wall Authored parent.
 * @param point Face center.
 * @returns Absolute distance.
 */
function modifierBevelWallDistance(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  wall: number,
  point: Vector3,
): number {
  const face = modifierBevelWallFace(records, wall);
  const plane = shell.localBrush.planes[face];
  if (!plane) return Number.POSITIVE_INFINITY;
  return Math.abs(plane.signedDistance(point));
}

/**
 * Returns how aligned a wall is with a direction.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param wall Authored parent.
 * @param normal Direction.
 * @returns Dot product.
 */
function modifierBevelWallDot(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  wall: number,
  normal: Vector3,
): number {
  const face = modifierBevelWallFace(records, wall);
  const wallNormal = shell.localBrush.planes[face]?.normal;
  if (!wallNormal) return -2;
  return wallNormal.dot(normal);
}

/**
 * Returns a derived face that still is an authored wall.
 *
 * @param records Face records.
 * @param wall Authored parent.
 * @returns Face index, or -1.
 */
function modifierBevelWallFace(records: readonly ModifierBevelFaceRecord[], wall: number): number {
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record && !record.chamferEdge && record.parentSurfaceIndex === wall) return index;
  }
  return -1;
}

/**
 * Stores the parent and smear source on one corner face.
 *
 * @param records Face records.
 * @param face Face index.
 * @param parent Authored parent.
 * @param source Face the texture is folded from.
 */
function modifierBevelWriteCornerParent(
  shell: ModifierBevelDerivedBrush,
  records: ModifierBevelFaceRecord[],
  face: number,
  parent: number,
  source: number,
): void {
  const record = records[face];
  if (!record) return;
  records[face] = {
    ...record,
    parentSurfaceIndex: parent,
    smearFromDerivedIndex: source,
    chamferEdge: modifierBevelCornerEdge(shell, face, source, record),
  };
}

/**
 * Uses the shared edge with the smear source when one exists.
 *
 * @param shell Derived brush.
 * @param face Corner face.
 * @param source Smear source.
 * @param record Previous record.
 * @returns Edge to fold across.
 */
function modifierBevelCornerEdge(
  shell: ModifierBevelDerivedBrush,
  face: number,
  source: number,
  record: ModifierBevelFaceRecord,
): ModifierBevelFaceRecord['chamferEdge'] {
  return modifierBevelSmearEdge(shell.localBrush, face, source, record.chamferEdge);
}

/**
 * Gives coplanar sectors different walls when each one is equally close to two.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param component Corner faces.
 * @param walls Incident walls.
 */
function modifierBevelBalanceTiedSectors(
  shell: ModifierBevelDerivedBrush,
  records: ModifierBevelFaceRecord[],
  component: readonly number[],
  walls: readonly number[],
): void {
  const first = shell.localBrush.planes[component[0] ?? -1]?.normal;
  if (!first || !modifierBevelSectorsAreCoplanar(shell, component, first)) return;
  const used = new Set<number>();
  for (const face of component) modifierBevelClaimTiedWall(shell, records, walls, used, face);
}

/**
 * Returns whether every face in a component has the same normal.
 *
 * @param shell Derived brush.
 * @param component Corner faces.
 * @param normal Normal of the first face.
 * @returns True when the faces are coplanar.
 */
function modifierBevelSectorsAreCoplanar(
  shell: ModifierBevelDerivedBrush,
  component: readonly number[],
  normal: Vector3,
): boolean {
  return component.every((face) => (shell.localBrush.planes[face]?.normal.dot(normal) ?? 0) > 0.999);
}

/**
 * Assigns a coplanar face to a close wall that is still free.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param walls Incident walls.
 * @param used Walls already taken in this component.
 * @param face Corner face.
 */
function modifierBevelClaimTiedWall(
  shell: ModifierBevelDerivedBrush,
  records: ModifierBevelFaceRecord[],
  walls: readonly number[],
  used: Set<number>,
  face: number,
): void {
  const options = modifierBevelCloseWalls(shell, records, walls, face);
  const parent = options.find((wall) => !used.has(wall)) ?? options[0] ?? records[face]?.parentSurfaceIndex ?? 0;
  used.add(parent);
  const group = new Set<number>();
  const touch = modifierBevelTouchOfParent(shell, records, group, face, parent);
  modifierBevelWriteCornerParent(
    shell,
    records,
    face,
    parent,
    touch >= 0 ? touch : modifierBevelWallFace(records, parent),
  );
}

/**
 * Lists walls nearly as close as the closest wall.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param walls Incident walls.
 * @param face Corner face.
 * @returns Wall parents.
 */
function modifierBevelCloseWalls(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  walls: readonly number[],
  face: number,
): number[] {
  const center = modifierBevelFaceCenter(shell, face);
  const distances = walls.map((wall) => modifierBevelWallDistance(shell, records, wall, center));
  const nearest = Math.min(...distances);
  return walls.filter((_, index) => (distances[index] ?? Number.POSITIVE_INFINITY) <= nearest + 0.01);
}
