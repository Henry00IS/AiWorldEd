import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import { HandlerSolidBrushHull, solidBrushHullSelection } from '@/tools/hull/handler_solid_brush_hull.js';
import { modifierVolumeTemplateCreate } from '@/modifier/stack/modifier_volume_templates.js';

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
    const volume = modifierVolumeTemplateCreate('bevel');
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

  it.each([false, true])('places the hull after the latest selection, including transformed groups (%s)', (nested) => {
    const model = new SolidModel('Hull placement');
    const parent = nested ? new THREE.Group() : model.root;
    if (nested) {
      markAsSolidCsgGroup(parent);
      parent.position.set(3, 2, -4);
      parent.rotation.y = Math.PI / 3;
      parent.scale.setScalar(2);
      model.root.add(parent);
    }
    const first = model.addBoxBrush(1, SolidOperation.Additive, parent, false);
    const last = model.addBoxBrush(1, SolidOperation.Additive, parent, false);
    const trailing = model.addBoxBrush(1, SolidOperation.Additive, parent, false);
    last.position.x = 2;
    last.pushTransformToMesh();
    const selected = [first.mesh, last.mesh].filter((mesh): mesh is THREE.Mesh => mesh !== null);
    const stack = new CommandStack(16);
    const created = runHull(selected, stack, first.mesh);
    expect(created).not.toBeNull();
    if (!created?.mesh || !first.mesh || !last.mesh || !trailing.mesh) return;
    expect(created.name).toMatch(/^Hull\.[0-9A-F]{3,5}$/);
    expect(created.mesh.parent).toBe(parent);
    const siblings = parent.children;
    expect(siblings.indexOf(created.mesh)).toBe(siblings.indexOf(first.mesh) + 1);
    expect(siblings.indexOf(created.mesh)).toBeLessThan(siblings.indexOf(last.mesh));
    const bounds = created.brush.computeLocalBounds();
    expect(bounds.min.x).toBeCloseTo(first.brush.computeLocalBounds().min.x);
    expect(bounds.max.x).toBeCloseTo(last.brush.computeLocalBounds().max.x + last.position.x);
    stack.undo();
    expect(created.mesh.parent).toBeNull();
    stack.redo();
    expect(created.mesh.parent).toBe(parent);
    expect(parent.children.indexOf(created.mesh)).toBe(parent.children.indexOf(first.mesh) + 1);
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
 * @param lastSelected Most recently selected object, when distinct from array
 *   order.
 * @returns Created brush, or null.
 */
function runHull(
  selected: readonly THREE.Object3D[],
  stack: CommandStack = new CommandStack(16),
  lastSelected?: THREE.Object3D | null,
): SolidBrushInstance | null {
  const handler = new HandlerSolidBrushHull({
    commandStack: stack,
    getSelectedObjects: () => selected,
    getLastSelectedObject: () => lastSelected ?? selected.at(-1) ?? null,
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
