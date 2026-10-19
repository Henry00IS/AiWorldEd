import { Vector3 } from 'three';
import { SolidPlane } from '@/solid/brush/solid_plane.js';
import type { ModifierBevelFaceRecord } from './modifier_bevel_face_record.js';
import type { ModifierBevelDerivedBrush } from './modifier_bevel_derived.js';
import { modifierBevelNeighborFaces } from './modifier_bevel_face_graph.js';
import { modifierBevelProfileChain, modifierBevelProfileStrip } from './modifier_bevel_uv_layout_profile.js';
import { modifierBevelCenterPlane } from './modifier_bevel_center_plane.js';
import { modifierBevelFaceCenterPlane, modifierBevelGirderForFace } from './modifier_bevel_profile_cylinder.js';
import { modifierBevelFaceLoops } from './modifier_bevel_corner_face_rebuild.js';
import { modifierBevelApplyBisectPlans, modifierBevelPieceWall } from './modifier_bevel_corner_face_bisect_apply.js';

interface ModifierBevelWallPlane {
  /** Authored parent. */
  parent: number;
  /** Authored face plane. */
  plane: SolidPlane;
}

const MODIFIER_BEVEL_CUT_SLIVER = 1.2e-4;

export interface ModifierBevelBisectPlan {
  /** Face the cut replaces. */
  faceIndex: number;
  /** Piece loops. The first replaces the face. */
  loops: Vector3[][];
  /** Authored parent of each piece. */
  parents: number[];
}

/**
 * Cuts corner faces along the planes that bisect their walls.
 *
 * @param shell Derived brush. Split faces are rebuilt in place.
 * @param records Face records. One record is appended per extra piece.
 * @param claimed Faces already given to a curve.
 */
export function modifierBevelBisectCornerFaces(
  shell: ModifierBevelDerivedBrush,
  records: ModifierBevelFaceRecord[],
  claimed: ReadonlySet<number>,
): void {
  modifierBevelApplyStripCenters(shell, records);
  modifierBevelApplyCornerCuts(shell, records, claimed);
}

/**
 * Cuts each corner on its own so one open rebuild does not discard the others.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param claimed Faces already given to a curve.
 */
function modifierBevelApplyCornerCuts(
  shell: ModifierBevelDerivedBrush,
  records: ModifierBevelFaceRecord[],
  claimed: ReadonlySet<number>,
): void {
  const seen = new Set<number>();
  for (let face = 0; face < records.length; face += 1) modifierBevelApplyOneCorner(shell, records, claimed, seen, face);
}

/**
 * Cuts one corner component and rebuilds before the next corner.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param claimed Faces already given to a curve.
 * @param seen Faces already visited.
 * @param face Candidate face.
 */
function modifierBevelApplyOneCorner(
  shell: ModifierBevelDerivedBrush,
  records: ModifierBevelFaceRecord[],
  claimed: ReadonlySet<number>,
  seen: Set<number>,
  face: number,
): void {
  if (seen.has(face) || !modifierBevelBisectFace(shell, records, claimed, face)) return;
  const loops = modifierBevelFaceLoops(shell.localBrush);
  const component = modifierBevelBisectComponent(shell, records, claimed, seen, face);
  const plans = modifierBevelBisectComponentPlans(shell, records, loops, component);
  modifierBevelApplyBisectPlans(shell, records, loops, plans);
}

/**
 * Splits odd profile middles before the corner cuts read the new loops.
 *
 * @param shell Derived brush.
 * @param records Face records.
 */
function modifierBevelApplyStripCenters(shell: ModifierBevelDerivedBrush, records: ModifierBevelFaceRecord[]): void {
  const loops = modifierBevelFaceLoops(shell.localBrush);
  const plans: ModifierBevelBisectPlan[] = [];
  modifierBevelPushStripCenters(plans, shell, records, loops);
  modifierBevelApplyBisectPlans(shell, records, loops, plans);
}

/**
 * Returns whether a face should be cut between walls.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param claimed Faces already given to a curve.
 * @param face Face index.
 * @returns True when the face is an unclaimed corner face.
 */
function modifierBevelBisectFace(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  claimed: ReadonlySet<number>,
  face: number,
): boolean {
  if (claimed.has(face) || !records[face]?.cornerFace) return false;
  return !modifierBevelProfileStrip(shell, face);
}

