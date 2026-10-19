import type { Matrix4 } from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import {
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_CONTINUE,
  MODIFIER_VOLUME_BEVEL_UV_OWNER_SINGLE,
  MODIFIER_VOLUME_BEVEL_UV_PIVOT_ANCHOR,
  type ModifierBevelUvFlow,
  type ModifierBevelUvOwner,
  type ModifierBevelUvSpace,
} from '@/modifier/volume/modifier_volume_bevel_keys.js';
import type { ModifierBevelUvPlacement } from '@/modifier/volume/modifier_volume_bevel_uv_placement.js';
import { modifierBevelNeighborFaces, modifierBevelSharedEdgeLength } from './modifier_bevel_face_graph.js';
import {
  modifierBevelParentScores,
  modifierBevelRankParents,
  type ModifierBevelParentScore,
} from './modifier_bevel_inherit_score.js';
import { modifierBevelSmearEdge, type ModifierBevelFaceRecord } from './modifier_bevel_face_record.js';
import type { ModifierBevelVolumeStyle } from './modifier_bevel_volume_priority.js';
import type { ModifierBevelDerivedBrush } from './modifier_bevel_derived.js';
import { modifierBevelProfileChain, modifierBevelProfileStrip } from './modifier_bevel_uv_layout_profile.js';
import { modifierBevelSplitCornerOwners } from './modifier_bevel_uv_owner_corner.js';
import type { ModifierBevelGirder } from './modifier_bevel_uv_girder.js';

/** Parent chosen for one curve, and the face where that curve starts. */
interface ModifierBevelOwnerWinner {
  /** Authored parent for every segment. */
  parent: number;
  /** Endpoint that touches that parent. */
  start: number;
}

/**
 * Gives every segment of one curve the parent chosen by the UV flow.
 *
 * @param source Authored brush.
 * @param localBrush Chamfered brush.
 * @param records Inherit records from the split walk.
 * @param worldMatrix Brush mesh world matrix.
 * @param style UV flow, owner, and space from the priority volume.
 * @param scores Authored face scores. Measured when omitted.
 * @param girders Authored edges in brush-local space. Empty skips cylinder
 *   ownership.
 * @returns Face records.
 */
export function modifierBevelApplyCurveOwner(
  source: SolidBrush,
  localBrush: SolidBrush,
  records: ModifierBevelFaceRecord[],
  worldMatrix: Matrix4,
  style: ModifierBevelVolumeStyle,
  scores: readonly ModifierBevelParentScore[] = modifierBevelParentScores(source, worldMatrix),
  girders: readonly ModifierBevelGirder[] = [],
): ModifierBevelFaceRecord[] {
  const owner = style.placement.uvOwner;
  const space = style.placement.uvSpace;
  const shell = modifierBevelOwnerShell(localBrush, records, owner, space, girders);
  if (owner === MODIFIER_VOLUME_BEVEL_UV_OWNER_SINGLE) {
    return modifierBevelOwnEveryChain(shell, records, scores, style.flow, space, worldMatrix);
  }
  return modifierBevelSplitEveryChain(shell, records, scores, style.flow, space, worldMatrix);
}

/**
 * Builds a derived brush the curve walk can read.
 *
 * @param localBrush Chamfered brush.
 * @param records Split inherit records.
 * @param owner Curve owner stored on the shell.
 * @param space Map axes or brush axes stored on the shell.
 * @param girders Authored edges in brush-local space.
 * @returns Shell carrying the given owner and space.
 */
function modifierBevelOwnerShell(
  localBrush: SolidBrush,
  records: readonly ModifierBevelFaceRecord[],
  owner: ModifierBevelUvOwner,
  space: ModifierBevelUvSpace,
  girders: readonly ModifierBevelGirder[],
): ModifierBevelDerivedBrush {
  return {
    localBrush,
    faces: records.slice(),
    layout: MODIFIER_VOLUME_BEVEL_UV_LAYOUT_CONTINUE,
    textureId: '',
    placement: modifierBevelOwnerPlacement(owner, space),
    girders: girders.slice(),
    girderOfFace: records.map(() => -1),
  };
}

/**
 * Returns a neutral placement that stores the given owner and space.
 *
 * @param owner Curve owner.
 * @param space Map axes or brush axes.
 * @returns Placement with neutral scale.
 */
