import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  OrientedBoundsBuilder,
  getBoundsFaceLocalNormal,
  getBoundsFaceHalfExtent,
  getAllBoundsFaces
} from '../../src/transform/oriented_bounds.js';
import { BoundsFace } from '../../src/types/bounds_face.js';

describe('OrientedBoundsBuilder', () => {
  it('should return null for an empty selection', () => {
    const builder = new OrientedBoundsBuilder();
    expect(builder.buildFromMeshes([])).toBeNull();
  });

  it('should build object-aligned bounds for a single scaled cube', () => {
    const mesh = createBoxMesh(1, 1, 1);
    mesh.scale.set(2, 1, 1);
    mesh.position.set(0, 0.5, 0);
    mesh.updateMatrixWorld(true);
    const builder = new OrientedBoundsBuilder();
    const bounds = builder.buildFromMeshes([mesh]);
    expect(bounds).not.toBeNull();
    expect(bounds!.halfExtents.x).toBeCloseTo(1, 5);
    expect(bounds!.halfExtents.y).toBeCloseTo(0.5, 5);
    expect(bounds!.halfExtents.z).toBeCloseTo(0.5, 5);
    expect(bounds!.center.y).toBeCloseTo(0.5, 5);
  });

  it('should follow mesh rotation for a single object', () => {
    const mesh = createBoxMesh(2, 1, 1);
    mesh.rotation.y = Math.PI / 2;
    mesh.updateMatrixWorld(true);
    const builder = new OrientedBoundsBuilder();
    const bounds = builder.buildFromMeshes([mesh]);
    expect(bounds).not.toBeNull();
    const normal = builder.getFaceNormal(bounds!, BoundsFace.POS_X);
    expect(Math.abs(normal.z)).toBeCloseTo(1, 5);
  });

  it('should build world AABB for multiple meshes', () => {
    const a = createBoxMesh(1, 1, 1);
    a.position.set(-2, 0, 0);
    const b = createBoxMesh(1, 1, 1);
    b.position.set(2, 0, 0);
    a.updateMatrixWorld(true);
    b.updateMatrixWorld(true);
    const builder = new OrientedBoundsBuilder();
    const bounds = builder.buildFromMeshes([a, b]);
    expect(bounds).not.toBeNull();
    expect(bounds!.quaternion.x).toBeCloseTo(0, 5);
    expect(bounds!.quaternion.y).toBeCloseTo(0, 5);
    expect(bounds!.quaternion.z).toBeCloseTo(0, 5);
    expect(bounds!.halfExtents.x).toBeGreaterThan(2);
  });

  it('should place face centers outside the bounds center', () => {
    const mesh = createBoxMesh(2, 2, 2);
    mesh.updateMatrixWorld(true);
    const builder = new OrientedBoundsBuilder();
    const bounds = builder.buildFromMeshes([mesh])!;
    const center = builder.getFaceCenter(bounds, BoundsFace.POS_Y);
    expect(center.y).toBeGreaterThan(bounds.center.y);
  });

  it('should ignore meshes with missing geometry instead of throwing', () => {
    const broken = new THREE.Mesh();
    (broken as { geometry: THREE.BufferGeometry | undefined }).geometry = undefined;
    const builder = new OrientedBoundsBuilder();
    expect(() => builder.buildFromMeshes([broken])).not.toThrow();
    expect(builder.buildFromMeshes([broken])).toBeNull();
  });

  it('should still build bounds when some selected meshes lack geometry', () => {
    const valid = createBoxMesh(1, 1, 1);
    valid.position.set(0, 0.5, 0);
    valid.updateMatrixWorld(true);
    const broken = new THREE.Mesh();
    (broken as { geometry: THREE.BufferGeometry | undefined }).geometry = undefined;
    const builder = new OrientedBoundsBuilder();
    const bounds = builder.buildFromMeshes([broken, valid]);
    expect(bounds).not.toBeNull();
    expect(bounds!.center.y).toBeCloseTo(0.5, 5);
  });
});

describe('bounds face helpers', () => {
  it('should expose six faces', () => {
    expect(getAllBoundsFaces()).toHaveLength(6);
  });

  it('should return unit local normals', () => {
    expect(getBoundsFaceLocalNormal(BoundsFace.POS_X).x).toBe(1);
    expect(getBoundsFaceLocalNormal(BoundsFace.NEG_Z).z).toBe(-1);
  });

  it('should read half extent per face axis', () => {
    const half = new THREE.Vector3(3, 2, 1);
    expect(getBoundsFaceHalfExtent(half, BoundsFace.POS_X)).toBe(3);
    expect(getBoundsFaceHalfExtent(half, BoundsFace.NEG_Y)).toBe(2);
    expect(getBoundsFaceHalfExtent(half, BoundsFace.POS_Z)).toBe(1);
  });
});

/**
 * Creates a box mesh at the origin with the given dimensions.
 * @param width Box width.
 * @param height Box height.
 * @param depth Box depth.
 * @returns A mesh with updated world matrix.
 */
function createBoxMesh(width: number, height: number, depth: number): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshBasicMaterial()
  );
}
