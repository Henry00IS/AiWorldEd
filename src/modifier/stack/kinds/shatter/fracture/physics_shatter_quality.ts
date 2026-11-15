import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { physicsShatterBrushVolume } from './physics_shatter_geometry.js';
import type { PhysicsShatterSettings } from './physics_shatter_types.js';

/** Settings the piece size depends on. */
export type PhysicsShatterPieceSizeSettings = Pick<
  PhysicsShatterSettings,
  'mode' | 'crackSize' | 'brickLength' | 'brickHeight'
>;

/** Thinnest piece any pattern may make, in metres. */
export const PHYSICS_SHATTER_MIN_THICKNESS = 0.02;

/** Thinnest piece as a share of the pattern's typical piece size. */
export const PHYSICS_SHATTER_MIN_THICKNESS_SHARE = 0.1;

/** Shortest piece edge, in metres. */
export const PHYSICS_SHATTER_MIN_EDGE = 0.005;

/** Largest distance a piece vertex may sit outside one of its face planes. */
export const PHYSICS_SHATTER_MAX_BULGE = 2e-6;

/** Smallest piece face area, in square metres. */
export const PHYSICS_SHATTER_MIN_FACE_AREA = 2.5e-5;

/** Measured shape of one convex piece. */
export interface PhysicsShatterPieceShape {
  /** Smallest extent of the piece along any of its face normals. */
  thickness: number;
  /** Shortest edge. */
  minEdge: number;
  /** Smallest face area. */
  minFaceArea: number;
  /** Enclosed volume. */
  volume: number;
  /** Largest distance a vertex sits outside a face plane; 0 for a clean hull. */
  bulge: number;
}

/** Bounds a piece must meet. */
export interface PhysicsShatterPieceBounds {
  /** Thinnest allowed extent along a face normal. */
  thickness: number;
  /** Shortest allowed edge. */
  edge: number;
  /** Smallest allowed face area. */
  faceArea: number;
}

/**
 * Returns the thinnest piece a pattern of a given piece size may make: 2 cm or
 * a tenth of the size, whichever is larger.
 *
 * @param pieceSize Typical piece size in metres (crack size, or the smaller
 *   brick side).
 * @returns Minimum thickness in metres.
 */
export function physicsShatterMinThicknessForSize(pieceSize: number): number {
  const size = Number.isFinite(pieceSize) ? Math.max(0, pieceSize) : 0;
  return Math.max(PHYSICS_SHATTER_MIN_THICKNESS, PHYSICS_SHATTER_MIN_THICKNESS_SHARE * size);
}

/**
 * Returns the pattern's typical piece size: the crack size, or the smaller
 * brick side in bricks mode.
 *
 * @param settings Fracture settings.
 * @returns Size in metres.
 */
export function physicsShatterPieceSize(settings: PhysicsShatterPieceSizeSettings): number {
  return settings.mode === 'bricks' ? Math.min(settings.brickLength, settings.brickHeight) : settings.crackSize;
}

/**
 * Returns the thinnest piece the fracture makes for some settings: 2 cm or a
 * tenth of the crack size (the smaller brick side for bricks), whichever is
 * larger. Pieces of an input that is itself thinner keep the input's thickness.
 * The simulation's thin-piece warning uses the same number.
 *
 * @param settings Fracture settings.
 * @returns Minimum thickness in metres.
 */
export function physicsShatterMinPieceThickness(settings: PhysicsShatterPieceSizeSettings): number {
  return physicsShatterMinThicknessForSize(physicsShatterPieceSize(settings));
}

/**
 * Returns the bounds for pieces of one input. A piece cannot be cleaner than
 * the input it is cut from: an input thinner than the minimum thickness, or
 * with its own short edges or small faces, lowers the bounds to just below its
 * own shape.
 *
 * @param pieceSize Typical piece size of the pattern.
 * @param input Measured input brush.
 * @returns Bounds.
 */
export function physicsShatterPieceBoundsFor(
  pieceSize: number,
  input: PhysicsShatterPieceShape,
): PhysicsShatterPieceBounds {
  const thickness = Math.min(physicsShatterMinThicknessForSize(pieceSize), 0.98 * input.thickness);
  const edge = Math.min(PHYSICS_SHATTER_MIN_EDGE, 0.5 * thickness, 0.98 * input.minEdge);
  const faceArea = Math.min(PHYSICS_SHATTER_MIN_FACE_AREA, edge * edge, 0.98 * input.minFaceArea);
  return { thickness, edge, faceArea };
}

/**
 * Measures a convex piece.
 *
 * @param brush Convex brush.
 * @returns Thickness, shortest edge, smallest face area and volume.
 */
export function physicsShatterPieceShape(brush: SolidBrush): PhysicsShatterPieceShape {
  let thickness = Infinity;
  let bulge = 0;
  for (const plane of brush.planes) {
    let deepest = 0;
    for (const vertex of brush.vertices) {
      const distance = plane.signedDistance(vertex);
      deepest = Math.max(deepest, -distance);
      bulge = Math.max(bulge, distance);
    }
    thickness = Math.min(thickness, deepest);
  }
  let minEdge = Infinity;
  let minFaceArea = Infinity;
  const [cross, area] = [new THREE.Vector3(), new THREE.Vector3()];
  for (const face of brush.faces) {
    const ring = brush.getFaceVertices(face);
    area.set(0, 0, 0);
    ring.forEach((vertex, index) => {
      const next = ring[(index + 1) % ring.length] ?? vertex;
      minEdge = Math.min(minEdge, vertex.distanceTo(next));
      area.add(cross.crossVectors(vertex, next));
    });
    minFaceArea = Math.min(minFaceArea, area.length() * 0.5);
  }
  return { thickness, minEdge, minFaceArea, volume: physicsShatterBrushVolume(brush), bulge };
}

/**
 * Returns whether a piece meets the bounds.
 *
 * @param shape Measured piece.
 * @param bounds Bounds.
 * @returns True when the piece is sound.
 */
export function physicsShatterPieceShapeSound(
  shape: PhysicsShatterPieceShape,
  bounds: PhysicsShatterPieceBounds,
): boolean {
  if (shape.bulge > PHYSICS_SHATTER_MAX_BULGE) return false;
  return shape.thickness >= bounds.thickness && shape.minEdge >= bounds.edge && shape.minFaceArea >= bounds.faceArea;
}