function modifierBevelOwnerPlacement(
  owner: ModifierBevelUvOwner,
  space: ModifierBevelUvSpace,
): ModifierBevelUvPlacement {
  return {
    uvScaleU: 1,
    uvScaleV: 1,
    uvOffsetU: 0,
    uvOffsetV: 0,
    uvRotation: 0,
    uvOwner: owner,
    uvPivot: MODIFIER_VOLUME_BEVEL_UV_PIVOT_ANCHOR,
    uvSpace: space,
  };
}

/**
 * Rewrites every profile curve onto one parent.
 *
 * @param shell Curve walk input.
 * @param records Split inherit records.
 * @param scores Authored face scores.
 * @param flow UV flow.
 * @param space Map axes or brush axes.
 * @param matrix Brush mesh world matrix.
 * @returns Rewritten records.
 */
function modifierBevelOwnEveryChain(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  scores: readonly ModifierBevelParentScore[],
  flow: ModifierBevelUvFlow,
  space: ModifierBevelUvSpace,
  matrix: Matrix4,
): ModifierBevelFaceRecord[] {
  const next = records.map((record) => modifierBevelCloneRecord(record));
  const seen = new Set<number>();
  for (let face = 0; face < next.length; face += 1) {
    modifierBevelOwnOneChain(shell, next, seen, face, scores, flow, space, matrix);
  }
  return next;
}

/**
 * Copies one inherit record.
 *
 * @param record Split record.
 * @returns Independent record sharing the chamfer edge.
 */
function modifierBevelCloneRecord(record: ModifierBevelFaceRecord): ModifierBevelFaceRecord {
  return { ...record };
}

/**
 * Rewrites one curve when the face has not been claimed.
 *
 * @param shell Curve walk input.
 * @param next Records being rewritten.
 * @param seen Faces already claimed.
 * @param face Candidate face.
 * @param scores Authored face scores.
 * @param flow UV flow.
 * @param space Map axes or brush axes.
 * @param matrix Brush mesh world matrix.
 */
function modifierBevelOwnOneChain(
  shell: ModifierBevelDerivedBrush,
  next: ModifierBevelFaceRecord[],
  seen: Set<number>,
  face: number,
  scores: readonly ModifierBevelParentScore[],
  flow: ModifierBevelUvFlow,
  space: ModifierBevelUvSpace,
  matrix: Matrix4,
): void {
  if (seen.has(face) || !modifierBevelProfileStrip(shell, face)) return;
  const ordered = modifierBevelClaimChain(shell, face, seen);
  const winner = modifierBevelChainWinner(shell, ordered, scores, flow, space, matrix);
  modifierBevelWriteChain(shell, next, modifierBevelChainFrom(ordered, winner.start), winner.parent);
}

/**
 * Picks the UV-flow parent of the two curve ends.
 *
 * @param shell Curve walk input.
 * @param chain Ordered curve faces.
 * @param scores Authored face scores.
 * @param flow UV flow.
 * @param space Map axes or brush axes.
 * @param matrix Brush mesh world matrix.
 * @returns Winning parent and the endpoint that touches it.
 */
function modifierBevelChainWinner(
  shell: ModifierBevelDerivedBrush,
  chain: readonly number[],
  scores: readonly ModifierBevelParentScore[],
  flow: ModifierBevelUvFlow,
  space: ModifierBevelUvSpace,
  matrix: Matrix4,
): ModifierBevelOwnerWinner {
  const ends = modifierBevelChainEnds(shell, chain);
  const rank = modifierBevelRankParents(flow, scores, ends.wallA, ends.wallB, space, matrix);
  if (rank <= 0) return { parent: ends.wallA, start: ends.first };
  return { parent: ends.wallB, start: ends.last };
}

/**
 * Lists a curve and marks its faces claimed.
 *
 * @param shell Curve walk input.
 * @param face Any face on the curve.
 * @param seen Faces already claimed.
 * @returns Faces from the lower wall toward the other.
 */
function modifierBevelClaimChain(shell: ModifierBevelDerivedBrush, face: number, seen: Set<number>): number[] {
  const chain = modifierBevelExtendCurveLips(shell, modifierBevelProfileChain(shell, face));
  for (const member of chain) seen.add(member);
  return modifierBevelWallOrder(shell, chain);
}