/**
 * Lists the corner faces connected to a start.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param claimed Faces already given to a curve.
 * @param seen Faces already queued.
 * @param start Start face.
 * @returns Component.
 */
function modifierBevelBisectComponent(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  claimed: ReadonlySet<number>,
  seen: Set<number>,
  start: number,
): number[] {
  const component: number[] = [];
  const pending = [start];
  seen.add(start);
  while (pending.length > 0) modifierBevelTakeBisectFace(shell, records, claimed, component, pending, seen);
  return component;
}

/**
 * Claims one queued face and queues its corner neighbors.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param claimed Faces already given to a curve.
 * @param component Component accumulator.
 * @param pending Faces still to visit.
 * @param seen Faces already queued.
 */
function modifierBevelTakeBisectFace(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  claimed: ReadonlySet<number>,
  component: number[],
  pending: number[],
  seen: Set<number>,
): void {
  const face = pending.shift();
  if (face === undefined) return;
  component.push(face);
  modifierBevelQueueBisectFaces(shell, records, claimed, face, pending, seen);
}

/**
 * Queues neighboring corner faces.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param claimed Faces already given to a curve.
 * @param face Current face.
 * @param pending Faces still to visit.
 * @param seen Faces already queued.
 */
function modifierBevelQueueBisectFaces(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  claimed: ReadonlySet<number>,
  face: number,
  pending: number[],
  seen: Set<number>,
): void {
  for (const neighbor of modifierBevelNeighborFaces(shell.localBrush, face)) {
    if (seen.has(neighbor) || !modifierBevelBisectFace(shell, records, claimed, neighbor)) continue;
    seen.add(neighbor);
    pending.push(neighbor);
  }
}

/**
 * Cuts every face of one corner along its edge center planes.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param loops Face loops.
 * @param component Corner faces.
 * @returns Cuts. Empty when the component is the single chamfer triangle.
 */
function modifierBevelBisectComponentPlans(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  loops: readonly Vector3[][],
  component: readonly number[],
): ModifierBevelBisectPlan[] {
  if (modifierBevelLoneTriangle(shell, component)) return [];
  const walls = modifierBevelComponentWalls(shell, records, component);
  const bisectors = modifierBevelCutPlanes(shell, component, walls);
  if (bisectors.length === 0 || modifierBevelFacesAlreadySeparated(loops, component, bisectors)) return [];
  return modifierBevelComponentCuts(loops, component, walls, bisectors);
}

/**
 * Returns the center planes of the edges around a corner.
 *
 * @param shell Derived brush.
 * @param component Corner faces.
 * @param walls Wall planes used when no edge profile is known.
 * @returns Cut planes.
 */
function modifierBevelCutPlanes(
  shell: ModifierBevelDerivedBrush,
  component: readonly number[],
  walls: readonly ModifierBevelWallPlane[],
): SolidPlane[] {
  const centers = modifierBevelComponentCenters(shell, component);
  if (centers.length >= 2) return centers;
  return modifierBevelWallBisectors(walls);
}

/**
 * Lists the center plane of every edge that touches a corner.
 *
 * @param shell Derived brush.
 * @param component Corner faces.
 * @returns Planes.
 */
function modifierBevelComponentCenters(shell: ModifierBevelDerivedBrush, component: readonly number[]): SolidPlane[] {
  const planes: SolidPlane[] = [];
  const seen = new Set<number>();
  for (const face of component) modifierBevelPushNeighborCenters(planes, seen, shell, face);
  return planes;
}

/**
 * Adds the center planes of the edges neighboring one face.
 *
 * @param planes Plane accumulator.
 * @param seen Girder indices already stored.
 * @param shell Derived brush.
 * @param face Corner face.
 */
function modifierBevelPushNeighborCenters(
  planes: SolidPlane[],
  seen: Set<number>,
  shell: ModifierBevelDerivedBrush,
  face: number,
): void {
  for (const neighbor of modifierBevelNeighborFaces(shell.localBrush, face)) {
    if (!modifierBevelProfileStrip(shell, neighbor)) continue;
    modifierBevelPushCenter(planes, seen, shell, modifierBevelGirderForFace(shell.localBrush, shell.girders, neighbor));
  }
}

