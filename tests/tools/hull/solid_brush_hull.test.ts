import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import { HandlerSolidBrushHull, solidBrushHullSelection } from '@/tools/hull/handler_solid_brush_hull.js';

describe('solid brush convex hull', () => {
  it('copies the closest brush surface and ignores bevel volumes', () => {
    const model = new SolidModel('HullModel');
    const lower = model.addBoxBrush(1, SolidOperation.Additive, model.root, false);
    const upper = model.addBoxBrush(1, SolidOperation.Additive, model.root, false);
    upper.position.set(0, 2, 0);
    upper.pushTransformToMesh();
    const cap = faceAlong(upper, new THREE.Vector3(0, 1, 0));
    upper.setFaceSurface(cap, {
      textureId: 'cap-texture',
      uv: new SurfaceUvMatrix(new THREE.Vector4(2, 0, 0, 0.25), new THREE.Vector4(0, 0, 3, -0.5)),
    });
    const floor = faceAlong(lower, new THREE.Vector3(0, -1, 0));
    lower.setFaceTextureId(floor, 'floor-texture');
    model.root.updateWorldMatrix(true, true);
    const volume = ModifierVolumeBevel.create();
    volume.scale.set(8, 8, 8);
    volume.position.set(0, 1, 0);
    volume.updateMatrixWorld(true);
    const selected = [lower.mesh, upper.mesh, volume].filter((mesh): mesh is THREE.Mesh => mesh !== null);
    expect(solidBrushHullSelection(selected)).toHaveLength(2);
    const created = runHull(selected);
    expect(created).not.toBeNull();
    if (!created) return;
    const top = highestFace(created, new THREE.Vector3(0, 1, 0));
    expect(created.getSurfaceTextureId(top)).toBe('cap-texture');
    expect(uvMatchesSource(created, top, upper, cap)).toBe(true);
    const bottom = highestFace(created, new THREE.Vector3(0, -1, 0));
    expect(created.getSurfaceTextureId(bottom)).toBe('floor-texture');
    expect(brushStaysInsideSourceBounds(created, [lower, upper])).toBe(true);
  });

  it('undoes the hull brush', () => {
    const model = new SolidModel('HullUndo');
    const first = model.addBoxBrush(1, SolidOperation.Additive, model.root, false);
    const second = model.addBoxBrush(1, SolidOperation.Additive, model.root, false);
    second.position.set(2, 0, 0);
    second.pushTransformToMesh();
    model.root.updateWorldMatrix(true, true);
    const stack = new CommandStack(16);
    const before = model.getBrushes().length;
    const selected = [first.mesh, second.mesh].filter((mesh): mesh is THREE.Mesh => mesh !== null);
    runHull(selected, stack);
    expect(model.getBrushes().length).toBe(before + 1);
    stack.undo();
    expect(model.getBrushes().length).toBe(before);
    stack.redo();
    expect(model.getBrushes().length).toBe(before + 1);
  });
});

/**
 * Runs the object-mode hull action.
 *
 * @param selected Selected objects.
 * @param stack Undo stack.
 * @returns Created brush, or null.
 */
function runHull(
  selected: readonly THREE.Object3D[],
  stack: CommandStack = new CommandStack(16),
): SolidBrushInstance | null {
  const handler = new HandlerSolidBrushHull({
    commandStack: stack,
    getSelectedObjects: () => selected,
    showStatusMessage: (_message: string) => undefined,
  });
  return handler.run();
}

/**
 * Returns the face whose normal best matches an axis.
 *
 * @param brush Brush.
 * @param axis Unit axis.
 * @returns Face index.
 */
function faceAlong(brush: SolidBrushInstance, axis: THREE.Vector3): number {
  let best = 0;
  let score = Number.NEGATIVE_INFINITY;
  brush.brush.planes.forEach((plane, index) => {
    const dot = plane.normal.dot(axis);
    if (dot <= score) return;
    score = dot;
    best = index;
  });
  return best;
}

/**
 * Returns the face farthest along an axis.
 *
 * @param brush Hull brush.
 * @param axis Unit axis.
 * @returns Face index.
 */
function highestFace(brush: SolidBrushInstance, axis: THREE.Vector3): number {
  let best = 0;
  let score = Number.NEGATIVE_INFINITY;
  brush.brush.faces.forEach((face, index) => {
    const center = centroid(brush.brush.getFaceVertices(face));
    const dot = center.dot(axis);
    if (dot <= score) return;
    score = dot;
    best = index;
  });
  return best;
}

/**
 * Returns whether a hull vertex keeps the source face UV.
 *
 * @param hull Hull brush.
 * @param hullFace Hull face index.
 * @param source Source brush.
 * @param sourceFace Source face index.
 * @returns True when the projections match.
 */
function uvMatchesSource(
  hull: SolidBrushInstance,
  hullFace: number,
  source: SolidBrushInstance,
  sourceFace: number,
): boolean {
  const face = hull.brush.faces[hullFace];
  const point = face ? hull.brush.getFaceVertices(face)[0] : undefined;
  if (!point || !source.mesh) return false;
  const sourcePoint = point.clone().applyMatrix4(source.mesh.matrixWorld.clone().invert());
  const copied = hull.getFaceSurface(hullFace).uv.project(point);
  const original = source.getFaceSurface(sourceFace).uv.project(sourcePoint);
  return Math.abs(copied.u - original.u) <= 1e-4 && Math.abs(copied.v - original.v) <= 1e-4;
}

/**
 * Returns whether hull vertices stay inside the source bounds.
 *
 * @param hull Hull brush.
 * @param sources Source brushes.
 * @returns True when the hull does not pass the source bounds.
 */
function brushStaysInsideSourceBounds(hull: SolidBrushInstance, sources: readonly SolidBrushInstance[]): boolean {
  const bounds = new THREE.Box3();
  for (const source of sources) expandBounds(bounds, source);
  bounds.expandByScalar(1e-3);
  return hull.brush.vertices.every((vertex) => bounds.containsPoint(vertex));
}

/**
 * Grows bounds by one brush's world vertices, expressed in model space.
 *
 * @param bounds Bounds accumulator.
 * @param source Source brush.
 */
function expandBounds(bounds: THREE.Box3, source: SolidBrushInstance): void {
  if (!source.mesh) return;
  for (const vertex of source.brush.vertices) {
    bounds.expandByPoint(vertex.clone().applyMatrix4(source.mesh.matrixWorld));
  }
}

/**
 * Returns the average of a loop.
 *
 * @param loop Face vertices.
 * @returns Centroid.
 */
function centroid(loop: readonly THREE.Vector3[]): THREE.Vector3 {
  const center = new THREE.Vector3();
  for (const point of loop) center.add(point);
  return center.multiplyScalar(1 / Math.max(loop.length, 1));
}
