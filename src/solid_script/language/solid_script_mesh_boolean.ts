import * as THREE from 'three';
import type { SolidScriptShapeMesh, SolidScriptUv } from './solid_script_mesh.js';

/** How far, in metres, a corner may be off a plane and still lie on it. */
const SOLID_SCRIPT_MESH_BOOLEAN_ON = 1e-5;

/** One corner of a piece: where it is and its texture coordinate, if any. */
interface SolidScriptMeshBooleanCorner {
  at: THREE.Vector3;
  uv: SolidScriptUv | null;
}

/** A flat convex or concave piece of a mesh surface, with its plane. */
interface SolidScriptMeshBooleanPiece {
  corners: SolidScriptMeshBooleanCorner[];
  normal: THREE.Vector3;
  offset: number;
}

/** A node of a tree that splits space by the planes of the pieces. */
interface SolidScriptMeshBooleanNode {
  normal: THREE.Vector3 | null;
  offset: number;
  pieces: SolidScriptMeshBooleanPiece[];
  front: SolidScriptMeshBooleanNode | null;
  back: SolidScriptMeshBooleanNode | null;
}

/** Which side of a plane a corner, or a whole piece, lies on. */
type SolidScriptMeshBooleanSide = 0 | 1 | 2 | 3;

/** On the plane. */
const ON = 0;
/** In front of the plane. */
const FRONT = 1;
/** Behind the plane. */
const BACK = 2;
/** On both sides, so the piece must be split. */
const BOTH = 3;

/**
 * Makes a piece from its corners, working out its plane.
 *
 * @param corners Corners in order, counter-clockwise from outside.
 * @returns Piece, or null when the corners make no area.
 */
function solidScriptMeshBooleanPieceOf(corners: SolidScriptMeshBooleanCorner[]): SolidScriptMeshBooleanPiece | null {
  const normal = new THREE.Vector3();
  corners.forEach((corner, index) => {
    const next = corners[(index + 1) % corners.length]?.at ?? corner.at;
    normal.x += (corner.at.y - next.y) * (corner.at.z + next.z);
    normal.y += (corner.at.z - next.z) * (corner.at.x + next.x);
    normal.z += (corner.at.x - next.x) * (corner.at.y + next.y);
  });
  if (corners.length < 3 || normal.lengthSq() < 1e-18) return null;
  normal.normalize();
  const first = corners[0];
  return first ? { corners, normal, offset: normal.dot(first.at) } : null;
}

/**
 * Turns a piece to face the other way.
 *
 * @param piece Piece.
 * @returns Flipped copy.
 */
function solidScriptMeshBooleanFlip(piece: SolidScriptMeshBooleanPiece): SolidScriptMeshBooleanPiece {
  return { corners: [...piece.corners].reverse(), normal: piece.normal.clone().negate(), offset: -piece.offset };
}

/**
 * Cuts the faces of a mesh into pieces.
 *
 * @param mesh Mesh.
 * @returns Pieces.
 */
function solidScriptMeshBooleanPieces(mesh: SolidScriptShapeMesh): SolidScriptMeshBooleanPiece[] {
  return mesh.faces.flatMap((loop, face) => {
    const uvs = mesh.uvs[face];
    const corners = loop.map((index, spot) => ({
      at: (mesh.points[index] ?? new THREE.Vector3()).clone(),
      uv: uvs?.[spot] ?? null,
    }));
    const piece = solidScriptMeshBooleanPieceOf(corners);
    return piece ? [piece] : [];
  });
}

/**
 * Where a corner lies against a plane.
 *
 * @param normal Plane direction.
 * @param offset Plane distance from the origin.
 * @param at Corner.
 * @returns Side.
 */
function solidScriptMeshBooleanSideOf(
  normal: THREE.Vector3,
  offset: number,
  at: THREE.Vector3,
): SolidScriptMeshBooleanSide {
  const distance = normal.dot(at) - offset;
  if (distance > SOLID_SCRIPT_MESH_BOOLEAN_ON) return FRONT;
  if (distance < -SOLID_SCRIPT_MESH_BOOLEAN_ON) return BACK;
  return ON;
}