/**
 * Stores one edge's center plane.
 *
 * @param planes Plane accumulator.
 * @param seen Girder indices already stored.
 * @param shell Derived brush.
 * @param index Girder index.
 */
function modifierBevelPushCenter(
  planes: SolidPlane[],
  seen: Set<number>,
  shell: ModifierBevelDerivedBrush,
  index: number,
): void {
  if (index < 0 || seen.has(index)) return;
  const plane = modifierBevelCenterPlane(shell.girders[index]);
  if (!plane) return;
  seen.add(index);
  planes.push(plane);
}

/**
 * Cuts the middle face of every odd profile so the halves meet on the center
 * plane.
 *
 * @param plans Cut accumulator.
 * @param shell Derived brush.
 * @param records Face records.
 * @param loops Face loops.
 */
function modifierBevelPushStripCenters(
  plans: ModifierBevelBisectPlan[],
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  loops: readonly Vector3[][],
): void {
  const seen = new Set<number>();
  for (let face = 0; face < records.length; face += 1)
    modifierBevelPushStripChain(plans, shell, records, loops, seen, face);
}

/**
 * Cuts one curve when the face starts it and the curve has a middle face.
 *
 * @param plans Cut accumulator.
 * @param shell Derived brush.
 * @param records Face records.
 * @param loops Face loops.
 * @param seen Faces already visited.
 * @param face Candidate face.
 */
function modifierBevelPushStripChain(
  plans: ModifierBevelBisectPlan[],
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  loops: readonly Vector3[][],
  seen: Set<number>,
  face: number,
): void {
  if (seen.has(face) || !modifierBevelProfileStrip(shell, face)) return;
  const chain = modifierBevelProfileChain(shell, face);
  for (const index of chain) seen.add(index);
  modifierBevelPushMiddleCut(plans, shell, records, loops, chain);
}

/**
 * Cuts the middle face of an odd curve.
 *
 * @param plans Cut accumulator.
 * @param shell Derived brush.
 * @param records Face records.
 * @param loops Face loops.
 * @param chain Faces from one wall toward the other.
 */
function modifierBevelPushMiddleCut(
  plans: ModifierBevelBisectPlan[],
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  loops: readonly Vector3[][],
  chain: readonly number[],
): void {
  const face = modifierBevelMiddleFace(chain);
  const loop = face < 0 ? undefined : loops[face];
  const walls = modifierBevelChainWalls(shell, records, chain);
  const plane = modifierBevelFaceCenterPlane(shell, face) ?? modifierBevelWallBisector(walls[0], walls[1]);
  if (face < 0 || !plane || !loop) return;
  modifierBevelCutFace(plans, loops, face, walls, [plane]);
}

/**
 * Returns the middle face of an odd curve.
 *
 * @param chain Faces from one wall toward the other.
 * @returns Face index, or -1 when the curve has no middle face to divide.
 */
function modifierBevelMiddleFace(chain: readonly number[]): number {
  if (chain.length < 3 || chain.length % 2 === 0) return -1;
  return chain[Math.floor(chain.length / 2)] ?? -1;
}

/**
 * Lists the authored walls at the two ends of a curve.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param chain Faces from one wall toward the other.
 * @returns Wall planes.
 */
function modifierBevelChainWalls(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  chain: readonly number[],
): ModifierBevelWallPlane[] {
  const walls: ModifierBevelWallPlane[] = [];
  modifierBevelPushChainWall(walls, shell, records, chain[0] ?? -1);
  modifierBevelPushChainWall(walls, shell, records, chain[chain.length - 1] ?? -1);
  return walls;
}

/**
 * Adds the authored wall touching one end of a curve.
 *
 * @param walls Wall accumulator.
 * @param shell Derived brush.
 * @param records Face records.
 * @param face End face.
 */
function modifierBevelPushChainWall(
  walls: ModifierBevelWallPlane[],
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  face: number,
): void {
  for (const neighbor of modifierBevelNeighborFaces(shell.localBrush, face)) {
    modifierBevelPushNeighborWall(walls, shell, records, neighbor);
  }
}

