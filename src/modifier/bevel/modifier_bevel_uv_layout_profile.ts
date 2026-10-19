import { Vector3, type Matrix4 } from 'three';
import { MODIFIER_VOLUME_BEVEL_UV_OWNER_SINGLE } from '@/modifier/volume/modifier_volume_bevel_keys.js';
import type { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import {
  modifierBevelNeighborFaces,
  modifierBevelSharedEdge,
  modifierBevelSharedEdgeLength,
} from './modifier_bevel_face_graph.js';
import type { ModifierBevelDerivedBrush } from './modifier_bevel_derived.js';
import { modifierBevelCylinderExplains, modifierBevelFaceOnGirderCylinder } from './modifier_bevel_profile_cylinder.js';
import { modifierBevelLayoutFrame, type ModifierBevelLayoutFrame } from './modifier_bevel_uv_layout_frame.js';
import { modifierBevelWorldLayoutFrame } from './modifier_bevel_uv_layout_world.js';

/** Where one generated face sits on its curve, and how it meets the parent. */
export interface ModifierBevelProfileMeasure {
  /** World distance already traveled across earlier faces in the curve. */
  arcStart: number;
  /** World distance across every face in the curve. */
  arcTotal: number;
  /** Parent texture coordinate placed on U at the curve's first edge. */
  phaseU: number;
  /** Parent texture coordinate placed on V at the curve's first edge. */
  phaseV: number;
  /** Sign that keeps U moving with the parent along the edge. */
  alongSign: number;
  /** Sign that keeps V moving with the parent across the cut. */
  acrossSign: number;
  /** World direction shared by every face on the curve. */
  along: Vector3;
  /** World point where the shared along coordinate is zero. */
  origin: Vector3;
  /** Lowest along coordinate of the first face. */
  minAlong: number;
  /** Along extent shared by the curve. */
  alongSpan: number;
  /**
   * True when this face's across axis points back toward the start of the
   * curve.
   */
  reversed: boolean;
}

/** Shared along axis of the first face on a curve. */
interface ModifierBevelProfileAnchor {
  /** World direction along the curve. */
  along: Vector3;
  /** World point where that direction is zero. */
  origin: Vector3;
  /** Lowest along coordinate of the first face. */
  minAlong: number;
  /** Along extent of the first face. */
  alongSpan: number;
}

/** Parent texture rates along and across one edge frame. */
interface ModifierBevelProfileGradient {
  /** Change in parent U per unit along the edge. */
  uAlong: number;
  /** Change in parent V per unit along the edge. */
  vAlong: number;
  /** Change in parent U per unit across the edge. */
  uAcross: number;
  /** Change in parent V per unit across the edge. */
  vAcross: number;
}

/** Parent phase and signs without the curve distances. */
interface ModifierBevelProfileSeam {
  /** Parent coordinate copied onto U. */
  phaseU: number;
  /** Parent coordinate copied onto V. */
  phaseV: number;
  /** Sign of the along rate. */
  alongSign: number;
  /** Sign of the across rate. */
  acrossSign: number;
}

/**
 * Measures one generated face against the whole curve it belongs to.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Generated face index.
 * @param matrix Brush local-to-world matrix.
 * @returns Curve distances and the parent phase at the first cut.
 */
export function modifierBevelProfileMeasure(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  matrix: Matrix4,
): ModifierBevelProfileMeasure {
  const chain = modifierBevelProfileChain(derived, faceIndex);
  const widths = modifierBevelProfileWidths(derived, chain, matrix);
  const first = chain[0];
  const anchor = modifierBevelProfileAnchor(derived, first === undefined ? faceIndex : first, matrix);
  const reversed = modifierBevelProfileReversed(derived, chain, faceIndex, matrix);
  return modifierBevelProfileAssemble(source, derived, chain, widths, faceIndex, anchor, reversed);
}

/**
 * Lists the generated faces that form one curve, starting at its first cut.
 *
 * @param derived Derived brush.
 * @param faceIndex Any face on the curve.
 * @returns Face indices from the parent cut toward the far side.
 */
export function modifierBevelProfileChain(derived: ModifierBevelDerivedBrush, faceIndex: number): number[] {
  if (!modifierBevelProfileStrip(derived, faceIndex)) return [faceIndex];
  const members = modifierBevelCurveMembers(derived, faceIndex);
  return modifierBevelCurveOrder(derived, members);
}

/**
 * Returns whether a generated face runs along a bevel.
 *
 * @param derived Derived brush.
 * @param faceIndex Face index.
 * @returns True when the face has two long, nearly parallel edges.
 */
export function modifierBevelProfileStrip(derived: ModifierBevelDerivedBrush, faceIndex: number): boolean {
  if (!derived.faces[faceIndex]?.chamferEdge) return false;
  if (modifierBevelFaceOnGirderCylinder(derived.localBrush, derived.girders, faceIndex)) return true;
  if (derived.faces[faceIndex]?.cornerFace && modifierBevelCylinderExplains(derived)) {
    return false;
  }
  return modifierBevelEdgesRunAlong(derived.localBrush, faceIndex);
}

/**
 * Stores curve distances and the seam phase for one face.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param chain Curve face indices.
 * @param widths World width of each face in the curve.
 * @param faceIndex Face being measured.
 * @param anchor Along axis taken from the first face.
 * @param reversed True when across points back toward the start.
 * @returns Curve placement.
 */
function modifierBevelProfileAssemble(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  chain: readonly number[],
  widths: readonly number[],
  faceIndex: number,
  anchor: ModifierBevelProfileAnchor,
  reversed: boolean,
): ModifierBevelProfileMeasure {
  const first = chain[0];
  const seam = modifierBevelProfileSeam(source, derived, first === undefined ? faceIndex : first);
  const arcStart = modifierBevelArcBefore(chain, widths, faceIndex);
  return modifierBevelProfileJoin(seam, anchor, arcStart, modifierBevelArcSum(widths), reversed);
}

/**
 * Combines a seam, an along axis, and curve distances.
 *
 * @param seam Parent phase and signs.
 * @param anchor Along axis of the first face.
 * @param arcStart World distance before this face.
 * @param arcTotal World distance across the curve.
 * @param reversed True when across points back toward the start.
 * @returns Curve placement.
 */
function modifierBevelProfileJoin(
  seam: ModifierBevelProfileSeam,
  anchor: ModifierBevelProfileAnchor,
  arcStart: number,
  arcTotal: number,
  reversed: boolean,
): ModifierBevelProfileMeasure {
  return {
    ...modifierBevelProfileSeamFields(seam),
    arcStart,
    arcTotal,
    reversed,
    along: anchor.along,
    origin: anchor.origin,
    minAlong: anchor.minAlong,
    alongSpan: anchor.alongSpan,
  };
}

/**
 * Copies the parent phase out of a seam.
 *
 * @param seam Parent phase and signs.
 * @returns Phase fields.
 */
function modifierBevelProfileSeamFields(seam: ModifierBevelProfileSeam): ModifierBevelProfileSeam {
  return { phaseU: seam.phaseU, phaseV: seam.phaseV, alongSign: seam.alongSign, acrossSign: seam.acrossSign };
}

/**
 * Measures the world width of every face in a curve.
 *
 * @param derived Derived brush.
 * @param chain Curve face indices.
 * @param matrix Brush local-to-world matrix.
 * @returns Width of each face, in chain order.
 */
function modifierBevelProfileWidths(
  derived: ModifierBevelDerivedBrush,
  chain: readonly number[],
  matrix: Matrix4,
): number[] {
  const widths: number[] = [];
  for (const index of chain) widths.push(modifierBevelProfileWidth(derived, index, matrix));
  return widths;
}

/**
 * Measures one face's world distance across the curve.
 *
 * @param derived Derived brush.
 * @param faceIndex Face index.
 * @param matrix Brush local-to-world matrix.
 * @returns World width, or zero when the face has no edge.
 */
function modifierBevelProfileWidth(derived: ModifierBevelDerivedBrush, faceIndex: number, matrix: Matrix4): number {
  return modifierBevelProfileWorldFrame(derived, faceIndex, matrix)?.acrossSpan ?? 0;
}

/**
 * Builds the world edge frame of one generated face.
 *
 * @param derived Derived brush.
 * @param faceIndex Face index.
 * @param matrix Brush local-to-world matrix.
 * @returns World frame, or null when the face has no edge.
 */
function modifierBevelProfileWorldFrame(
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  matrix: Matrix4,
): ModifierBevelLayoutFrame | null {
  const local = modifierBevelLayoutFrame(derived.localBrush, faceIndex, derived.faces[faceIndex]);
  if (!local) return null;
  return modifierBevelWorldLayoutFrame(matrix, derived.localBrush, faceIndex, local);
}

/**
 * Reads the along axis that every face on the curve shares.
 *
 * @param derived Derived brush.
 * @param faceIndex First face on the curve.
 * @param matrix Brush local-to-world matrix.
 * @returns Along axis, or a unit X axis when the face has no edge.
 */
function modifierBevelProfileAnchor(
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  matrix: Matrix4,
): ModifierBevelProfileAnchor {
  const frame = modifierBevelProfileWorldFrame(derived, faceIndex, matrix);
  if (!frame) return modifierBevelFlatAnchor();
  return { along: frame.along, origin: frame.origin, minAlong: frame.minAlong, alongSpan: frame.alongSpan };
}

/**
 * Returns an along axis that leaves U measuring world X.
 *
 * @returns Anchor at the origin.
 */
function modifierBevelFlatAnchor(): ModifierBevelProfileAnchor {
  return { along: new Vector3(1, 0, 0), origin: new Vector3(), minAlong: 0, alongSpan: 1 };
}

/** One edge of a face, longest first when ranked. */
interface ModifierBevelRankedEdge {
  /** Face across the edge. */
  neighbor: number;
  /** Edge length. */
  length: number;
  /** Unit direction from one endpoint to the other. */
  direction: Vector3;
}

/**
 * Collects every strip face that shares long edges with the start.
 *
 * @param derived Derived brush.
 * @param start First strip face.
 * @returns Faces on that bevel.
 */
function modifierBevelCurveMembers(derived: ModifierBevelDerivedBrush, start: number): number[] {
  const members: number[] = [];
  const pending = [start];
  const seen = new Set<number>([start]);
  while (pending.length > 0) modifierBevelTakeCurveFace(derived, members, pending, seen);
  return members;
}

/**
 * Claims one queued strip and queues the next strips along the bevel.
 *
 * @param derived Derived brush.
 * @param members Faces already claimed.
 * @param pending Faces still to visit.
 * @param seen Faces already queued.
 */
function modifierBevelTakeCurveFace(
  derived: ModifierBevelDerivedBrush,
  members: number[],
  pending: number[],
  seen: Set<number>,
): void {
  const faceIndex = pending.shift();
  if (faceIndex === undefined) return;
  members.push(faceIndex);
  modifierBevelQueueCurveNeighbors(derived, faceIndex, pending, seen);
}

/**
 * Queues strip neighbors across the long edges.
 *
 * @param derived Derived brush.
 * @param faceIndex Current face.
 * @param pending Faces still to visit.
 * @param seen Faces already queued.
 */
function modifierBevelQueueCurveNeighbors(
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  pending: number[],
  seen: Set<number>,
): void {
  const threshold = modifierBevelLongestEdge(derived.localBrush, faceIndex) * 0.5;
  for (const neighbor of modifierBevelNeighborFaces(derived.localBrush, faceIndex)) {
    modifierBevelQueueCurveNeighbor(derived, faceIndex, neighbor, threshold, pending, seen);
  }
}

/**
 * Queues one neighbor when it continues the bevel.
 *
 * @param derived Derived brush.
 * @param faceIndex Current face.
 * @param neighbor Neighbor face.
 * @param threshold Minimum shared edge length.
 * @param pending Faces still to visit.
 * @param seen Faces already queued.
 */
function modifierBevelQueueCurveNeighbor(
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  neighbor: number,
  threshold: number,
  pending: number[],
  seen: Set<number>,
): void {
  if (seen.has(neighbor) || !modifierBevelProfileStrip(derived, neighbor)) return;
  if (modifierBevelSharedEdgeLength(derived.localBrush, faceIndex, neighbor) < threshold) return;
  seen.add(neighbor);
  pending.push(neighbor);
}

/**
 * Orders a bevel from the wall with the lower parent index.
 *
 * @param derived Derived brush.
 * @param members Strip faces on one bevel.
 * @returns Faces from one cut toward the other.
 */
function modifierBevelCurveOrder(derived: ModifierBevelDerivedBrush, members: readonly number[]): number[] {
  const start = modifierBevelCurveStart(derived, members);
  return modifierBevelCurveWalk(derived, members, start);
}

/**
 * Picks the end of a bevel that meets the earlier parent.
 *
 * @param derived Derived brush.
 * @param members Strip faces on one bevel.
 * @returns Starting face.
 */
function modifierBevelCurveStart(derived: ModifierBevelDerivedBrush, members: readonly number[]): number {
  const owned = modifierBevelOwnedCurveStart(derived, members);
  if (owned >= 0) return owned;
  const group = new Set(members);
  let best = members[0] ?? 0;
  let bestParent = Number.POSITIVE_INFINITY;
  for (const face of members) {
    const chosen = modifierBevelPreferCurveEnd(derived, group, face, best, bestParent);
    best = chosen.face;
    bestParent = chosen.parent;
  }
  return best;
}

/**
 * Picks the end that touches the single owning wall.
 *
 * @param derived Derived brush.
 * @param members Strip faces on one bevel.
 * @returns Starting face, or -1 when ownership is split.
 */
function modifierBevelOwnedCurveStart(derived: ModifierBevelDerivedBrush, members: readonly number[]): number {
  if (derived.placement.uvOwner !== MODIFIER_VOLUME_BEVEL_UV_OWNER_SINGLE) return -1;
  const group = new Set(members);
  let best = -1;
  for (const face of members) best = modifierBevelPreferOwnedEnd(derived, group, face, best);
  return best;
}

/**
 * Keeps the earlier endpoint that touches the owning wall.
 *
 * @param derived Derived brush.
 * @param group Faces on the bevel.
 * @param face Candidate face.
 * @param best Best endpoint so far.
 * @returns Updated endpoint.
 */
function modifierBevelPreferOwnedEnd(
  derived: ModifierBevelDerivedBrush,
  group: ReadonlySet<number>,
  face: number,
  best: number,
): number {
  if (modifierBevelCurveDegree(derived, face, group) !== 1) return best;
  if (!modifierBevelTouchesOwnerWall(derived, face)) return best;
  if (best >= 0 && face >= best) return best;
  return face;
}

/**
 * Returns whether a segment shares an edge with its own authored wall.
 *
 * @param derived Derived brush.
 * @param face Segment index.
 * @returns True when an authored neighbor uses the same parent.
 */
function modifierBevelTouchesOwnerWall(derived: ModifierBevelDerivedBrush, face: number): boolean {
  const parent = derived.faces[face]?.parentSurfaceIndex ?? -1;
  for (const neighbor of modifierBevelNeighborFaces(derived.localBrush, face)) {
    if (modifierBevelWallMatches(derived, neighbor, parent)) return true;
  }
  return false;
}

/**
 * Returns whether a neighbor is the authored face of one parent.
 *
 * @param derived Derived brush.
 * @param neighbor Neighbor face.
 * @param parent Authored parent index.
 * @returns True when the neighbor is that wall.
 */
function modifierBevelWallMatches(derived: ModifierBevelDerivedBrush, neighbor: number, parent: number): boolean {
  const record = derived.faces[neighbor];
  if (!record || record.chamferEdge) return false;
  return record.parentSurfaceIndex === parent;
}

/**
 * Keeps an endpoint when its parent comes first.
 *
 * @param derived Derived brush.
 * @param group Faces on the bevel.
 * @param face Candidate face.
 * @param best Best endpoint so far.
 * @param bestParent Parent index of that endpoint.
 * @returns Updated endpoint.
 */
function modifierBevelPreferCurveEnd(
  derived: ModifierBevelDerivedBrush,
  group: ReadonlySet<number>,
  face: number,
  best: number,
  bestParent: number,
): { face: number; parent: number } {
  if (modifierBevelCurveDegree(derived, face, group) !== 1) return { face: best, parent: bestParent };
  const parent = derived.faces[face]?.parentSurfaceIndex ?? 0;
  if (parent > bestParent || (parent === bestParent && face >= best)) return { face: best, parent: bestParent };
  return { face, parent };
}

/**
 * Counts strip neighbors on the same bevel.
 *
 * @param derived Derived brush.
 * @param faceIndex Face index.
 * @param group Faces on the bevel.
 * @returns Neighbor count.
 */
function modifierBevelCurveDegree(
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  group: ReadonlySet<number>,
): number {
  let count = 0;
  for (const neighbor of modifierBevelNeighborFaces(derived.localBrush, faceIndex)) {
    if (group.has(neighbor)) count += 1;
  }
  return count;
}

/**
 * Walks from one end of a bevel to the other.
 *
 * @param derived Derived brush.
 * @param members Strip faces on one bevel.
 * @param start Starting face.
 * @returns Ordered faces.
 */
function modifierBevelCurveWalk(
  derived: ModifierBevelDerivedBrush,
  members: readonly number[],
  start: number,
): number[] {
  const group = new Set(members);
  const chain = [start];
  const seen = new Set<number>([start]);
  let current = start;
  while (chain.length < members.length) {
    const next = modifierBevelCurveNext(derived, current, group, seen);
    if (next < 0) return chain;
    seen.add(next);
    chain.push(next);
    current = next;
  }
  return chain;
}

/**
 * Returns the next unvisited strip on the bevel.
 *
 * @param derived Derived brush.
 * @param faceIndex Current face.
 * @param group Faces on the bevel.
 * @param seen Faces already ordered.
 * @returns Next face, or -1 when the bevel ends.
 */
function modifierBevelCurveNext(
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  group: ReadonlySet<number>,
  seen: ReadonlySet<number>,
): number {
  for (const neighbor of modifierBevelNeighborFaces(derived.localBrush, faceIndex)) {
    if (group.has(neighbor) && !seen.has(neighbor)) return neighbor;
  }
  return -1;
}

/**
 * Returns whether a face has two long edges in one direction.
 *
 * @param brush Derived brush.
 * @param faceIndex Face index.
 * @returns True when those edges are nearly parallel.
 */
function modifierBevelEdgesRunAlong(brush: SolidBrush, faceIndex: number): boolean {
  const ranked = modifierBevelRankedEdges(brush, faceIndex);
  const first = ranked[0];
  const second = ranked[1];
  if (!first || !second || second.length < first.length * 0.5) return false;
  return Math.abs(first.direction.dot(second.direction)) >= 0.9;
}

/**
 * Lists a face's edges from longest to shortest.
 *
 * @param brush Derived brush.
 * @param faceIndex Face index.
 * @returns Ranked edges.
 */
function modifierBevelRankedEdges(brush: SolidBrush, faceIndex: number): ModifierBevelRankedEdge[] {
  const ranked: ModifierBevelRankedEdge[] = [];
  for (const neighbor of modifierBevelNeighborFaces(brush, faceIndex)) {
    const rankedEdge = modifierBevelRankEdge(brush, faceIndex, neighbor);
    if (rankedEdge) ranked.push(rankedEdge);
  }
  ranked.sort((left, right) => right.length - left.length);
  return ranked;
}

/**
 * Measures one shared edge.
 *
 * @param brush Derived brush.
 * @param faceIndex Face index.
 * @param neighbor Neighbor face.
 * @returns Ranked edge, or null when the faces do not meet.
 */
function modifierBevelRankEdge(brush: SolidBrush, faceIndex: number, neighbor: number): ModifierBevelRankedEdge | null {
  const edge = modifierBevelSharedEdge(brush, faceIndex, neighbor);
  if (!edge) return null;
  const direction = edge.pointB.clone().sub(edge.pointA);
  const length = direction.length();
  if (length <= 1e-8) return null;
  return { neighbor, length, direction: direction.multiplyScalar(1 / length) };
}

/**
 * Returns the longest edge of one face.
 *
 * @param brush Derived brush.
 * @param faceIndex Face index.
 * @returns Longest edge length.
 */
function modifierBevelLongestEdge(brush: SolidBrush, faceIndex: number): number {
  return modifierBevelRankedEdges(brush, faceIndex)[0]?.length ?? 0;
}

/**
 * Returns whether this face's across axis points back along the curve.
 *
 * @param derived Derived brush.
 * @param chain Ordered curve.
 * @param faceIndex Face being measured.
 * @param matrix Brush local-to-world matrix.
 * @returns True when the previous face lies on the far side of across.
 */
function modifierBevelProfileReversed(
  derived: ModifierBevelDerivedBrush,
  chain: readonly number[],
  faceIndex: number,
  matrix: Matrix4,
): boolean {
  const position = chain.indexOf(faceIndex);
  const previous = position > 0 ? chain[position - 1] : undefined;
  if (previous === undefined) return false;
  return modifierBevelEdgeIsFar(derived, faceIndex, previous, matrix);
}

/**
 * Returns whether a shared edge lies past the middle of a face.
 *
 * @param derived Derived brush.
 * @param faceIndex Face being measured.
 * @param previous Previous face on the curve.
 * @param matrix Brush local-to-world matrix.
 * @returns True when the edge is on the far side of across.
 */
function modifierBevelEdgeIsFar(
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  previous: number,
  matrix: Matrix4,
): boolean {
  const frame = modifierBevelProfileWorldFrame(derived, faceIndex, matrix);
  const edge = modifierBevelSharedEdge(derived.localBrush, faceIndex, previous);
  if (!frame || !edge) return false;
  return modifierBevelEdgeAcross(frame, edge, matrix) > frame.minAcross + frame.acrossSpan * 0.5;
}

/**
 * Measures a shared edge on a face's across axis.
 *
 * @param frame World edge frame.
 * @param edge Shared edge in brush-local space.
 * @param matrix Brush local-to-world matrix.
 * @returns Across coordinate of the edge midpoint.
 */
function modifierBevelEdgeAcross(
  frame: ModifierBevelLayoutFrame,
  edge: { pointA: Vector3; pointB: Vector3 },
  matrix: Matrix4,
): number {
  const midpoint = edge.pointA.clone().add(edge.pointB).multiplyScalar(0.5).applyMatrix4(matrix);
  return midpoint.sub(frame.origin).dot(frame.across);
}

/**
 * Sums widths of faces before one index.
 *
 * @param chain Curve face indices.
 * @param widths World width of each face.
 * @param faceIndex Face being placed.
 * @returns Distance before that face.
 */
function modifierBevelArcBefore(chain: readonly number[], widths: readonly number[], faceIndex: number): number {
  let sum = 0;
  for (let index = 0; index < chain.length; index += 1) {
    if (chain[index] === faceIndex) return sum;
    sum += widths[index] ?? 0;
  }
  return 0;
}

/**
 * Sums the world width of a curve.
 *
 * @param widths World width of each face.
 * @returns Total width.
 */
function modifierBevelArcSum(widths: readonly number[]): number {
  let sum = 0;
  for (const width of widths) sum += width;
  return sum;
}

/**
 * Reads the parent texture where the curve meets its wall.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex First face on the curve.
 * @returns Phase and signs, or a zero phase when the face has no edge.
 */
function modifierBevelProfileSeam(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
): ModifierBevelProfileSeam {
  const local = modifierBevelLayoutFrame(derived.localBrush, faceIndex, derived.faces[faceIndex]);
  if (!local) return modifierBevelFlatSeam();
  return modifierBevelSeamOnFrame(source, derived, faceIndex, local);
}

/**
 * Returns a phase that leaves U and V unchanged.
 *
 * @returns Zero phase and positive signs.
 */
function modifierBevelFlatSeam(): ModifierBevelProfileSeam {
  return { phaseU: 0, phaseV: 0, alongSign: 1, acrossSign: 1 };
}

/**
 * Matches the parent texture at one edge frame.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex First face on the curve.
 * @param local Edge frame in brush-local space.
 * @returns Phase and signs.
 */
function modifierBevelSeamOnFrame(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  local: ModifierBevelLayoutFrame,
): ModifierBevelProfileSeam {
  const parent = source.getFaceSurface(derived.faces[faceIndex]?.parentSurfaceIndex ?? 0).uv;
  const atOrigin = parent.project(local.origin);
  return modifierBevelSeamFromGradient(atOrigin, modifierBevelParentGradient(parent, local));
}

/**
 * Measures how the parent texture changes along and across an edge.
 *
 * @param parent Parent UV matrix.
 * @param local Edge frame in brush-local space.
 * @returns Parent rates.
 */
function modifierBevelParentGradient(
  parent: SurfaceUvMatrix,
  local: ModifierBevelLayoutFrame,
): ModifierBevelProfileGradient {
  const uAxis = new Vector3(parent.u.x, parent.u.y, parent.u.z);
  const vAxis = new Vector3(parent.v.x, parent.v.y, parent.v.z);
  return modifierBevelGradientDots(uAxis, vAxis, local);
}

/**
 * Dots parent axes with an edge frame.
 *
 * @param uAxis Parent U direction.
 * @param vAxis Parent V direction.
 * @param local Edge frame.
 * @returns Parent rates.
 */
function modifierBevelGradientDots(
  uAxis: Vector3,
  vAxis: Vector3,
  local: ModifierBevelLayoutFrame,
): ModifierBevelProfileGradient {
  return {
    uAlong: uAxis.dot(local.along),
    vAlong: vAxis.dot(local.along),
    uAcross: uAxis.dot(local.across),
    vAcross: vAxis.dot(local.across),
  };
}

/**
 * Puts the parent axis that runs along the edge onto U.
 *
 * @param atOrigin Parent UV at the edge origin.
 * @param gradient Parent rates.
 * @returns Phase and signs.
 */
function modifierBevelSeamFromGradient(
  atOrigin: { u: number; v: number },
  gradient: ModifierBevelProfileGradient,
): ModifierBevelProfileSeam {
  if (Math.abs(gradient.uAlong) >= Math.abs(gradient.vAlong)) {
    return modifierBevelSeamAxes(atOrigin.u, atOrigin.v, gradient.uAlong, gradient.vAcross);
  }
  return modifierBevelSeamAxes(atOrigin.v, atOrigin.u, gradient.vAlong, gradient.uAcross);
}

/**
 * Stores one choice of parent axes.
 *
 * @param phaseU Value copied onto U.
 * @param phaseV Value copied onto V.
 * @param alongRate Parent change along the edge for the U choice.
 * @param acrossRate Parent change across the cut for the V choice.
 * @returns Phase and signs.
 */
function modifierBevelSeamAxes(
  phaseU: number,
  phaseV: number,
  alongRate: number,
  acrossRate: number,
): ModifierBevelProfileSeam {
  return {
    phaseU,
    phaseV,
    alongSign: modifierBevelRateSign(alongRate),
    acrossSign: modifierBevelRateSign(acrossRate),
  };
}

/**
 * Returns the direction of a parent rate.
 *
 * @param rate Parent change per unit distance.
 * @returns -1 when the rate is negative, otherwise 1.
 */
function modifierBevelRateSign(rate: number): number {
  if (rate < 0) return -1;
  return 1;
}