/**
 * Adds end faces that continue one curve but are not long strips.
 *
 * @param shell Curve walk input.
 * @param chain Strip faces from one end toward the other.
 * @returns Chain with its lips.
 */
function modifierBevelExtendCurveLips(shell: ModifierBevelDerivedBrush, chain: readonly number[]): number[] {
  const extended = chain.slice();
  const members = new Set(extended);
  modifierBevelGrowCurveEnd(shell, extended, members, false);
  modifierBevelGrowCurveEnd(shell, extended, members, true);
  return extended;
}

/**
 * Pulls lip faces onto one end of a curve.
 *
 * @param shell Curve walk input.
 * @param chain Curve faces.
 * @param members Faces already on the curve.
 * @param atEnd True when growing the last face.
 */
function modifierBevelGrowCurveEnd(
  shell: ModifierBevelDerivedBrush,
  chain: number[],
  members: Set<number>,
  atEnd: boolean,
): void {
  let guard = chain.length + 8;
  while (guard > 0) {
    guard -= 1;
    const lip = modifierBevelCurveLip(shell, members, atEnd ? chain[chain.length - 1] : chain[0]);
    if (lip < 0) return;
    if (atEnd) chain.push(lip);
    else chain.unshift(lip);
    members.add(lip);
  }
}

/**
 * Returns the single lip continuing one curve end.
 *
 * @param shell Curve walk input.
 * @param members Faces already on the curve.
 * @param face End face, or undefined when the curve is empty.
 * @returns Lip face, or -1.
 */
function modifierBevelCurveLip(
  shell: ModifierBevelDerivedBrush,
  members: ReadonlySet<number>,
  face: number | undefined,
): number {
  if (face === undefined) return -1;
  let found = -1;
  for (const neighbor of modifierBevelNeighborFaces(shell.localBrush, face)) {
    if (!modifierBevelIsCurveLip(shell, members, neighbor)) continue;
    if (found >= 0) return -1;
    found = neighbor;
  }
  return found;
}

/**
 * Returns whether a face continues this curve and no other strip.
 *
 * @param shell Curve walk input.
 * @param members Faces already on the curve.
 * @param face Candidate face.
 * @returns True when the face is a lip of this curve.
 */
function modifierBevelIsCurveLip(
  shell: ModifierBevelDerivedBrush,
  members: ReadonlySet<number>,
  face: number,
): boolean {
  if (members.has(face) || modifierBevelProfileStrip(shell, face)) return false;
  const record = shell.faces[face];
  if (!record?.chamferEdge && !record?.cornerFace) return false;
  return modifierBevelLipTouchesOnly(shell, members, face);
}

/**
 * Returns whether a lip meets this curve and no foreign strip.
 *
 * @param shell Curve walk input.
 * @param members Faces already on the curve.
 * @param face Candidate face.
 * @returns True when the lip belongs on this curve.
 */
function modifierBevelLipTouchesOnly(
  shell: ModifierBevelDerivedBrush,
  members: ReadonlySet<number>,
  face: number,
): boolean {
  let touches = false;
  for (const neighbor of modifierBevelNeighborFaces(shell.localBrush, face)) {
    if (members.has(neighbor)) touches = true;
    else if (modifierBevelProfileStrip(shell, neighbor)) return false;
  }
  return touches;
}

/**
 * Orders a curve so the lower wall index comes first.
 *
 * @param shell Curve walk input.
 * @param chain Curve faces.
 * @returns Ordered faces.
 */
function modifierBevelWallOrder(shell: ModifierBevelDerivedBrush, chain: readonly number[]): number[] {
  const ends = modifierBevelChainEnds(shell, chain);
  if (ends.wallA < ends.wallB || (ends.wallA === ends.wallB && ends.first <= ends.last)) return chain.slice();
  return chain.slice().reverse();
}

/**
 * Reads the authored walls at the two ends of a curve.
 *
 * @param shell Curve walk input.
 * @param chain Curve faces.
 * @returns End faces and their walls.
 */