/**
 * Stores a neighbor when it is still an authored wall.
 *
 * @param walls Wall accumulator.
 * @param shell Derived brush.
 * @param records Face records.
 * @param neighbor Neighbor face.
 */
function modifierBevelPushNeighborWall(
  walls: ModifierBevelWallPlane[],
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  neighbor: number,
): void {
  const record = records[neighbor];
  const plane = shell.localBrush.planes[neighbor];
  if (!record || !plane || record.chamferEdge || record.cornerFace) return;
  if (walls.some((wall) => wall.parent === record.parentSurfaceIndex)) return;
  walls.push({ parent: record.parentSurfaceIndex, plane });
}

/**
 * Returns whether every face already lies on one side of each bisector.
 *
 * @param loops Face loops.
 * @param component Corner faces.
 * @param bisectors Bisector planes.
 * @returns True when no face needs a cut.
 */
function modifierBevelFacesAlreadySeparated(
  loops: readonly Vector3[][],
  component: readonly number[],
  bisectors: readonly SolidPlane[],
): boolean {
  return component.every((face) => modifierBevelFaceStaysAside(loops[face], bisectors));
}

/**
 * Returns whether one loop stays on one side of every bisector.
 *
 * @param loop Face vertices.
 * @param bisectors Bisector planes.
 * @returns True when the loop is missing or uncut.
 */
function modifierBevelFaceStaysAside(loop: readonly Vector3[] | undefined, bisectors: readonly SolidPlane[]): boolean {
  if (!loop) return true;
  return bisectors.every((plane) => modifierBevelLoopOnOneSide(loop, plane));
}

/**
 * Returns whether a loop has vertices on only one side of a plane.
 *
 * @param loop Face vertices.
 * @param plane Bisector.
 * @returns True when the plane does not cross the loop.
 */
function modifierBevelLoopOnOneSide(loop: readonly Vector3[], plane: SolidPlane): boolean {
  let sign = 0;
  for (const point of loop) sign = modifierBevelSideSign(sign, plane.signedDistance(point));
  return sign !== 2;
}

/**
 * Combines a running side with one signed distance.
 *
 * @param sign 0 when unknown, 1 or -1 for a side, 2 when both sides were seen.
 * @param distance Signed distance.
 * @returns Updated side.
 */
function modifierBevelSideSign(sign: number, distance: number): number {
  if (Math.abs(distance) <= 1e-4 || sign === 2) return sign;
  const next = distance > 0 ? 1 : -1;
  if (sign !== 0 && sign !== next) return 2;
  return next;
}

/**
 * Returns whether a component is the one straight chamfer triangle.
 *
 * @param shell Derived brush.
 * @param component Corner faces.
 * @returns True when the component is one triangle between three strips.
 */
function modifierBevelLoneTriangle(shell: ModifierBevelDerivedBrush, component: readonly number[]): boolean {
  if (component.length !== 1) return false;
  const face = component[0];
  if (face === undefined || shell.localBrush.faces[face]?.edgeCount !== 3) return false;
  const neighbors = modifierBevelNeighborFaces(shell.localBrush, face);
  return neighbors.length === 3 && neighbors.every((neighbor) => modifierBevelProfileStrip(shell, neighbor));
}

/**
 * Lists the authored planes that meet a component.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param component Corner faces.
 * @returns Wall planes.
 */
function modifierBevelComponentWalls(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  component: readonly number[],
): ModifierBevelWallPlane[] {
  const parents = modifierBevelComponentParents(shell, records, component);
  const walls: ModifierBevelWallPlane[] = [];
  for (const parent of parents) modifierBevelPushWall(walls, shell, records, parent);
  return walls;
}

/**
 * Lists parents of the strips and walls around a component.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param component Corner faces.
 * @returns Parent indices.
 */
function modifierBevelComponentParents(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  component: readonly number[],
): number[] {
  const parents = new Set<number>();
  const members = new Set(component);
  for (const face of component) modifierBevelAddOutsideParents(shell, records, members, face, parents);
  return [...parents];
}

/**
 * Adds parents of the faces just outside one corner face.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param members Faces in the component.
 * @param face Corner face.
 * @param parents Parent accumulator.
 */
