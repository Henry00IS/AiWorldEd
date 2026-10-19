import { Matrix3, Matrix4, Vector3, Vector4 } from 'three';
import { SolidPlane } from '@/solid/brush/solid_plane.js';
import type { FaceSurfaceDescription } from '@/texture/uv_matrix/face_surface_description.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';

/** One authored face that can lend its texture to a hull face. */
export interface SolidBrushHullSourceFace {
  /** Outward plane in the same space as the hull loops. */
  plane: SolidPlane;
  /** Center of the authored face in that space. */
  centroid: Vector3;
  /** Texture and UV in the source brush. */
  surface: FaceSurfaceDescription;
  /** Maps a hull-local point into the source brush. */
  hullToSource: Matrix4;
}

/**
 * Copies the closest authored surface onto one hull face.
 *
 * @param loop Hull face in hull-local space.
 * @param sources Authored faces.
 * @returns Surface for the hull face.
 */
export function solidBrushHullMatchSurface(
  loop: readonly Vector3[],
  sources: readonly SolidBrushHullSourceFace[],
): FaceSurfaceDescription | null {
  const source = solidBrushHullBestSource(loop, sources);
  if (!source) return null;
  return solidBrushHullBakeSurface(source.surface, source.hullToSource);
}

/**
 * Returns the authored face that best matches a hull face.
 *
 * @param loop Hull face.
 * @param sources Authored faces.
 * @returns Winning source, or null when no source faces the same way.
 */
function solidBrushHullBestSource(
  loop: readonly Vector3[],
  sources: readonly SolidBrushHullSourceFace[],
): SolidBrushHullSourceFace | null {
  let best: SolidBrushHullSourceFace | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const source of sources) {
    const score = solidBrushHullSourceScore(loop, source);
    if (score <= bestScore) continue;
    best = source;
    bestScore = score;
  }
  return best;
}

/**
 * Scores how well an authored face explains a hull face.
 *
 * @param loop Hull face.
 * @param source Authored face.
 * @returns Higher scores are closer matches.
 */
function solidBrushHullSourceScore(loop: readonly Vector3[], source: SolidBrushHullSourceFace): number {
  const plane = SolidPlane.fromPolygon(loop.map((point) => point.clone()));
  const align = plane.normal.dot(source.plane.normal);
  if (align <= 0) return Number.NEGATIVE_INFINITY;
  const gap = solidBrushHullLoopGap(loop, source.plane);
  const center = solidBrushHullCentroid(loop);
  const near = center.distanceTo(source.centroid);
  const coincidence = gap <= 1e-3 ? 10 : 0;
  return coincidence + align - gap - near * 0.001;
}

/**
 * Returns the largest distance from a loop to a plane.
 *
 * @param loop Face vertices.
 * @param plane Authored plane.
 * @returns Distance.
 */
function solidBrushHullLoopGap(loop: readonly Vector3[], plane: SolidPlane): number {
  let gap = 0;
  for (const point of loop) gap = Math.max(gap, Math.abs(plane.signedDistance(point)));
  return gap;
}

/**
 * Returns the average of a loop.
 *
 * @param loop Face vertices.
 * @returns Centroid.
 */
function solidBrushHullCentroid(loop: readonly Vector3[]): Vector3 {
  const center = new Vector3();
  for (const point of loop) center.add(point);
  return center.multiplyScalar(1 / Math.max(loop.length, 1));
}

/**
 * Rewrites a source UV so it projects hull-local points the same way.
 *
 * @param surface Source surface.
 * @param hullToSource Maps hull-local points into the source brush.
 * @returns Surface for the hull face.
 */
export function solidBrushHullBakeSurface(
  surface: FaceSurfaceDescription,
  hullToSource: Matrix4,
): FaceSurfaceDescription {
  return {
    textureId: surface.textureId,
    uv: solidBrushHullBakeUv(surface.uv, hullToSource),
  };
}

/**
 * Transforms one UV matrix by the map into the source brush.
 *
 * @param uv Source UV matrix.
 * @param hullToSource Maps hull-local points into the source brush.
 * @returns Hull-local UV matrix.
 */
function solidBrushHullBakeUv(uv: SurfaceUvMatrix, hullToSource: Matrix4): SurfaceUvMatrix {
  const linear = new Matrix3().setFromMatrix4(hullToSource).transpose();
  const translation = new Vector3().setFromMatrixPosition(hullToSource);
  return new SurfaceUvMatrix(
    solidBrushHullBakeRow(uv.u, linear, translation),
    solidBrushHullBakeRow(uv.v, linear, translation),
  );
}

/**
 * Transforms one UV row into hull-local space.
 *
 * @param row Source row.
 * @param linear Transposed linear part of the hull-to-source map.
 * @param translation Translation of the hull-to-source map.
 * @returns Hull-local row.
 */
function solidBrushHullBakeRow(row: Vector4, linear: Matrix3, translation: Vector3): Vector4 {
  const axis = new Vector3(row.x, row.y, row.z).applyMatrix3(linear);
  const offset = axisDot(row, translation) + row.w;
  return new Vector4(axis.x, axis.y, axis.z, offset);
}

/**
 * Returns the dot product of a UV row's axis with a translation.
 *
 * @param row UV row.
 * @param translation Translation.
 * @returns Dot product.
 */
function axisDot(row: Vector4, translation: Vector3): number {
  return row.x * translation.x + row.y * translation.y + row.z * translation.z;
}