function modifierBevelChainEnds(
  shell: ModifierBevelDerivedBrush,
  chain: readonly number[],
): {
  first: number;
  last: number;
  wallA: number;
  wallB: number;
} {
  const first = chain[0] ?? 0;
  const last = chain[chain.length - 1] ?? first;
  if (first === last) return modifierBevelSingleEnds(shell, first);
  return { first, last, wallA: modifierBevelEndWall(shell, first), wallB: modifierBevelEndWall(shell, last) };
}

/**
 * Reads both walls of a one-segment curve.
 *
 * @param shell Curve walk input.
 * @param face The only segment.
 * @returns That face and its two walls.
 */
function modifierBevelSingleEnds(
  shell: ModifierBevelDerivedBrush,
  face: number,
): { first: number; last: number; wallA: number; wallB: number } {
  const walls = modifierBevelFaceWalls(shell, face);
  const wallA = walls[0] ?? shell.faces[face]?.parentSurfaceIndex ?? 0;
  const wallB = walls[1] ?? wallA;
  return { first: face, last: face, wallA, wallB };
}

/**
 * Lists the authored walls touching one face.
 *
 * @param shell Curve walk input.
 * @param face Face index.
 * @returns Parent indices.
 */
function modifierBevelFaceWalls(shell: ModifierBevelDerivedBrush, face: number): number[] {
  const walls: number[] = [];
  for (const neighbor of modifierBevelNeighborFaces(shell.localBrush, face)) {
    const wall = modifierBevelNeighborWall(shell, neighbor);
    if (wall >= 0) walls.push(wall);
  }
  return walls;
}

/**
 * Returns the authored wall touching one segment.
 *
 * @param shell Curve walk input.
 * @param face Segment index.
 * @returns Authored parent, or the segment's parent when no wall is adjacent.
 */
function modifierBevelEndWall(shell: ModifierBevelDerivedBrush, face: number): number {
  for (const neighbor of modifierBevelNeighborFaces(shell.localBrush, face)) {
    const wall = modifierBevelNeighborWall(shell, neighbor);
    if (wall >= 0) return wall;
  }
  return shell.faces[face]?.parentSurfaceIndex ?? 0;
}

/**
 * Returns a neighbor's parent when that neighbor is an authored wall.
 *
 * @param shell Curve walk input.
 * @param neighbor Neighbor face.
 * @returns Parent index, or -1 when the neighbor is generated.
 */
function modifierBevelNeighborWall(shell: ModifierBevelDerivedBrush, neighbor: number): number {
  const record = shell.faces[neighbor];
  if (!record || record.chamferEdge) return -1;
  return record.parentSurfaceIndex;
}

/**
 * Divides every curve between its two walls.
 *
 * @param shell Curve walk input.
 * @param records Split inherit records.
 * @param scores Authored face scores.
 * @param flow UV flow.
 * @param space Map axes or brush axes.
 * @param matrix Brush mesh world matrix.
 * @returns Rewritten records.
 */
function modifierBevelSplitEveryChain(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  scores: readonly ModifierBevelParentScore[],
  flow: ModifierBevelUvFlow,
  space: ModifierBevelUvSpace,
  matrix: Matrix4,
): ModifierBevelFaceRecord[] {
  const next = records.map((record) => modifierBevelCloneRecord(record));
  const seen = new Set<number>();
  for (let face = 0; face < next.length; face += 1) {
    modifierBevelSplitOneChain(shell, next, seen, face, scores, flow, space, matrix);
  }
  modifierBevelSplitCornerOwners(shell, next, seen);
  return next;
}

/**
 * Divides one curve between its two walls.
 *
 * @param shell Curve walk input.
 * @param next Records being rewritten.
 * @param seen Faces already claimed.
 * @param face Candidate face.
 * @param scores Authored face scores.
 * @param flow UV flow.
 * @param space Map axes or brush axes.
 * @param matrix Brush mesh world matrix.
 */
function modifierBevelSplitOneChain(
  shell: ModifierBevelDerivedBrush,
  next: ModifierBevelFaceRecord[],
  seen: Set<number>,
  face: number,
  scores: readonly ModifierBevelParentScore[],
  flow: ModifierBevelUvFlow,
  space: ModifierBevelUvSpace,
  matrix: Matrix4,
): void {
  if (seen.has(face) || !modifierBevelProfileStrip(shell, face)) return;
  const ordered = modifierBevelClaimChain(shell, face, seen);
  modifierBevelWriteSplit(
    shell,
    next,
    ordered,
    modifierBevelChainWinner(shell, ordered, scores, flow, space, matrix).parent,
  );
}