/**
 * The corner where an edge crosses a plane, its texture coordinate blended.
 *
 * @param a Start.
 * @param b End.
 * @param normal Plane direction.
 * @param offset Plane distance from the origin.
 * @returns Corner.
 */
function solidScriptMeshBooleanCross(
  a: SolidScriptMeshBooleanCorner,
  b: SolidScriptMeshBooleanCorner,
  normal: THREE.Vector3,
  offset: number,
): SolidScriptMeshBooleanCorner {
  const along = (offset - normal.dot(a.at)) / normal.dot(b.at.clone().sub(a.at));
  const uv: SolidScriptUv | null =
    a.uv && b.uv ? [a.uv[0] + (b.uv[0] - a.uv[0]) * along, a.uv[1] + (b.uv[1] - a.uv[1]) * along] : null;
  return { at: a.at.clone().lerp(b.at, along), uv };
}

/** Where the parts of a piece go once a plane has sorted it. */
interface SolidScriptMeshBooleanSorted {
  onFront: SolidScriptMeshBooleanPiece[];
  onBack: SolidScriptMeshBooleanPiece[];
  front: SolidScriptMeshBooleanPiece[];
  back: SolidScriptMeshBooleanPiece[];
}

/**
 * Splits a piece that crosses a plane into its front and back parts.
 *
 * @param piece Piece.
 * @param normal Plane direction.
 * @param offset Plane distance from the origin.
 * @param sides Side of each corner.
 * @param into Lists the parts go to.
 */
function solidScriptMeshBooleanSplit(
  piece: SolidScriptMeshBooleanPiece,
  normal: THREE.Vector3,
  offset: number,
  sides: readonly SolidScriptMeshBooleanSide[],
  into: SolidScriptMeshBooleanSorted,
): void {
  const front: SolidScriptMeshBooleanCorner[] = [];
  const back: SolidScriptMeshBooleanCorner[] = [];
  piece.corners.forEach((corner, index) => {
    const next = piece.corners[(index + 1) % piece.corners.length] ?? corner;
    const side = sides[index] ?? ON;
    const nextSide = sides[(index + 1) % sides.length] ?? ON;
    if (side !== BACK) front.push(corner);
    if (side !== FRONT) back.push(side === ON ? { at: corner.at.clone(), uv: corner.uv } : corner);
    if ((side | nextSide) !== BOTH) return;
    const cross = solidScriptMeshBooleanCross(corner, next, normal, offset);
    front.push(cross);
    back.push({ at: cross.at.clone(), uv: cross.uv });
  });
  const frontPiece = solidScriptMeshBooleanPieceOf(front);
  const backPiece = solidScriptMeshBooleanPieceOf(back);
  if (frontPiece) into.front.push(frontPiece);
  if (backPiece) into.back.push(backPiece);
}

/**
 * Sorts a piece against a plane: on it facing either way, in front, behind, or
 * split across.
 *
 * @param piece Piece.
 * @param normal Plane direction.
 * @param offset Plane distance from the origin.
 * @param into Lists the piece or its parts go to.
 */
function solidScriptMeshBooleanSort(
  piece: SolidScriptMeshBooleanPiece,
  normal: THREE.Vector3,
  offset: number,
  into: SolidScriptMeshBooleanSorted,
): void {
  const sides = piece.corners.map((corner) => solidScriptMeshBooleanSideOf(normal, offset, corner.at));
  const all = sides.reduce<number>((joined, side) => joined | side, ON);
  if (all === ON) (normal.dot(piece.normal) > 0 ? into.onFront : into.onBack).push(piece);
  else if (all === FRONT) into.front.push(piece);
  else if (all === BACK) into.back.push(piece);
  else solidScriptMeshBooleanSplit(piece, normal, offset, sides, into);
}

/**
 * Sorts pieces against a plane.
 *
 * @param pieces Pieces.
 * @param normal Plane direction.
 * @param offset Plane distance from the origin.
 * @returns Sorted parts.
 */
