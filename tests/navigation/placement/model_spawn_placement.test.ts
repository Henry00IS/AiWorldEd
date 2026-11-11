import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { modelSpawnPlace } from '@/navigation/placement/model_spawn_placement.js';
import { ObjImporter } from '@/io/obj/obj_importer.js';
import { readPersistentMeshDocument } from '@/mesh/document/mesh_document_binding.js';

/**
 * Builds a box mesh.
 *
 * @param size Edge lengths.
 * @param at Position.
 * @returns Mesh.
 */
function box(size: [number, number, number], at: [number, number, number]): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size));
  mesh.position.set(...at);
  return mesh;
}

/**
 * Lists every mesh vertex in world space relative to a point, rounded.
 *
 * @param object Root.
 * @param origin Reference point.
 * @returns Rounded vertex coordinates.
 */
function worldVertices(object: THREE.Object3D, origin: THREE.Vector3): number[] {
  object.updateMatrixWorld(true);
  const values: number[] = [];
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const positions = child.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let index = 0; index < positions.count; index += 1) {
      const point = new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(child.matrixWorld);
      values.push(
        ...point
          .sub(origin)
          .toArray()
          .map((value) => Math.round(value * 1e4) / 1e4),
      );
    }
  });
  return values;
}

/**
 * Returns the world bounds of objects.
 *
 * @param objects Objects.
 * @returns Bounds.
 */
function boundsOf(objects: readonly THREE.Object3D[]): THREE.Box3 {
  const bounds = new THREE.Box3();
  objects.forEach((object) => {
    object.updateMatrixWorld(true);
    bounds.expandByObject(object);
  });
  return bounds;
}

/**
 * Expects each coordinate to be a whole number of grid steps.
 *
 * @param point Point.
 * @param interval Grid step.
 */
function expectOnGrid(point: THREE.Vector3, interval: number): void {
  point
    .toArray()
    .forEach((value) => expect(Math.abs(value / interval - Math.round(value / interval))).toBeLessThan(1e-6));
}

describe('modelSpawnPlace', () => {
  it('sizes the spawn by the bounds and keeps the parts apart', () => {
    const parts = [box([2, 2, 2], [10, 0, 0]), box([2, 4, 2], [14, 1, 0])];
    const spawn = vi.fn(() => new THREE.Vector3(1, 2, 8));
    expect(modelSpawnPlace(parts, new THREE.Group(), spawn, 1)).toBe(true);
    // Bounds 9..15 x -1..3 x -1..1: 6 wide, so the radius is 3.
    expect(spawn).toHaveBeenCalledWith(3);
    expect(parts[1]!.position.x - parts[0]!.position.x).toBe(4);
  });

  it('puts a group pivot at its bounds centre and snaps the min corner to the grid', () => {
    const group = new THREE.Group();
    group.position.set(3, 0, 0);
    group.add(box([1.3, 2, 0.7], [0, 0, 0]), box([1, 1.1, 1], [2, 0, 0]));
    const before = boundsOf([group]);
    const shape = worldVertices(group, before.min);
    const parent = new THREE.Group();
    parent.position.set(0, 0, 5);
    expect(modelSpawnPlace([group], parent, () => new THREE.Vector3(1.3, 2.2, 8), 0.5)).toBe(true);
    const after = boundsOf([group]);
    // World bounds are the parent-local bounds moved by the parent.
    const worldMin = after.min.clone().add(parent.position);
    expectOnGrid(worldMin, 0.5);
    expect(
      worldMin.distanceTo(new THREE.Vector3(1.3, 2.2, 8).sub(after.getSize(new THREE.Vector3()).multiplyScalar(0.5))),
    ).toBeLessThan(0.5);
    expect(group.position.distanceTo(after.getCenter(new THREE.Vector3()))).toBeLessThan(1e-9);
    expect(worldVertices(group, after.min)).toEqual(shape);
  });

  it('puts an editable mesh pivot at its bounds centre by moving its geometry, document and edges', () => {
    const result = new ObjImporter().importFromText(
      'o A\nv 10 0 0\nv 12.3 0 0\nv 12.3 2 0.7\nv 10 2 0.7\nf 1 2 3 4\n',
      'a.obj',
    );
    const mesh = result.meshes[0]!;
    const before = boundsOf([mesh]);
    const shape = worldVertices(mesh, before.min);
    expect(modelSpawnPlace([mesh], new THREE.Group(), () => new THREE.Vector3(0, 0, 0), 1)).toBe(true);
    const after = boundsOf([mesh]);
    expectOnGrid(after.min, 1);
    expect(after.min.toArray()).toEqual([-1, -1, 0]);
    expect(mesh.position.toArray()).toEqual(after.getCenter(new THREE.Vector3()).toArray());
    expect(worldVertices(mesh, after.min)).toEqual(shape);
    mesh.geometry.computeBoundingBox();
    expect(mesh.geometry.boundingBox!.getCenter(new THREE.Vector3()).length()).toBeLessThan(1e-6);
    const document = readPersistentMeshDocument(mesh)!;
    const positions = document.getTopology().getPositions();
    const documentBounds = new THREE.Box3().setFromArray(positions);
    expect(documentBounds.getCenter(new THREE.Vector3()).length()).toBeLessThan(1e-6);
    const edges = mesh.children.find((child) => child.userData['isDecorativeEdge'] === true) as THREE.LineSegments;
    edges.geometry.computeBoundingBox();
    expect(edges.position.toArray()).toEqual([0, 0, 0]);
    expect(edges.geometry.boundingBox!.getCenter(new THREE.Vector3()).length()).toBeLessThan(1e-6);
  });

  it('keeps the original placement without a view or without geometry', () => {
    const part = box([1, 1, 1], [3, 0, 0]);
    expect(modelSpawnPlace([part], new THREE.Group(), () => null, 1)).toBe(false);
    expect(part.position.toArray()).toEqual([3, 0, 0]);
    expect(modelSpawnPlace([new THREE.Group()], new THREE.Group(), () => new THREE.Vector3(), 1)).toBe(false);
  });
});
