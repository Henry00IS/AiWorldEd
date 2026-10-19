import type { ModifierBevelDerivedBrush } from './modifier_bevel_derived.js';
import { modifierBevelNeighborFaces, modifierBevelSharedEdgeLength } from './modifier_bevel_face_graph.js';
import { modifierBevelProfileStrip } from './modifier_bevel_uv_layout_profile.js';

/**
 * Finds the bevel strip that should place a corner cap's texture.
 *
 * @param derived Derived brush.
 * @param faceIndex Corner cap.
 * @returns Strip face, or -1 when the cap meets no strip.
 */
export function modifierBevelCornerDonor(derived: ModifierBevelDerivedBrush, faceIndex: number): number {
  const island = modifierBevelCornerIsland(derived, faceIndex);
  return modifierBevelLongestStripTouch(derived, island);
}

/**
 * Lists the corner caps connected to the start that share its parent.
 *
 * @param derived Derived brush.
 * @param start Corner cap.
 * @returns Cap face indices.
 */
function modifierBevelCornerIsland(derived: ModifierBevelDerivedBrush, start: number): number[] {
  const parent = derived.faces[start]?.parentSurfaceIndex ?? -1;
  const faces: number[] = [];
  const pending = [start];
  const seen = new Set<number>([start]);
  while (pending.length > 0) modifierBevelTakeCornerCap(derived, parent, faces, pending, seen);
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
function modifierBevelTakeCornerCap(
  derived: ModifierBevelDerivedBrush,
  parent: number,
  faces: number[],
  pending: number[],
  seen: Set<number>,
): void {
  const faceIndex = pending.shift();
  if (faceIndex === undefined) return;
  faces.push(faceIndex);
  modifierBevelQueueCornerCaps(derived, parent, faceIndex, pending, seen);
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
function modifierBevelQueueCornerCaps(
  derived: ModifierBevelDerivedBrush,
  parent: number,
  faceIndex: number,
  pending: number[],
  seen: Set<number>,
): void {
  for (const neighbor of modifierBevelNeighborFaces(derived.localBrush, faceIndex)) {
    modifierBevelQueueCornerCap(derived, parent, neighbor, pending, seen);
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
function modifierBevelQueueCornerCap(
  derived: ModifierBevelDerivedBrush,
  parent: number,
  neighbor: number,
  pending: number[],
  seen: Set<number>,
): void {
  if (seen.has(neighbor) || !modifierBevelCornerCap(derived, neighbor, parent)) return;
  seen.add(neighbor);
  pending.push(neighbor);
}

/**
 * Returns whether a face is a corner cap of one parent.
 *
 * @param derived Derived brush.
 * @param faceIndex Face index.
 * @param parent Authored parent index.
 * @returns True when the face is a cap and not a bevel strip.
 */
function modifierBevelCornerCap(derived: ModifierBevelDerivedBrush, faceIndex: number, parent: number): boolean {
  const record = derived.faces[faceIndex];
  if (!record?.cornerFace || record.parentSurfaceIndex !== parent) return false;
  return !modifierBevelProfileStrip(derived, faceIndex);
}

/**
 * Picks the strip that shares the longest edge with an island.
 *
 * @param derived Derived brush.
 * @param island Corner caps.
 * @returns Strip face, or -1 when none touch the island.
 */
function modifierBevelLongestStripTouch(derived: ModifierBevelDerivedBrush, island: readonly number[]): number {
  const group = new Set(island);
  let best = -1;
  let bestLength = 0;
  for (const face of island) {
    const chosen = modifierBevelBestStripTouch(derived, face, group, best, bestLength);
    best = chosen.face;
    bestLength = chosen.length;
  }
  return best;
}

/**
 * Keeps the longer strip touch of one cap.
 *
 * @param derived Derived brush.
 * @param faceIndex Cap face.
 * @param group Caps in the island.
 * @param best Best strip so far.
 * @param bestLength Length of that touch.
 * @returns Updated strip.
 */
function modifierBevelBestStripTouch(
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  group: ReadonlySet<number>,
  best: number,
  bestLength: number,
): { face: number; length: number } {
  let chosenFace = best;
  let chosenLength = bestLength;
  for (const neighbor of modifierBevelNeighborFaces(derived.localBrush, faceIndex)) {
    const length = modifierBevelStripTouchLength(derived, faceIndex, neighbor, group);
    if (!modifierBevelTouchWins(length, neighbor, chosenLength, chosenFace)) continue;
    chosenFace = neighbor;
    chosenLength = length;
  }
  return { face: chosenFace, length: chosenLength };
}

/**
 * Returns whether a strip touch replaces the current donor.
 *
 * @param length Shared edge length.
 * @param face Strip face.
 * @param chosenLength Length of the current donor.
 * @param chosenFace Current donor, or -1.
 * @returns True when this strip should win.
 */
function modifierBevelTouchWins(length: number, face: number, chosenLength: number, chosenFace: number): boolean {
  if (length <= 0 || length < chosenLength) return false;
  if (length > chosenLength) return true;
  return chosenFace < 0 || face < chosenFace;
}

/**
 * Returns the shared length when a neighbor is a bevel strip.
 *
 * @param derived Derived brush.
 * @param faceIndex Cap face.
 * @param neighbor Neighbor face.
 * @param group Caps in the island.
 * @returns Edge length, or 0 when the neighbor is not a strip.
 */
function modifierBevelStripTouchLength(
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  neighbor: number,
  group: ReadonlySet<number>,
): number {
  const record = derived.faces[neighbor];
  const parent = derived.faces[faceIndex]?.parentSurfaceIndex;
  if (!record || record.cornerFace || group.has(neighbor) || !modifierBevelProfileStrip(derived, neighbor)) return 0;
  if (record.parentSurfaceIndex !== parent) return 0;
  return modifierBevelSharedEdgeLength(derived.localBrush, faceIndex, neighbor);
}