/**
 * Writes each half of a curve from its own wall.
 *
 * @param shell Curve walk input.
 * @param next Records being rewritten.
 * @param ordered Faces from the lower wall toward the other.
 * @param winner Parent chosen by the UV flow for the odd middle face.
 */
function modifierBevelWriteSplit(
  shell: ModifierBevelDerivedBrush,
  next: ModifierBevelFaceRecord[],
  ordered: readonly number[],
  winner: number,
): void {
  const ends = modifierBevelChainEnds(shell, ordered);
  const parents = modifierBevelSplitParents(ordered.length, ends.wallA, ends.wallB, winner);
  let start = 0;
  while (start < parents.length) {
    const end = modifierBevelSameParentEnd(parents, start);
    modifierBevelWriteOwnerRun(shell, next, ordered, parents[start] ?? ends.wallA, start, end);
    start = end;
  }
}

/**
 * Lists the wall that owns each position along a curve.
 *
 * @param count Face count.
 * @param wallA Wall at the start.
 * @param wallB Wall at the end.
 * @param winner Parent for the middle face of an odd curve.
 * @returns Parent per face.
 */
function modifierBevelSplitParents(count: number, wallA: number, wallB: number, winner: number): number[] {
  const parents: number[] = [];
  for (let index = 0; index < count; index += 1)
    parents.push(modifierBevelHalfParent(index, count, wallA, wallB, winner));
  return parents;
}

/**
 * Returns the first index past a run of one parent.
 *
 * @param parents Parent per face.
 * @param start First index of the run.
 * @returns Exclusive end index.
 */
function modifierBevelSameParentEnd(parents: readonly number[], start: number): number {
  const parent = parents[start];
  let end = start + 1;
  while (end < parents.length && parents[end] === parent) end += 1;
  return end;
}

/**
 * Folds one run from the segment that touches its wall.
 *
 * @param shell Curve walk input.
 * @param next Records being rewritten.
 * @param ordered Faces from the lower wall toward the other.
 * @param parent Authored parent of the run.
 * @param start First index of the run.
 * @param end Exclusive end index.
 */
function modifierBevelWriteOwnerRun(
  shell: ModifierBevelDerivedBrush,
  next: ModifierBevelFaceRecord[],
  ordered: readonly number[],
  parent: number,
  start: number,
  end: number,
): void {
  const anchor = modifierBevelRunAnchor(shell, ordered, parent, start, end);
  const face = ordered[anchor] ?? 0;
  modifierBevelWriteOwnedFace(shell, next, face, parent, modifierBevelOwnerWall(shell, face, parent));
  modifierBevelSpreadOwnerRun(shell, next, ordered, parent, anchor, start, end);
}

/**
 * Returns the segment in a run that touches its wall.
 *
 * @param shell Curve walk input.
 * @param ordered Faces from the lower wall toward the other.
 * @param parent Authored parent of the run.
 * @param start First index of the run.
 * @param end Exclusive end index.
 * @returns Index inside the run.
 */
function modifierBevelRunAnchor(
  shell: ModifierBevelDerivedBrush,
  ordered: readonly number[],
  parent: number,
  start: number,
  end: number,
): number {
  for (let index = start; index < end; index += 1) {
    if (modifierBevelOwnerWall(shell, ordered[index] ?? 0, parent) >= 0) return index;
  }
  return start;
}

/**
 * Folds the rest of a run away from the segment that touches the wall.
 *
 * @param shell Curve walk input.
 * @param next Records being rewritten.
 * @param ordered Faces from the lower wall toward the other.
 * @param parent Authored parent of the run.
 * @param anchor Segment that touches the wall.
 * @param start First index of the run.
 * @param end Exclusive end index.
 */
