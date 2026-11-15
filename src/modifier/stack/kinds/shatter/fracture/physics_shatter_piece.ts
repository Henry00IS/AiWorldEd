import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import type { PhysicsShatterFaceOrigin, PhysicsShatterPiece } from './physics_shatter_types.js';
import { physicsShatterBrushVolume, physicsShatterVertexCentroid } from './physics_shatter_geometry.js';

/** What a cell needs to become a piece. */
export interface PhysicsShatterPieceSource {
  /** Id of that brush. */
  sourceBrushId: string;
  /** Index of that brush in the inputs. */
  sourceIndex: number;
  /** Fracture seed. */
  seed: number;
  /** True for bricks mode. */
  isBrick: boolean;
}

/**
 * Turns a valid cell into a piece; slivers and broken cells are refused.
 *
 * @param cell Cell geometry.
 * @param origins Input face index of each cell face, or -1 for crack faces.
 * @param cellIndex Site or brick index.
 * @param source Input the cell came from.
 * @param minimumVolume Smallest volume kept.
 * @returns Piece with index -1, or null when the cell is refused.
 */
export function physicsShatterPieceCreate(
  cell: SolidBrush,
  origins: readonly number[],
  cellIndex: number,
  source: PhysicsShatterPieceSource,
  minimumVolume: number,
): PhysicsShatterPiece | null {
  const volume = physicsShatterBrushVolume(cell);
  if (!(volume >= minimumVolume) || !SolidBrushValidator.validateGenerated(cell).valid) return null;
  return {
    index: -1,
    key: `${source.sourceIndex}:${cellIndex}`,
    sourceBrushId: source.sourceBrushId,
    sourceIndex: source.sourceIndex,
    cellIndex,
    seed: source.seed,
    isBrick: source.isBrick,
    brush: cell,
    hull: physicsShatterHull(cell),
    centroid: physicsShatterVertexCentroid(cell),
    volume,
    faces: physicsShatterFaceOrigins(origins),
  };
}

/**
 * Flattens a brush's vertices into x, y, z triples.
 *
 * @param brush Brush.
 * @returns Hull vertex array.
 */
export function physicsShatterHull(brush: SolidBrush): Float32Array {
  const hull = new Float32Array(brush.vertices.length * 3);
  brush.vertices.forEach((vertex, index) => vertex.toArray(hull, index * 3));
  return hull;
}

/**
 * Describes where each piece face came from.
 *
 * @param origins Input face index of each piece face, or -1 for crack faces.
 * @returns Origin per piece face.
 */
export function physicsShatterFaceOrigins(origins: readonly number[]): PhysicsShatterFaceOrigin[] {
  return origins.map((sourceFaceIndex) =>
    sourceFaceIndex >= 0 ? { kind: 'original', sourceFaceIndex } : { kind: 'crack', sourceFaceIndex: -1 },
  );
}
