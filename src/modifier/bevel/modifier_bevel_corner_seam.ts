import { Vector3 } from 'three';
import type { SolidPlane } from '@/solid/brush/solid_plane.js';
import type { ModifierBevelFaceRecord } from './modifier_bevel_face_record.js';
import type { ModifierBevelDerivedBrush } from './modifier_bevel_derived.js';
import { modifierBevelNeighborFaces, modifierBevelSharedEdgeLength } from './modifier_bevel_face_graph.js';
import { modifierBevelSmearEdge } from './modifier_bevel_face_record.js';
import { modifierBevelProfileStrip } from './modifier_bevel_uv_layout_profile.js';
import { modifierBevelCenterPlane } from './modifier_bevel_center_plane.js';
import { modifierBevelFaceCenterPlane } from './modifier_bevel_profile_cylinder.js';

/**
 * Gives corner faces on one side of every center plane the same wall.
 *
 * @param shell Derived brush.
 * @param records Face records.
 */
export function modifierBevelPullCornerSeams(
  shell: ModifierBevelDerivedBrush,
  records: ModifierBevelFaceRecord[],
): void {
  const planes = modifierBevelSeamPlanes(shell);
  const pending: number[] = [];
  const queued = new Set<number>();
  modifierBevelQueueSeamAnchors(shell, records, pending, queued);
  while (pending.length > 0) modifierBevelSpreadSeam(shell, records, planes, pending, queued);
  modifierBevelSettleSeamParents(shell, records, planes);
}

/**
 * Lists the center plane of every beveled edge.
 *
 * @param shell Derived brush.
 * @returns Planes.
 */
function modifierBevelSeamPlanes(shell: ModifierBevelDerivedBrush): SolidPlane[] {
  const planes: SolidPlane[] = [];
  for (const girder of shell.girders) {
    const plane = modifierBevelCenterPlane(girder);
    if (plane) planes.push(plane);
  }
  return planes;
}

/**
 * Queues corner faces that meet a strip of their own wall.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param pending Faces still to visit.
 * @param queued Faces already queued.
 */
function modifierBevelQueueSeamAnchors(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  pending: number[],
  queued: Set<number>,
): void {
  for (let face = 0; face < records.length; face += 1) {
    if (!modifierBevelSeamAnchor(shell, records, face)) continue;
    queued.add(face);
    pending.push(face);
  }
}

/**
 * Returns whether a corner face touches a strip on the strip's side of the
 * center.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param face Face index.
 * @returns True when the face can start a sector.
 */
function modifierBevelSeamAnchor(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  face: number,
): boolean {
  const record = records[face];
  if (!record?.cornerFace || modifierBevelProfileStrip(shell, face)) return false;
  return modifierBevelNeighborFaces(shell.localBrush, face).some((neighbor) =>
    modifierBevelAnchorStrip(shell, records, face, record.parentSurfaceIndex, neighbor),
  );
}

/**
 * Returns whether a neighbor is a same-wall strip on this side of its center.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param face Corner face.
 * @param parent Authored parent.
 * @param neighbor Neighbor face.
 * @returns True when the strip can anchor the face.
 */
function modifierBevelAnchorStrip(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  face: number,
  parent: number,
  neighbor: number,
): boolean {
  const record = records[neighbor];
  if (!record || record.parentSurfaceIndex !== parent || record.cornerFace) return false;
  if (!modifierBevelProfileStrip(shell, neighbor)) return false;
  return modifierBevelAnchorAgrees(shell, face, neighbor);
}

/**
 * Returns whether a face and a strip share one side of the strip center plane.
 *
 * @param shell Derived brush.
 * @param face Corner face.
 * @param strip Profile strip.
 * @returns True when the strip owns this side, or the strip has no center
 *   plane.
 */
