import type * as THREE from 'three';
import type { SolidAlgorithmSurfaceInfo } from './solid_algorithm_surface_info.js';

/** Bounded intersection loop on a subject face from pair intersection loops. */
export interface SolidAlgorithmSurfaceLoop {
  /** Prepared index of the brush that owns the base face. */
  subjectBrushIndex: number;
  /** Prepared index of the peer brush. */
  peerBrushIndex: number;
  /** Face index / base plane index on the subject brush. */
  basePlaneIndex: number;
  /** Interior category from pair alignment. */
  interiorCategory: number;
  /**
   * Ordered loop vertices in model space (closed ring, first vertex not
   * repeated).
   */
  loopVertices: THREE.Vector3[];
}

/**
 * Builds a surface loop record.
 *
 * @param subjectBrushIndex Subject prepared index.
 * @param peerBrushIndex Peer prepared index.
 * @param surfaceInfo Surface metadata for the base plane.
 * @param loopVertices Ordered loop vertices.
 * @returns Surface loop.
 */
export function solidAlgorithmSurfaceLoopCreate(
  subjectBrushIndex: number,
  peerBrushIndex: number,
  surfaceInfo: SolidAlgorithmSurfaceInfo,
  loopVertices: THREE.Vector3[],
): SolidAlgorithmSurfaceLoop {
  return {
    subjectBrushIndex,
    peerBrushIndex,
    basePlaneIndex: surfaceInfo.basePlaneIndex,
    interiorCategory: surfaceInfo.interiorCategory,
    loopVertices,
  };
}

/**
 * Returns whether two surface loops describe exactly the same loop: the same
 * object, or equal indices, category, and bit-identical vertices in the same
 * order. A peer that moved without changing its cross-section on a face yields
 * such an equal loop.
 *
 * @param first First loop.
 * @param second Second loop.
 * @returns True when both loops are interchangeable.
 */
export function solidAlgorithmSurfaceLoopEquals(
  first: SolidAlgorithmSurfaceLoop,
  second: SolidAlgorithmSurfaceLoop,
): boolean {
  if (first === second) {
    return true;
  }
  if (
    first.subjectBrushIndex !== second.subjectBrushIndex ||
    first.peerBrushIndex !== second.peerBrushIndex ||
    first.basePlaneIndex !== second.basePlaneIndex ||
    first.interiorCategory !== second.interiorCategory ||
    first.loopVertices.length !== second.loopVertices.length
  ) {
    return false;
  }
  return first.loopVertices.every((vertex, index) => {
    const other = second.loopVertices[index];
    return other !== undefined && vertex.x === other.x && vertex.y === other.y && vertex.z === other.z;
  });
}
