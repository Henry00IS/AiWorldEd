import type { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import {
  MODIFIER_VOLUME_BEVEL_UV_PIVOT_CENTER,
  MODIFIER_VOLUME_BEVEL_UV_PIVOT_TILE,
} from '@/modifier/volume/modifier_volume_bevel_keys.js';
import type { ModifierBevelUvPivotPoint } from '@/modifier/volume/modifier_volume_bevel_uv_placement.js';
import type { ModifierBevelDerivedBrush } from './modifier_bevel_derived.js';
import { modifierBevelNeighborFaces } from './modifier_bevel_face_graph.js';
import { modifierBevelCornerDonor } from './modifier_bevel_uv_layout_corner.js';
import { modifierBevelProfileChain, modifierBevelProfileStrip } from './modifier_bevel_uv_layout_profile.js';

/** UV bounds of the faces a pivot is measured on. */
interface ModifierBevelUvBounds {
  /** Smallest U. */
  minU: number;
  /** Smallest V. */
  minV: number;
  /** Largest U. */
  maxU: number;
  /** Largest V. */
  maxV: number;
}

/**
 * Returns the UV point a volume rotation keeps fixed.
 *
 * @param derived Derived brush.
 * @param faceIndex Generated face index.
 * @param matrix Unplaced UV matrix.
 * @returns Pivot in UV space.
 */
export function modifierBevelPlacementPivot(
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  matrix: SurfaceUvMatrix,
): ModifierBevelUvPivotPoint {
  if (derived.placement.uvPivot === MODIFIER_VOLUME_BEVEL_UV_PIVOT_TILE) return { u: 0.5, v: 0.5 };
  if (derived.placement.uvPivot === MODIFIER_VOLUME_BEVEL_UV_PIVOT_CENTER) {
    return modifierBevelUvBoundsCenter(derived, faceIndex, matrix);
  }
  return { u: 0, v: 0 };
}

/**
 * Returns the center of the UV bounds for the curve or corner.
 *
 * @param derived Derived brush.
 * @param faceIndex Generated face index.
 * @param matrix Unplaced UV matrix.
 * @returns Center, or the origin when the face has no vertices.
 */
function modifierBevelUvBoundsCenter(
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  matrix: SurfaceUvMatrix,
): ModifierBevelUvPivotPoint {
  const bounds = modifierBevelEmptyBounds();
  for (const face of modifierBevelPivotFaces(derived, faceIndex))
    modifierBevelIncludeFace(derived, face, matrix, bounds);
  if (!Number.isFinite(bounds.minU)) return { u: 0, v: 0 };
  return { u: (bounds.minU + bounds.maxU) * 0.5, v: (bounds.minV + bounds.maxV) * 0.5 };
}

/**
 * Returns an empty bounds record.
 *
 * @returns Bounds that reject every sample until one is included.
 */
function modifierBevelEmptyBounds(): ModifierBevelUvBounds {
  return {
    minU: Number.POSITIVE_INFINITY,
    minV: Number.POSITIVE_INFINITY,
    maxU: Number.NEGATIVE_INFINITY,
    maxV: Number.NEGATIVE_INFINITY,
  };
}

/**
 * Lists the faces whose vertices define the pivot.
 *
 * @param derived Derived brush.
 * @param faceIndex Generated face index.
 * @returns Face indices.
 */
function modifierBevelPivotFaces(derived: ModifierBevelDerivedBrush, faceIndex: number): number[] {
  if (modifierBevelProfileStrip(derived, faceIndex)) return modifierBevelProfileChain(derived, faceIndex);
  const donor = modifierBevelCornerDonor(derived, faceIndex);
  if (donor >= 0 && modifierBevelProfileStrip(derived, donor)) return modifierBevelProfileChain(derived, donor);
  if (derived.faces[faceIndex]?.cornerFace) return modifierBevelPivotCaps(derived, faceIndex);
  return [faceIndex];
}

/**
 * Lists corner caps that share the start cap's parent.
 *
 * @param derived Derived brush.
 * @param start Corner cap.
 * @returns Cap face indices.
 */
function modifierBevelPivotCaps(derived: ModifierBevelDerivedBrush, start: number): number[] {
  const parent = derived.faces[start]?.parentSurfaceIndex ?? -1;
  const faces: number[] = [];
  const pending = [start];
  const seen = new Set<number>([start]);
  while (pending.length > 0) modifierBevelTakePivotCap(derived, parent, faces, pending, seen);
  return faces;
}

/**
 * Claims one queued cap and queues its neighbors.
 *
 * @param derived Derived brush.
 * @param parent Authored parent index.
 * @param faces Caps already claimed.
 * @param pending Caps still to visit.
 * @param seen Caps already queued.
 */
function modifierBevelTakePivotCap(
  derived: ModifierBevelDerivedBrush,
  parent: number,
  faces: number[],
  pending: number[],
  seen: Set<number>,
): void {
  const faceIndex = pending.shift();
  if (faceIndex === undefined) return;
  faces.push(faceIndex);
  modifierBevelQueuePivotCaps(derived, parent, faceIndex, pending, seen);
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
function modifierBevelQueuePivotCaps(
  derived: ModifierBevelDerivedBrush,
  parent: number,
  faceIndex: number,
  pending: number[],
  seen: Set<number>,
): void {
  for (const neighbor of modifierBevelNeighborFaces(derived.localBrush, faceIndex)) {
    modifierBevelQueuePivotCap(derived, parent, neighbor, pending, seen);
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
function modifierBevelQueuePivotCap(
  derived: ModifierBevelDerivedBrush,
  parent: number,
  neighbor: number,
  pending: number[],
  seen: Set<number>,
): void {
  if (seen.has(neighbor) || !modifierBevelPivotCap(derived, neighbor, parent)) return;
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
function modifierBevelPivotCap(derived: ModifierBevelDerivedBrush, faceIndex: number, parent: number): boolean {
  const record = derived.faces[faceIndex];
  if (!record?.cornerFace || record.parentSurfaceIndex !== parent) return false;
  return !modifierBevelProfileStrip(derived, faceIndex);
}

/**
 * Grows the bounds by one face's vertices.
 *
 * @param derived Derived brush.
 * @param faceIndex Face index.
 * @param matrix Unplaced UV matrix.
 * @param bounds Bounds to update.
 */
function modifierBevelIncludeFace(
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  matrix: SurfaceUvMatrix,
  bounds: ModifierBevelUvBounds,
): void {
  const face = derived.localBrush.faces[faceIndex];
  const points = face ? derived.localBrush.getFaceVertices(face) : [];
  for (const point of points) modifierBevelIncludeUv(matrix.project(point), bounds);
}

/**
 * Grows the bounds by one UV sample.
 *
 * @param sample Projected UV.
 * @param bounds Bounds to update.
 */
function modifierBevelIncludeUv(sample: { u: number; v: number }, bounds: ModifierBevelUvBounds): void {
  bounds.minU = Math.min(bounds.minU, sample.u);
  bounds.minV = Math.min(bounds.minV, sample.v);
  bounds.maxU = Math.max(bounds.maxU, sample.u);
  bounds.maxV = Math.max(bounds.maxV, sample.v);
}
