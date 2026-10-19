import { Vector3 } from 'three';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import type { ModifierBevelDerivedBrush } from './modifier_bevel_derived.js';
import { modifierBevelNeighborFaces, modifierBevelSharedEdge } from './modifier_bevel_face_graph.js';
import { modifierBevelSmearSurface } from './modifier_bevel_surface_smear.js';
import { modifierBevelProfileStrip } from './modifier_bevel_uv_layout_profile.js';

/** Shared edge used to line a corner up with a strip. */
interface ModifierBevelCapEdge {
  /** First endpoint. */
  pointA: Vector3;
  /** Second endpoint. */
  pointB: Vector3;
}

/**
 * Builds a corner matrix that matches a strip along their shared edge.
 *
 * @param derived Derived brush.
 * @param faceIndex Corner cap.
 * @param donor Strip the corner copies.
 * @param donorUv Unplaced UV matrix of that strip.
 * @returns Cap matrix, or null when the cap does not meet the strip.
 */
export function modifierBevelStitchCap(
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  donor: number,
  donorUv: SurfaceUvMatrix,
): SurfaceUvMatrix | null {
  const edge = modifierBevelDonorEdge(derived, faceIndex, donor);
  const donorNormal = derived.localBrush.planes[donor]?.normal;
  const capNormal = derived.localBrush.planes[faceIndex]?.normal;
  if (!edge || !donorNormal || !capNormal) return null;
  return modifierBevelFoldedCap(donorUv, donorNormal, capNormal, edge);
}

/**
 * Folds the strip matrix across the shared edge onto the cap.
 *
 * @param donorUv Unplaced strip matrix.
 * @param donorNormal Outward normal of the strip.
 * @param capNormal Outward normal of the cap.
 * @param edge Shared edge.
 * @returns Cap matrix.
 */
function modifierBevelFoldedCap(
  donorUv: SurfaceUvMatrix,
  donorNormal: Vector3,
  capNormal: Vector3,
  edge: ModifierBevelCapEdge,
): SurfaceUvMatrix {
  return modifierBevelSmearSurface({ textureId: '', uv: donorUv }, donorNormal, {
    pointA: edge.pointA,
    pointB: edge.pointB,
    destNormal: capNormal,
  }).uv;
}

/**
 * Finds the longest edge between a corner island and its strip.
 *
 * @param derived Derived brush.
 * @param faceIndex Corner cap.
 * @param donor Strip face.
 * @returns Edge, or null when the island misses the strip.
 */
function modifierBevelDonorEdge(
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  donor: number,
): ModifierBevelCapEdge | null {
  let best: ModifierBevelCapEdge | null = null;
  let bestLength = 0;
  for (const face of modifierBevelCapIsland(derived, faceIndex)) {
    const chosen = modifierBevelLongerCapEdge(derived, face, donor, best, bestLength);
    best = chosen.edge;
    bestLength = chosen.length;
  }
  return best;
}

/**
 * Keeps the longer shared edge with the donor strip.
 *
 * @param derived Derived brush.
 * @param face Cap face.
 * @param donor Strip face.
 * @param best Longest edge so far.
 * @param bestLength Length of that edge.
 * @returns Updated edge.
 */
function modifierBevelLongerCapEdge(
  derived: ModifierBevelDerivedBrush,
  face: number,
  donor: number,
  best: ModifierBevelCapEdge | null,
  bestLength: number,
): { edge: ModifierBevelCapEdge | null; length: number } {
  const edge = modifierBevelSharedEdge(derived.localBrush, face, donor);
  if (!edge) return { edge: best, length: bestLength };
  const length = edge.pointA.distanceTo(edge.pointB);
  if (length <= bestLength) return { edge: best, length: bestLength };
  return { edge, length };
}

/**
 * Lists the corner caps that share the start cap's parent.
 *
 * @param derived Derived brush.
 * @param start Corner cap.
 * @returns Cap face indices.
 */
function modifierBevelCapIsland(derived: ModifierBevelDerivedBrush, start: number): number[] {
  const parent = derived.faces[start]?.parentSurfaceIndex ?? -1;
  const faces: number[] = [];
  const pending = [start];
  const seen = new Set<number>([start]);
  while (pending.length > 0) modifierBevelTakeCap(derived, parent, faces, pending, seen);
  return faces;
}

/**
 * Claims one queued cap and queues its neighboring caps.
 *
 * @param derived Derived brush.
 * @param parent Authored parent index.
 * @param faces Caps already claimed.
 * @param pending Caps still to visit.
 * @param seen Caps already queued.
 */
function modifierBevelTakeCap(
  derived: ModifierBevelDerivedBrush,
  parent: number,
  faces: number[],
  pending: number[],
  seen: Set<number>,
): void {
  const faceIndex = pending.shift();
  if (faceIndex === undefined) return;
  faces.push(faceIndex);
  modifierBevelQueueCaps(derived, parent, faceIndex, pending, seen);
}

/**
 * Queues neighboring caps of the same parent.
 *
 * @param derived Derived brush.
 * @param parent Authored parent index.
 * @param faceIndex Current cap.
 * @param pending Caps still to visit.
 * @param seen Caps already queued.
 */
function modifierBevelQueueCaps(
  derived: ModifierBevelDerivedBrush,
  parent: number,
  faceIndex: number,
  pending: number[],
  seen: Set<number>,
): void {
  for (const neighbor of modifierBevelNeighborFaces(derived.localBrush, faceIndex)) {
    modifierBevelQueueCap(derived, parent, neighbor, pending, seen);
  }
}

/**
 * Queues one cap when it belongs to the island.
 *
 * @param derived Derived brush.
 * @param parent Authored parent index.
 * @param neighbor Neighbor face.
 * @param pending Caps still to visit.
 * @param seen Caps already queued.
 */
function modifierBevelQueueCap(
  derived: ModifierBevelDerivedBrush,
  parent: number,
  neighbor: number,
  pending: number[],
  seen: Set<number>,
): void {
  if (seen.has(neighbor) || !modifierBevelIsCap(derived, neighbor, parent)) return;
  seen.add(neighbor);
  pending.push(neighbor);
}

/**
 * Returns whether a face is a corner cap of one parent.
 *
 * @param derived Derived brush.
 * @param faceIndex Face index.
 * @param parent Authored parent index.
 * @returns True when the face is a cap of that parent.
 */
function modifierBevelIsCap(derived: ModifierBevelDerivedBrush, faceIndex: number, parent: number): boolean {
  const record = derived.faces[faceIndex];
  if (!record?.cornerFace || record.parentSurfaceIndex !== parent) return false;
  return !modifierBevelProfileStrip(derived, faceIndex);
}
