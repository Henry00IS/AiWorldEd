import { Matrix3, Matrix4, Vector3 } from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidPlane } from '@/solid/brush/solid_plane.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { solidHullBrushFromPoints } from '@/solid/algorithm/surface/solid_hull_brush.js';
import type { FaceSurfaceDescription } from '@/texture/uv_matrix/face_surface_description.js';
import { createDefaultFaceSurface } from '@/texture/uv_matrix/face_surface_description.js';
import { solidBrushHullMatchSurface, type SolidBrushHullSourceFace } from '@/tools/hull/solid_brush_hull_surface.js';

/** Convex brush plus one surface per face. */
export interface SolidBrushHullBuild {
  /** Hull in model-local space. */
  brush: SolidBrush;
  /** Texture and UV for each hull face. */
  surfaces: FaceSurfaceDescription[];
}

/**
 * Builds a convex brush around authored brushes, ignoring bevel volumes.
 *
 * @param brushes Brushes to enclose.
 * @param modelRoot Solid root whose local space receives the hull.
 * @returns Hull, or null when the brushes are flat.
 */
export function solidBrushHullBuild(
  brushes: readonly SolidBrushInstance[],
  modelRoot: { matrixWorld: Matrix4; updateWorldMatrix: (updateParents: boolean, updateChildren: boolean) => void },
): SolidBrushHullBuild | null {
  modelRoot.updateWorldMatrix(true, false);
  const worldPoints = solidBrushHullWorldPoints(brushes);
  const sources = solidBrushHullSources(brushes, modelRoot.matrixWorld);
  return solidBrushHullFromWorld(worldPoints, sources, modelRoot.matrixWorld);
}

/**
 * Builds the hull in model-local space and copies surfaces.
 *
 * @param worldPoints World points to enclose.
 * @param sources Authored faces in model-local space.
 * @param modelWorld Model root world matrix.
 * @returns Hull, or null when the points are flat.
 */
function solidBrushHullFromWorld(
  worldPoints: readonly Vector3[],
  sources: readonly SolidBrushHullSourceFace[],
  modelWorld: Matrix4,
): SolidBrushHullBuild | null {
  const localPoints = worldPoints.map((point) => point.clone().applyMatrix4(solidBrushHullInverse(modelWorld)));
  const brush = solidHullBrushFromPoints(localPoints);
  if (!brush) return null;
  const loops = solidBrushHullFaceLoops(brush);
  return { brush, surfaces: loops.map((loop) => solidBrushHullSurfaceForLoop(loop, sources)) };
}

/**
 * Returns the inverse of a world matrix.
 *
 * @param matrix World matrix.
 * @returns Inverse.
 */
function solidBrushHullInverse(matrix: Matrix4): Matrix4 {
  return matrix.clone().invert();
}

/**
 * Lists world positions of authored brush vertices.
 *
 * @param brushes Brushes to enclose.
 * @returns World points.
 */
function solidBrushHullWorldPoints(brushes: readonly SolidBrushInstance[]): Vector3[] {
  const points: Vector3[] = [];
  for (const brush of brushes) solidBrushHullPushWorldPoints(points, brush);
  return points;
}

/**
 * Appends one brush's vertices in world space.
 *
 * @param points Point accumulator.
 * @param brush Brush instance.
 */
function solidBrushHullPushWorldPoints(points: Vector3[], brush: SolidBrushInstance): void {
  const mesh = brush.mesh;
  if (!mesh) return;
  mesh.updateWorldMatrix(true, false);
  for (const vertex of brush.brush.vertices) points.push(vertex.clone().applyMatrix4(mesh.matrixWorld));
}

/**
 * Lists authored faces in model-local space.
 *
 * @param brushes Brushes to enclose.
 * @param modelWorld Model root world matrix.
 * @returns Source faces.
 */
function solidBrushHullSources(
  brushes: readonly SolidBrushInstance[],
  modelWorld: Matrix4,
): SolidBrushHullSourceFace[] {
  const sources: SolidBrushHullSourceFace[] = [];
  for (const brush of brushes) solidBrushHullPushSources(sources, brush, modelWorld);
  return sources;
}

/**
 * Appends every face of one brush.
 *
 * @param sources Source accumulator.
 * @param brush Brush instance.
 * @param modelWorld Model root world matrix.
 */
function solidBrushHullPushSources(
  sources: SolidBrushHullSourceFace[],
  brush: SolidBrushInstance,
  modelWorld: Matrix4,
): void {
  const mesh = brush.mesh;
  if (!mesh) return;
  mesh.updateWorldMatrix(true, false);
  for (let index = 0; index < brush.brush.faces.length; index += 1) {
    solidBrushHullPushSource(sources, brush, mesh.matrixWorld, modelWorld, index);
  }
}

/**
 * Appends one authored face.
 *
 * @param sources Source accumulator.
 * @param brush Brush instance.
 * @param meshWorld Brush world matrix.
 * @param modelWorld Model root world matrix.
 * @param index Face index.
 */
function solidBrushHullPushSource(
  sources: SolidBrushHullSourceFace[],
  brush: SolidBrushInstance,
  meshWorld: Matrix4,
  modelWorld: Matrix4,
  index: number,
): void {
  const local = brush.brush.planes[index];
  if (!local) return;
  const toModel = solidBrushHullInverse(modelWorld).multiply(meshWorld);
  sources.push({
    plane: solidBrushHullPlaneToModel(local, toModel),
    centroid: solidBrushHullFaceCentroid(brush, index).applyMatrix4(toModel),
    surface: brush.getFaceSurface(index),
    hullToSource: solidBrushHullInverse(meshWorld).multiply(modelWorld),
  });
}

/**
 * Transforms a brush plane into model-local space.
 *
 * @param plane Brush-local plane.
 * @param toModel Maps brush-local points into the model.
 * @returns Model-local plane.
 */
function solidBrushHullPlaneToModel(plane: SolidPlane, toModel: Matrix4): SolidPlane {
  const normal = plane.normal.clone().applyMatrix3(new Matrix3().getNormalMatrix(toModel)).normalize();
  const point = plane.normal.clone().multiplyScalar(-plane.offset).applyMatrix4(toModel);
  return new SolidPlane(normal, -normal.dot(point));
}

/**
 * Returns the center of one brush face.
 *
 * @param brush Brush instance.
 * @param index Face index.
 * @returns Brush-local centroid.
 */
function solidBrushHullFaceCentroid(brush: SolidBrushInstance, index: number): Vector3 {
  const face = brush.brush.faces[index];
  const loop = face ? brush.brush.getFaceVertices(face) : [];
  const center = new Vector3();
  for (const point of loop) center.add(point);
  return center.multiplyScalar(1 / Math.max(loop.length, 1));
}

/**
 * Lists the vertex loops of a built brush.
 *
 * @param brush Hull brush.
 * @returns Face loops.
 */
function solidBrushHullFaceLoops(brush: SolidBrush): Vector3[][] {
  return brush.faces.map((face) => brush.getFaceVertices(face));
}

/**
 * Returns the matched surface, or a default when no source faces the face.
 *
 * @param loop Hull face.
 * @param sources Authored faces.
 * @returns Surface.
 */
function solidBrushHullSurfaceForLoop(
  loop: readonly Vector3[],
  sources: readonly SolidBrushHullSourceFace[],
): FaceSurfaceDescription {
  return solidBrushHullMatchSurface(loop, sources) ?? createDefaultFaceSurface();
}