function solidScriptMeshBooleanSortAll(
  pieces: readonly SolidScriptMeshBooleanPiece[],
  normal: THREE.Vector3,
  offset: number,
): SolidScriptMeshBooleanSorted {
  const sorted: SolidScriptMeshBooleanSorted = { onFront: [], onBack: [], front: [], back: [] };
  for (const piece of pieces) solidScriptMeshBooleanSort(piece, normal, offset, sorted);
  return sorted;
}

/**
 * Makes an empty tree node.
 *
 * @returns Node.
 */
function solidScriptMeshBooleanNodeEmpty(): SolidScriptMeshBooleanNode {
  return { normal: null, offset: 0, pieces: [], front: null, back: null };
}

/**
 * Adds pieces to a tree, splitting space by their planes.
 *
 * @param node Tree.
 * @param pieces Pieces.
 */
function solidScriptMeshBooleanAdd(
  node: SolidScriptMeshBooleanNode,
  pieces: readonly SolidScriptMeshBooleanPiece[],
): void {
  const first = pieces[0];
  if (!first) return;
  if (!node.normal) {
    node.normal = first.normal.clone();
    node.offset = first.offset;
  }
  const sorted = solidScriptMeshBooleanSortAll(pieces, node.normal, node.offset);
  node.pieces.push(...sorted.onFront, ...sorted.onBack);
  if (sorted.front.length > 0)
    solidScriptMeshBooleanAdd((node.front ??= solidScriptMeshBooleanNodeEmpty()), sorted.front);
  if (sorted.back.length > 0) solidScriptMeshBooleanAdd((node.back ??= solidScriptMeshBooleanNodeEmpty()), sorted.back);
}

/**
 * Builds a tree from pieces.
 *
 * @param pieces Pieces.
 * @returns Tree.
 */
function solidScriptMeshBooleanTree(pieces: readonly SolidScriptMeshBooleanPiece[]): SolidScriptMeshBooleanNode {
  const node = solidScriptMeshBooleanNodeEmpty();
  solidScriptMeshBooleanAdd(node, pieces);
  return node;
}

/**
 * Turns a tree inside out: what was inside becomes outside.
 *
 * @param node Tree.
 */
function solidScriptMeshBooleanInvert(node: SolidScriptMeshBooleanNode | null): void {
  if (!node) return;
  node.pieces = node.pieces.map(solidScriptMeshBooleanFlip);
  if (node.normal) {
    node.normal.negate();
    node.offset = -node.offset;
  }
  solidScriptMeshBooleanInvert(node.front);
  solidScriptMeshBooleanInvert(node.back);
  [node.front, node.back] = [node.back, node.front];
}

/**
 * Keeps the parts of pieces that lie outside the shape a tree holds.
 *
 * @param node Tree.
 * @param pieces Pieces.
 * @returns Parts outside.
 */
function solidScriptMeshBooleanClip(
  node: SolidScriptMeshBooleanNode,
  pieces: readonly SolidScriptMeshBooleanPiece[],
): SolidScriptMeshBooleanPiece[] {
  if (!node.normal) return [...pieces];
  const sorted = solidScriptMeshBooleanSortAll(pieces, node.normal, node.offset);
  const front = [...sorted.front, ...sorted.onFront];
  const back = [...sorted.back, ...sorted.onBack];
  const kept = node.front ? solidScriptMeshBooleanClip(node.front, front) : front;
  return [...kept, ...(node.back ? solidScriptMeshBooleanClip(node.back, back) : [])];
}

/**
 * Takes out of one tree every piece inside the shape another holds.
 *
 * @param node Tree whose pieces are kept or dropped.
 * @param by Tree of the other shape.
 */
function solidScriptMeshBooleanClipTo(node: SolidScriptMeshBooleanNode | null, by: SolidScriptMeshBooleanNode): void {
  if (!node) return;
  node.pieces = solidScriptMeshBooleanClip(by, node.pieces);
  solidScriptMeshBooleanClipTo(node.front, by);
  solidScriptMeshBooleanClipTo(node.back, by);
}

/**
 * Every piece a tree holds.
 *
 * @param node Tree.
 * @returns Pieces.
 */