function modifierBevelAnchorAgrees(shell: ModifierBevelDerivedBrush, face: number, strip: number): boolean {
  const plane = modifierBevelFaceCenterPlane(shell, strip);
  if (!plane) return true;
  return modifierBevelSectorAgrees(plane, modifierBevelSeamCenter(shell, face), modifierBevelSeamCenter(shell, strip));
}

/**
 * Copies an anchor wall across faces that stay on the same side of every plane.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param planes Center planes.
 * @param pending Faces still to visit.
 * @param queued Faces already queued.
 */
function modifierBevelSpreadSeam(
  shell: ModifierBevelDerivedBrush,
  records: ModifierBevelFaceRecord[],
  planes: readonly SolidPlane[],
  pending: number[],
  queued: Set<number>,
): void {
  const face = pending.shift();
  if (face === undefined) return;
  for (const neighbor of modifierBevelNeighborFaces(shell.localBrush, face)) {
    modifierBevelTakeSeamNeighbor(shell, records, planes, pending, queued, face, neighbor);
  }
}

/**
 * Queues one neighbor when it belongs in the same sector.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param planes Center planes.
 * @param pending Faces still to visit.
 * @param queued Faces already queued.
 * @param face Current face.
 * @param neighbor Neighbor face.
 */
function modifierBevelTakeSeamNeighbor(
  shell: ModifierBevelDerivedBrush,
  records: ModifierBevelFaceRecord[],
  planes: readonly SolidPlane[],
  pending: number[],
  queued: Set<number>,
  face: number,
  neighbor: number,
): void {
  if (queued.has(neighbor) || !modifierBevelSeamCap(shell, neighbor)) return;
  if (!modifierBevelSameSector(shell, planes, face, neighbor)) return;
  queued.add(neighbor);
  pending.push(neighbor);
  modifierBevelCopySeamParent(shell, records, neighbor, face);
}

/**
 * Returns whether a face is a corner cap.
 *
 * @param shell Derived brush.
 * @param face Face index.
 * @returns True when the face is a cap.
 */
function modifierBevelSeamCap(shell: ModifierBevelDerivedBrush, face: number): boolean {
  const record = shell.faces[face];
  return !!record?.cornerFace && !modifierBevelProfileStrip(shell, face);
}

/**
 * Returns whether two faces lie on one side of every center plane.
 *
 * @param shell Derived brush.
 * @param planes Center planes.
 * @param face First face.
 * @param neighbor Second face.
 * @returns True when no plane separates them.
 */
function modifierBevelSameSector(
  shell: ModifierBevelDerivedBrush,
  planes: readonly SolidPlane[],
  face: number,
  neighbor: number,
): boolean {
  const start = modifierBevelSeamCenter(shell, face);
  const end = modifierBevelSeamCenter(shell, neighbor);
  return planes.every((plane) => modifierBevelSectorAgrees(plane, start, end));
}

/**
 * Returns whether two points are not on opposite sides of a plane.
 *
 * @param plane Center plane.
 * @param start First point.
 * @param end Second point.
 * @returns True when the points agree.
 */
function modifierBevelSectorAgrees(plane: SolidPlane, start: Vector3, end: Vector3): boolean {
  const left = plane.signedDistance(start);
  const right = plane.signedDistance(end);
  if (Math.abs(left) <= 1e-3 || Math.abs(right) <= 1e-3) return true;
  return left * right > 0;
}

/**
 * Returns the center of a face.
 *
 * @param shell Derived brush.
 * @param face Face index.
 * @returns Center.
 */
function modifierBevelSeamCenter(shell: ModifierBevelDerivedBrush, face: number): Vector3 {
  const polygon = shell.localBrush.faces[face];
  const loop = polygon ? shell.localBrush.getFaceVertices(polygon) : [];
  const center = new Vector3();
  for (const point of loop) center.add(point);
  return center.multiplyScalar(1 / Math.max(loop.length, 1));
}

/**
 * Lets the longer same-side strip own a pair that stayed on one side.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param planes Center planes.
 */