function modifierBevelSpreadOwnerRun(
  shell: ModifierBevelDerivedBrush,
  next: ModifierBevelFaceRecord[],
  ordered: readonly number[],
  parent: number,
  anchor: number,
  start: number,
  end: number,
): void {
  modifierBevelSpreadOwnerDown(shell, next, ordered, parent, anchor, start);
  modifierBevelSpreadOwnerUp(shell, next, ordered, parent, anchor, end);
}

/**
 * Folds faces before the anchor from the next face in the run.
 *
 * @param shell Curve walk input.
 * @param next Records being rewritten.
 * @param ordered Faces from the lower wall toward the other.
 * @param parent Authored parent of the run.
 * @param anchor Segment that touches the wall.
 * @param start First index of the run.
 */
function modifierBevelSpreadOwnerDown(
  shell: ModifierBevelDerivedBrush,
  next: ModifierBevelFaceRecord[],
  ordered: readonly number[],
  parent: number,
  anchor: number,
  start: number,
): void {
  for (let index = anchor - 1; index >= start; index -= 1) {
    modifierBevelWriteOwnedFace(shell, next, ordered[index] ?? 0, parent, ordered[index + 1] ?? 0);
  }
}

/**
 * Folds faces after the anchor from the previous face in the run.
 *
 * @param shell Curve walk input.
 * @param next Records being rewritten.
 * @param ordered Faces from the lower wall toward the other.
 * @param parent Authored parent of the run.
 * @param anchor Segment that touches the wall.
 * @param end Exclusive end index.
 */
function modifierBevelSpreadOwnerUp(
  shell: ModifierBevelDerivedBrush,
  next: ModifierBevelFaceRecord[],
  ordered: readonly number[],
  parent: number,
  anchor: number,
  end: number,
): void {
  for (let index = anchor + 1; index < end; index += 1) {
    modifierBevelWriteOwnedFace(shell, next, ordered[index] ?? 0, parent, ordered[index - 1] ?? 0);
  }
}

/**
 * Picks the wall for one position along a curve.
 *
 * @param index Position in the ordered curve.
 * @param count Face count.
 * @param wallA Wall at the start.
 * @param wallB Wall at the end.
 * @param winner Parent for the middle face of an odd curve.
 * @returns Authored parent.
 */
function modifierBevelHalfParent(index: number, count: number, wallA: number, wallB: number, winner: number): number {
  const mid = Math.floor(count / 2);
  if (count % 2 === 1 && index === mid) return winner;
  if (index < mid) return wallA;
  return wallB;
}

/**
 * Orders a curve so it begins at the winning wall.
 *
 * @param chain Curve faces from one end to the other.
 * @param start Endpoint that touches the winning wall.
 * @returns Faces from that wall toward the other.
 */
function modifierBevelChainFrom(chain: readonly number[], start: number): number[] {
  if (chain[0] === start) return chain.slice();
  return chain.slice().reverse();
}

/**
 * Writes one parent and smear links along a curve.
 *
 * @param shell Curve walk input.
 * @param next Records being rewritten.
 * @param ordered Faces from the winning wall outward.
 * @param parent Winning authored face.
 */
function modifierBevelWriteChain(
  shell: ModifierBevelDerivedBrush,
  next: ModifierBevelFaceRecord[],
  ordered: readonly number[],
  parent: number,
): void {
  let previous = modifierBevelOwnerWall(shell, ordered[0] ?? 0, parent);
  for (const face of ordered) {
    modifierBevelWriteOwnedFace(shell, next, face, parent, previous);
    previous = face;
  }
}

/**
 * Stores the winning parent on one segment and folds across the source edge.
 *
 * @param shell Curve walk input.
 * @param next Records being rewritten.
 * @param face Segment index.
 * @param parent Winning authored face.
 * @param previous Face this segment smears from.
 */
function modifierBevelWriteOwnedFace(
  shell: ModifierBevelDerivedBrush,
  next: ModifierBevelFaceRecord[],
  face: number,
  parent: number,
  previous: number,
): void {
  const record = next[face];
  if (!record) return;
  next[face] = {
    ...record,
    parentSurfaceIndex: parent,
    smearFromDerivedIndex: previous,
    chamferEdge: modifierBevelSmearEdge(shell.localBrush, face, previous, record.chamferEdge),
  };
}