function modifierBevelAddOutsideParents(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  members: ReadonlySet<number>,
  face: number,
  parents: Set<number>,
): void {
  for (const neighbor of modifierBevelNeighborFaces(shell.localBrush, face)) {
    if (members.has(neighbor)) continue;
    const parent = records[neighbor]?.parentSurfaceIndex;
    if (parent !== undefined && parent >= 0) parents.add(parent);
  }
}

/**
 * Stores one wall plane when the authored face is still present.
 *
 * @param walls Wall accumulator.
 * @param shell Derived brush.
 * @param records Face records.
 * @param parent Authored parent.
 */
function modifierBevelPushWall(
  walls: ModifierBevelWallPlane[],
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  parent: number,
): void {
  const plane = modifierBevelParentPlane(shell, records, parent);
  if (plane) walls.push({ parent, plane });
}

/**
 * Returns the plane of an authored face with one parent.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param parent Authored parent.
 * @returns Plane, or null when the face was removed.
 */
function modifierBevelParentPlane(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  parent: number,
): SolidPlane | null {
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const plane = shell.localBrush.planes[index];
    if (!record || !plane || record.parentSurfaceIndex !== parent) continue;
    if (record.chamferEdge || record.cornerFace) continue;
    return plane;
  }
  return null;
}

/**
 * Builds the interior bisector of every wall pair.
 *
 * @param walls Wall planes.
 * @returns Bisector planes.
 */
function modifierBevelWallBisectors(walls: readonly ModifierBevelWallPlane[]): SolidPlane[] {
  const planes: SolidPlane[] = [];
  for (let index = 0; index < walls.length; index += 1) {
    for (let other = index + 1; other < walls.length; other += 1) {
      const plane = modifierBevelWallBisector(walls[index], walls[other]);
      if (plane) planes.push(plane);
    }
  }
  return planes;
}

/**
 * Returns the plane that separates two walls through their shared edge.
 *
 * @param left First wall.
 * @param right Second wall.
 * @returns Bisector, or null when the walls are parallel.
 */
function modifierBevelWallBisector(
  left: ModifierBevelWallPlane | undefined,
  right: ModifierBevelWallPlane | undefined,
): SolidPlane | null {
  if (!left || !right) return null;
  const normal = left.plane.normal.clone().sub(right.plane.normal);
  if (normal.lengthSq() < 1e-8) return null;
  return new SolidPlane(normal, left.plane.offset - right.plane.offset);
}

/**
 * Cuts each face of a component by the bisectors.
 *
 * @param loops Face loops.
 * @param component Corner faces.
 * @param walls Wall planes.
 * @param bisectors Bisector planes.
 * @returns Cuts.
 */
function modifierBevelComponentCuts(
  loops: readonly Vector3[][],
  component: readonly number[],
  walls: readonly ModifierBevelWallPlane[],
  bisectors: readonly SolidPlane[],
): ModifierBevelBisectPlan[] {
  const plans: ModifierBevelBisectPlan[] = [];
  for (const face of component) modifierBevelCutFace(plans, loops, face, walls, bisectors);
  return plans;
}

/**
 * Cuts one face when a bisector crosses it.
 *
 * @param plans Cut accumulator.
 * @param loops Face loops.
 * @param face Face index.
 * @param walls Wall planes.
 * @param bisectors Bisector planes.
 */
function modifierBevelCutFace(
  plans: ModifierBevelBisectPlan[],
  loops: readonly Vector3[][],
  face: number,
  walls: readonly ModifierBevelWallPlane[],
  bisectors: readonly SolidPlane[],
): void {
  const loop = loops[face];
  if (!loop) return;
  const pieces = modifierBevelCutLoop(loop, bisectors);
  if (pieces.length < 2) return;
  plans.push({ faceIndex: face, loops: pieces, parents: pieces.map((piece) => modifierBevelPieceWall(piece, walls)) });
}

/**
 * Splits a loop by every bisector that crosses it.
 *
 * @param loop Face vertices.
 * @param bisectors Bisector planes.
 * @returns Piece loops. The original loop when no plane crosses it.
 */
export function modifierBevelCutLoop(loop: readonly Vector3[], bisectors: readonly SolidPlane[]): Vector3[][] {
  let pieces = [loop.map((point) => point.clone())];
  for (const plane of bisectors) pieces = modifierBevelCutPieces(pieces, plane);
  return pieces;
}

