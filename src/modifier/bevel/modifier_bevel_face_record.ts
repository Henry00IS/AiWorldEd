import type { Vector3 } from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { modifierBevelSharedEdge } from './modifier_bevel_face_graph.js';

/** How one derived face picks up an authored surface. */
export interface ModifierBevelFaceRecord {
  /** Authored face index the texture and selection follow. */
  parentSurfaceIndex: number;
  /** Derived face whose surface is smeared across the shared edge, or -1. */
  smearFromDerivedIndex: number;
  /** Set when this face is a generated chamfer strip. */
  chamferEdge: {
    pointA: Vector3;
    pointB: Vector3;
    destNormal: Vector3;
  } | null;
  /** True when this face is a corner cap rather than a profile strip. */
  cornerFace: boolean;
}

/**
 * Returns whether a derived face takes the volume texture.
 *
 * @param record Face record, when one exists.
 * @returns True for a chamfer strip or a corner cap.
 */
export function modifierBevelRecordUsesVolumeTexture(record: ModifierBevelFaceRecord | undefined): boolean {
  if (!record) return false;
  return record.cornerFace || record.chamferEdge !== null;
}

/**
 * Returns the shared edge a smear step folds across.
 *
 * @param brush Derived brush.
 * @param face Face being smeared onto.
 * @param source Face the texture is folded from.
 * @param fallback Edge kept when the faces do not meet.
 * @returns Edge to fold across.
 */
export function modifierBevelSmearEdge(
  brush: SolidBrush,
  face: number,
  source: number,
  fallback: ModifierBevelFaceRecord['chamferEdge'],
): ModifierBevelFaceRecord['chamferEdge'] {
  const edge = source >= 0 ? modifierBevelSharedEdge(brush, face, source) : null;
  const normal = brush.planes[face]?.normal;
  if (!edge || !normal) return fallback;
  return { pointA: edge.pointA, pointB: edge.pointB, destNormal: normal.clone() };
}