/**
 * Finds the authored face of the winning wall next to a segment.
 *
 * @param shell Curve walk input.
 * @param face Segment index.
 * @param parent Winning authored face.
 * @returns Derived face index, or -1 when the wall is missing.
 */
function modifierBevelOwnerWall(shell: ModifierBevelDerivedBrush, face: number, parent: number): number {
  const touch = modifierBevelLongestOwnerTouch(shell, face, parent);
  if (touch.neighbor < 0) return -1;
  if (modifierBevelTouchIsLong(shell, face, touch.length)) return touch.neighbor;
  if (modifierBevelLongStripBeside(shell, face)) return -1;
  return touch.neighbor;
}

/**
 * Returns whether a long edge meets another profile strip.
 *
 * @param shell Curve walk input.
 * @param face Segment index.
 * @returns True when the profile continues into a neighboring strip.
 */
function modifierBevelLongStripBeside(shell: ModifierBevelDerivedBrush, face: number): boolean {
  const longest = modifierBevelLongestEdge(shell, face);
  for (const neighbor of modifierBevelNeighborFaces(shell.localBrush, face)) {
    if (!modifierBevelProfileStrip(shell, neighbor)) continue;
    if (modifierBevelSharedEdgeLength(shell.localBrush, face, neighbor) >= longest * 0.5) return true;
  }
  return false;
}

/**
 * Returns the longest edge of one face.
 *
 * @param shell Curve walk input.
 * @param face Segment index.
 * @returns Edge length.
 */
function modifierBevelLongestEdge(shell: ModifierBevelDerivedBrush, face: number): number {
  let longest = 0;
  for (const neighbor of modifierBevelNeighborFaces(shell.localBrush, face)) {
    longest = Math.max(longest, modifierBevelSharedEdgeLength(shell.localBrush, face, neighbor));
  }
  return longest;
}

/**
 * Returns the longest edge shared with the authored parent wall.
 *
 * @param shell Curve walk input.
 * @param face Segment index.
 * @param parent Authored parent.
 * @returns Neighbor and edge length, or a miss.
 */
function modifierBevelLongestOwnerTouch(
  shell: ModifierBevelDerivedBrush,
  face: number,
  parent: number,
): { neighbor: number; length: number } {
  let neighbor = -1;
  let length = 0;
  for (const candidate of modifierBevelNeighborFaces(shell.localBrush, face)) {
    const edge = modifierBevelOwnerTouchLength(shell, face, candidate, parent);
    if (edge <= length) continue;
    neighbor = candidate;
    length = edge;
  }
  return { neighbor, length };
}

/**
 * Returns the shared length when a neighbor is the authored parent wall.
 *
 * @param shell Curve walk input.
 * @param face Segment index.
 * @param neighbor Neighbor face.
 * @param parent Authored parent.
 * @returns Edge length, or 0.
 */
function modifierBevelOwnerTouchLength(
  shell: ModifierBevelDerivedBrush,
  face: number,
  neighbor: number,
  parent: number,
): number {
  if (!modifierBevelIsOwnerWall(shell, neighbor, parent)) return 0;
  return modifierBevelSharedEdgeLength(shell.localBrush, face, neighbor);
}

/**
 * Returns whether an edge is long enough to carry the profile texture.
 *
 * @param shell Curve walk input.
 * @param face Segment index.
 * @param length Edge length.
 * @returns True when the edge is at least half the longest edge of the face.
 */
function modifierBevelTouchIsLong(shell: ModifierBevelDerivedBrush, face: number, length: number): boolean {
  if (length <= 0) return false;
  let longest = 0;
  for (const neighbor of modifierBevelNeighborFaces(shell.localBrush, face)) {
    longest = Math.max(longest, modifierBevelSharedEdgeLength(shell.localBrush, face, neighbor));
  }
  return length >= longest * 0.5;
}

/**
 * Returns whether a neighbor is the authored winning wall.
 *
 * @param shell Curve walk input.
 * @param neighbor Neighbor face.
 * @param parent Winning authored face.
 * @returns True when the neighbor is that wall.
 */
function modifierBevelIsOwnerWall(shell: ModifierBevelDerivedBrush, neighbor: number, parent: number): boolean {
  const record = shell.faces[neighbor];
  if (!record || record.chamferEdge) return false;
  return record.parentSurfaceIndex === parent;
}