/**
 * Splits every piece that a plane crosses.
 *
 * @param pieces Piece loops.
 * @param plane Bisector.
 * @returns Replacement pieces.
 */
function modifierBevelCutPieces(pieces: readonly Vector3[][], plane: SolidPlane): Vector3[][] {
  const next: Vector3[][] = [];
  for (const piece of pieces) modifierBevelPushCut(next, piece, plane);
  return next;
}

/**
 * Appends a piece, or both sides when the plane crosses it.
 *
 * @param next Accumulator.
 * @param piece Piece loop.
 * @param plane Bisector.
 */
function modifierBevelPushCut(next: Vector3[][], piece: readonly Vector3[], plane: SolidPlane): void {
  const sides = modifierBevelSplitSides(piece, plane);
  if (!sides) {
    next.push(piece.map((point) => point.clone()));
    return;
  }
  next.push(sides[0], sides[1]);
}

/**
 * Returns the two sides of a loop, or null when the plane misses it.
 *
 * @param loop Face vertices.
 * @param plane Bisector.
 * @returns Two loops, or null.
 */
function modifierBevelSplitSides(loop: readonly Vector3[], plane: SolidPlane): [Vector3[], Vector3[]] | null {
  const positive = modifierBevelClipSide(loop, plane, 1);
  const negative = modifierBevelClipSide(loop, plane, -1);
  if (positive.length < 3 || negative.length < 3) return null;
  if (positive.length + negative.length <= loop.length + 1) return null;
  if (!modifierBevelPiecesAreSubstantial(loop, positive, negative)) return null;
  return [positive, negative];
}

/**
 * Returns whether both sides are large enough to be a sector, not a speck.
 *
 * @param loop Face before the cut.
 * @param positive Vertices on the positive side.
 * @param negative Vertices on the negative side.
 * @returns True when each side has area.
 */
function modifierBevelPiecesAreSubstantial(
  loop: readonly Vector3[],
  positive: readonly Vector3[],
  negative: readonly Vector3[],
): boolean {
  const whole = modifierBevelLoopArea(loop);
  if (whole < 1e-10) return false;
  const least = Math.min(modifierBevelLoopArea(positive), modifierBevelLoopArea(negative));
  return least > 1e-10;
}

/**
 * Returns the area of a loop.
 *
 * @param loop Face vertices.
 * @returns Area.
 */
export function modifierBevelLoopArea(loop: readonly Vector3[]): number {
  const normal = new Vector3();
  for (let index = 0; index < loop.length; index += 1) modifierBevelAccumulateArea(normal, loop, index);
  return normal.length() * 0.5;
}

/**
 * Adds one edge to a Newell area vector.
 *
 * @param normal Accumulator.
 * @param loop Face vertices.
 * @param index Edge start.
 */
function modifierBevelAccumulateArea(normal: Vector3, loop: readonly Vector3[], index: number): void {
  const current = loop[index];
  const next = loop[(index + 1) % loop.length];
  if (!current || !next) return;
  normal.add(new Vector3().crossVectors(current, next));
}

/**
 * Keeps the part of a loop on one side of a plane.
 *
 * @param loop Face vertices.
 * @param plane Bisector.
 * @param side 1 for the positive side and -1 for the negative side.
 * @returns Side loop.
 */
function modifierBevelClipSide(loop: readonly Vector3[], plane: SolidPlane, side: number): Vector3[] {
  const result: Vector3[] = [];
  for (let index = 0; index < loop.length; index += 1) {
    modifierBevelEmitLoopEdge(result, loop, plane, side, index);
  }
  return modifierBevelDedupLoop(result);
}

/**
 * Emits one edge of a loop when both ends exist.
 *
 * @param result Side accumulator.
 * @param loop Face vertices.
 * @param plane Bisector.
 * @param side 1 or -1.
 * @param index Edge start.
 */
function modifierBevelEmitLoopEdge(
  result: Vector3[],
  loop: readonly Vector3[],
  plane: SolidPlane,
  side: number,
  index: number,
): void {
  const start = loop[index];
  const next = loop[(index + 1) % loop.length];
  if (!start || !next) return;
  modifierBevelEmitSide(result, plane, start, next, side);
}

