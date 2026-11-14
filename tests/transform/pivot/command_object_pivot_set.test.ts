import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CommandObjectPivotSet } from '@/transform/pivot/command_object_pivot_set.js';
import { objectPivotPoint, ObjectPivotPlacement } from '@/transform/pivot/object_pivot_point.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';

const POINT = new THREE.Vector3(2, 1, 0.5);

/**
 * Moving an object's origin keeps its geometry where it is in the world, for
 * meshes, brushes (with their face UVs) and groups, and is undoable.
 */
describe('setting an object pivot', () => {
  it('moves a mesh origin without moving its geometry', () => {
    const world = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 3), new THREE.MeshBasicMaterial());
    mesh.position.set(1, 0, -1);
    mesh.rotation.set(0.3, 0.7, 0);
    mesh.scale.set(2, 1, 1);
    world.add(mesh);
    const before = meshWorldVertices(mesh);
    const command = new CommandObjectPivotSet([{ object: mesh, point: POINT }]);
    command.execute();
    expect(worldOrigin(mesh).distanceTo(POINT)).toBeLessThan(1e-6);
    expectSameVertices(meshWorldVertices(mesh), before);
    command.undo();
    expect(mesh.position.toArray()).toEqual([1, 0, -1]);
    expectSameVertices(meshWorldVertices(mesh), before);
  });

  it('moves a brush origin without moving its faces or their textures', () => {
    const { model, brush } = brushBuild(null);
    const before = brushWorldVertices(model, brush);
    const probe = brushWorldVertices(model, brush)[0]!;
    const uvBefore = brushUvAt(model, brush, probe);
    const command = new CommandObjectPivotSet([{ object: brush.mesh!, point: POINT }]);
    command.execute();
    expect(worldOrigin(brush.mesh!).distanceTo(POINT)).toBeLessThan(1e-6);
    expectSameVertices(brushWorldVertices(model, brush), before);
    expectSameVertices(brushUvAt(model, brush, probe), uvBefore);
    command.undo();
    expectSameVertices(brushWorldVertices(model, brush), before);
    expect(worldOrigin(brush.mesh!).distanceTo(POINT)).toBeGreaterThan(0.1);
  });

  it('moves a group origin without moving what is inside it', () => {
    const group = new THREE.Group();
    markAsSolidCsgGroup(group, SolidOperation.Intersecting);
    group.position.set(-1, 0.5, 0);
    group.rotation.y = 0.4;
    const { model, brush } = brushBuild(group);
    const before = brushWorldVertices(model, brush);
    const command = new CommandObjectPivotSet([{ object: group, point: POINT }]);
    command.execute();
    expect(worldOrigin(group).distanceTo(POINT)).toBeLessThan(1e-6);
    expectSameVertices(brushWorldVertices(model, brush), before);
    command.undo();
    expect(group.position.toArray()).toEqual([-1, 0.5, 0]);
    expectSameVertices(brushWorldVertices(model, brush), before);
  });

  it('places the pivot at the bounds center or the bottom center', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
    mesh.geometry.translate(3, 1, 0);
    mesh.updateMatrixWorld(true);
    expect(objectPivotPoint(mesh, ObjectPivotPlacement.BOUNDS_CENTER).toArray()).toEqual([3, 1, 0]);
    expect(objectPivotPoint(mesh, ObjectPivotPlacement.BOUNDS_BOTTOM).toArray()).toEqual([3, 0, 0]);
    expect(objectPivotPoint(mesh, ObjectPivotPlacement.WORLD_ORIGIN).toArray()).toEqual([0, 0, 0]);
  });
});

/**
 * Builds a solid model with a turned, offset brush, optionally inside a group.
 *
 * @param group Group to hold the brush, or null for the model root.
 * @returns Model and brush.
 */
function brushBuild(group: THREE.Group | null): { model: SolidModel; brush: SolidBrushInstance } {
  const model = new SolidModel('Pivot');
  if (group !== null) model.root.add(group);
  const brush = model.addBoxBrush(2, SolidOperation.Additive, group);
  brush.mesh!.position.set(0.5, 0.25, 1);
  brush.mesh!.rotation.set(0, 0.6, 0.2);
  brush.pullTransformFromMesh();
  model.root.updateMatrixWorld(true);
  return { model, brush };
}

/**
 * Returns an object's origin in world space.
 *
 * @param object Object.
 * @returns World origin.
 */
function worldOrigin(object: THREE.Object3D): THREE.Vector3 {
  object.updateWorldMatrix(true, false);
  return new THREE.Vector3().setFromMatrixPosition(object.matrixWorld);
}

/**
 * Lists a mesh's vertices in world space.
 *
 * @param mesh Mesh.
 * @returns World vertices.
 */
function meshWorldVertices(mesh: THREE.Mesh): THREE.Vector3[] {
  mesh.updateWorldMatrix(true, false);
  const position = mesh.geometry.getAttribute('position');
  return Array.from({ length: position.count }, (_, index) =>
    new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld),
  );
}

/**
 * Lists a brush's vertices in world space.
 *
 * @param model Solid model.
 * @param brush Brush.
 * @returns World vertices.
 */
function brushWorldVertices(model: SolidModel, brush: SolidBrushInstance): THREE.Vector3[] {
  model.root.updateMatrixWorld(true);
  const matrix = model.root.matrixWorld.clone().multiply(brush.getModelSpaceMatrix());
  return brush.brush.vertices.map((vertex) => vertex.clone().applyMatrix4(matrix));
}

/**
 * Projects a world point with the first face's UV mapping.
 *
 * @param model Solid model.
 * @param brush Brush.
 * @param world World point.
 * @returns UV as a vector (z unused).
 */
function brushUvAt(model: SolidModel, brush: SolidBrushInstance, world: THREE.Vector3): THREE.Vector3[] {
  model.root.updateMatrixWorld(true);
  const matrix = model.root.matrixWorld.clone().multiply(brush.getModelSpaceMatrix()).invert();
  const local = world.clone().applyMatrix4(matrix);
  return [0, 1, 2].map((face) => {
    const uv = brush.getFaceSurface(face).uv.project(local);
    return new THREE.Vector3(uv.u, uv.v, 0);
  });
}

/**
 * Expects two vertex lists to match.
 *
 * @param actual Actual vertices.
 * @param expected Expected vertices.
 */
function expectSameVertices(actual: THREE.Vector3[], expected: THREE.Vector3[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((vertex, index) => expect(vertex.distanceTo(expected[index]!)).toBeLessThan(1e-5));
}