function solidScriptMeshBooleanAll(node: SolidScriptMeshBooleanNode | null): SolidScriptMeshBooleanPiece[] {
  if (!node) return [];
  return [...node.pieces, ...solidScriptMeshBooleanAll(node.front), ...solidScriptMeshBooleanAll(node.back)];
}

/**
 * Builds a mesh from pieces, sharing corners at the same place.
 *
 * @param pieces Pieces.
 * @param like Mesh whose label, texture and tags it keeps.
 * @param cutter Mesh whose tags join them.
 * @returns Mesh.
 */
function solidScriptMeshBooleanMesh(
  pieces: readonly SolidScriptMeshBooleanPiece[],
  like: SolidScriptShapeMesh,
  cutter: SolidScriptShapeMesh,
): SolidScriptShapeMesh {
  const points: THREE.Vector3[] = [];
  const known = new Map<string, number>();
  const placeOf = (at: THREE.Vector3): number => {
    const key = at
      .toArray()
      .map((value) => Math.round(value / SOLID_SCRIPT_MESH_BOOLEAN_ON))
      .join(',');
    const found = known.get(key);
    if (found !== undefined) return found;
    known.set(key, points.length);
    return points.push(at.clone()) - 1;
  };
  const faces = pieces.map((piece) => piece.corners.map((corner) => placeOf(corner.at)));
  const uvs = pieces.map((piece) =>
    piece.corners.every((corner) => corner.uv) ? piece.corners.map((corner) => corner.uv as SolidScriptUv) : null,
  );
  const tags = [...(like.faceTags ?? []), ...(cutter.faceTags ?? [])];
  return { ...like, points, faces, uvs, ...(tags.length > 0 ? { faceTags: tags } : {}) };
}

/**
 * Cuts one closed mesh out of another.
 *
 * @param mesh Mesh that is cut.
 * @param cutter Mesh that cuts.
 * @returns What is left, or null when nothing is.
 */
export function solidScriptMeshSubtract(
  mesh: SolidScriptShapeMesh,
  cutter: SolidScriptShapeMesh,
): SolidScriptShapeMesh | null {
  const kept = solidScriptMeshBooleanTree(solidScriptMeshBooleanPieces(mesh));
  const cut = solidScriptMeshBooleanTree(solidScriptMeshBooleanPieces(cutter));
  solidScriptMeshBooleanInvert(kept);
  solidScriptMeshBooleanClipTo(kept, cut);
  solidScriptMeshBooleanClipTo(cut, kept);
  solidScriptMeshBooleanInvert(cut);
  solidScriptMeshBooleanClipTo(cut, kept);
  solidScriptMeshBooleanInvert(cut);
  solidScriptMeshBooleanAdd(kept, solidScriptMeshBooleanAll(cut));
  solidScriptMeshBooleanInvert(kept);
  const pieces = solidScriptMeshBooleanAll(kept);
  return pieces.length > 0 ? solidScriptMeshBooleanMesh(pieces, mesh, cutter) : null;
}

/**
 * Keeps only where two closed meshes overlap.
 *
 * @param mesh Mesh that is kept where it overlaps.
 * @param cutter Mesh it must overlap.
 * @returns The overlap, or null when they do not overlap.
 */
export function solidScriptMeshIntersect(
  mesh: SolidScriptShapeMesh,
  cutter: SolidScriptShapeMesh,
): SolidScriptShapeMesh | null {
  const kept = solidScriptMeshBooleanTree(solidScriptMeshBooleanPieces(mesh));
  const cut = solidScriptMeshBooleanTree(solidScriptMeshBooleanPieces(cutter));
  solidScriptMeshBooleanInvert(kept);
  solidScriptMeshBooleanClipTo(cut, kept);
  solidScriptMeshBooleanInvert(cut);
  solidScriptMeshBooleanClipTo(kept, cut);
  solidScriptMeshBooleanClipTo(cut, kept);
  solidScriptMeshBooleanAdd(kept, solidScriptMeshBooleanAll(cut));
  solidScriptMeshBooleanInvert(kept);
  const pieces = solidScriptMeshBooleanAll(kept);
  return pieces.length > 0 ? solidScriptMeshBooleanMesh(pieces, mesh, cutter) : null;
}