/**
 * Emits one vertex and the crossing on an edge.
 *
 * @param result Side accumulator.
 * @param plane Bisector.
 * @param start Edge start.
 * @param end Edge end.
 * @param side 1 or -1.
 */
function modifierBevelEmitSide(result: Vector3[], plane: SolidPlane, start: Vector3, end: Vector3, side: number): void {
  const startDistance = plane.signedDistance(start);
  const endDistance = plane.signedDistance(end);
  if (modifierBevelCutKeeps(startDistance, side)) result.push(start.clone());
  modifierBevelEmitCrossing(result, start, end, side, startDistance, endDistance);
}

/**
 * Emits the cut on an edge that actually changes side.
 *
 * @param result Side accumulator.
 * @param start Edge start.
 * @param end Edge end.
 * @param side 1 or -1.
 * @param startDistance Signed distance at the start.
 * @param endDistance Signed distance at the end.
 */
function modifierBevelEmitCrossing(
  result: Vector3[],
  start: Vector3,
  end: Vector3,
  side: number,
  startDistance: number,
  endDistance: number,
): void {
  const cross = modifierBevelCrossPoint(start, end, startDistance, endDistance);
  if (!cross || modifierBevelDistancesAgree(startDistance, endDistance, side)) return;
  result.push(cross);
}

/**
 * Returns whether both ends count as the same side.
 *
 * @param startDistance Signed distance at the start.
 * @param endDistance Signed distance at the end.
 * @param side 1 or -1.
 * @returns True when the edge does not change side.
 */
function modifierBevelDistancesAgree(startDistance: number, endDistance: number, side: number): boolean {
  return modifierBevelCutKeeps(startDistance, side) === modifierBevelCutKeeps(endDistance, side);
}

/**
 * Returns whether a signed distance counts as this side of a cut.
 *
 * @param distance Signed distance.
 * @param side 1 or -1.
 * @returns True when the point is on the side or within a sliver of the plane.
 */
function modifierBevelCutKeeps(distance: number, side: number): boolean {
  return distance * side >= -MODIFIER_BEVEL_CUT_SLIVER;
}

/**
 * Returns the point where an edge crosses zero.
 *
 * @param start Edge start.
 * @param end Edge end.
 * @param startDistance Signed distance at the start.
 * @param endDistance Signed distance at the end.
 * @returns Crossing, or null when the edge does not cross.
 */
function modifierBevelCrossPoint(
  start: Vector3,
  end: Vector3,
  startDistance: number,
  endDistance: number,
): Vector3 | null {
  const span = startDistance - endDistance;
  if (Math.abs(span) < 1e-12) return null;
  const travel = startDistance / span;
  if (travel <= 1e-5 || travel >= 1 - 1e-5) return null;
  const point = start.clone().lerp(end, travel);
  if (modifierBevelNearEnd(start, end, point)) return null;
  return point;
}

/**
 * Returns whether a cut lands on an endpoint the weld would already keep.
 *
 * @param start Edge start.
 * @param end Edge end.
 * @param point Crossing.
 */
function modifierBevelNearEnd(start: Vector3, end: Vector3, point: Vector3): boolean {
  const limit = MODIFIER_BEVEL_CUT_SLIVER * MODIFIER_BEVEL_CUT_SLIVER;
  return point.distanceToSquared(start) <= limit || point.distanceToSquared(end) <= limit;
}

/**
 * Drops consecutive duplicates, including a repeated closing vertex.
 *
 * @param loop Vertices.
 * @returns Loop without zero-length edges.
 */
function modifierBevelDedupLoop(loop: readonly Vector3[]): Vector3[] {
  const result: Vector3[] = [];
  for (const point of loop) modifierBevelPushDistinct(result, point);
  const first = result[0];
  const last = result[result.length - 1];
  if (first && last && result.length > 1 && first.distanceToSquared(last) <= 1e-8) result.pop();
  return result;
}

/**
 * Appends a point when it is not the previous vertex.
 *
 * @param result Loop accumulator.
 * @param point Candidate vertex.
 */
function modifierBevelPushDistinct(result: Vector3[], point: Vector3): void {
  const last = result[result.length - 1];
  if (last && last.distanceToSquared(point) <= 1e-8) return;
  result.push(point);
}