function modifierBevelSettleSeamParents(
  shell: ModifierBevelDerivedBrush,
  records: ModifierBevelFaceRecord[],
  planes: readonly SolidPlane[],
): void {
  for (let pass = 0; pass < 2; pass += 1) {
    if (!modifierBevelSettleOnePass(shell, records, planes)) return;
  }
}

/**
 * Rewrites one pass of same-sector neighbors.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param planes Center planes.
 * @returns True when a parent changed.
 */
function modifierBevelSettleOnePass(
  shell: ModifierBevelDerivedBrush,
  records: ModifierBevelFaceRecord[],
  planes: readonly SolidPlane[],
): boolean {
  let changed = false;
  for (let face = 0; face < records.length; face += 1) {
    if (modifierBevelSettleFace(shell, records, planes, face)) changed = true;
  }
  return changed;
}

/**
 * Gives one face the neighbor parent whose strip touch is longer.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param planes Center planes.
 * @param face Corner face.
 * @returns True when the parent changed.
 */
function modifierBevelSettleFace(
  shell: ModifierBevelDerivedBrush,
  records: ModifierBevelFaceRecord[],
  planes: readonly SolidPlane[],
  face: number,
): boolean {
  if (!modifierBevelSeamCap(shell, face)) return false;
  let changed = false;
  for (const neighbor of modifierBevelNeighborFaces(shell.localBrush, face)) {
    if (!modifierBevelSettleWins(shell, records, planes, face, neighbor)) continue;
    modifierBevelCopySeamParent(shell, records, face, neighbor);
    changed = true;
  }
  return changed;
}

/**
 * Returns whether a neighbor should replace this face's wall.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param planes Center planes.
 * @param face Corner face.
 * @param neighbor Neighbor face.
 * @returns True when the neighbor's strip is longer.
 */
function modifierBevelSettleWins(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  planes: readonly SolidPlane[],
  face: number,
  neighbor: number,
): boolean {
  if (!modifierBevelSeamCap(shell, neighbor) || !modifierBevelSameSector(shell, planes, face, neighbor)) return false;
  if (records[face]?.parentSurfaceIndex === records[neighbor]?.parentSurfaceIndex) return false;
  const mine = modifierBevelAgreedStripLength(shell, records, face);
  const theirs = modifierBevelAgreedStripLength(shell, records, neighbor);
  if (theirs > mine + 1e-6) return true;
  return Math.abs(theirs - mine) <= 1e-6 && neighbor < face;
}

/**
 * Returns the longest same-side strip touch of a face.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param face Corner face.
 * @returns Shared edge length, or 0 when no strip agrees.
 */
function modifierBevelAgreedStripLength(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  face: number,
): number {
  const parent = records[face]?.parentSurfaceIndex ?? -1;
  let best = 0;
  for (const neighbor of modifierBevelNeighborFaces(shell.localBrush, face)) {
    if (!modifierBevelAnchorStrip(shell, records, face, parent, neighbor)) continue;
    const edge = modifierBevelSharedEdgeLength(shell.localBrush, face, neighbor);
    if (edge > best) best = edge;
  }
  return best;
}

/**
 * Stores the source face's wall on a neighbor and folds across their edge.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param face Face that takes the wall.
 * @param source Face the wall is copied from.
 */
function modifierBevelCopySeamParent(
  shell: ModifierBevelDerivedBrush,
  records: ModifierBevelFaceRecord[],
  face: number,
  source: number,
): void {
  const record = records[face];
  const parent = records[source]?.parentSurfaceIndex;
  if (!record || parent === undefined || record.parentSurfaceIndex === parent) return;
  records[face] = {
    ...record,
    parentSurfaceIndex: parent,
    smearFromDerivedIndex: source,
    chamferEdge: modifierBevelSmearEdge(shell.localBrush, face, source, record.chamferEdge),
  };
}
