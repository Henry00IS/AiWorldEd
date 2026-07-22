import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CsgBooleanOps, CsgOperation } from '../../src/csg/csg_boolean_ops.js';
import { CsgMeshBuilder } from '../../src/csg/csg_mesh_builder.js';
import { TerrainGenerator } from '../../src/terrain/terrain_generator.js';

describe('CsgMeshBuilder', () => {
  it('should extract polygons from a box mesh', () => {
    const builder = new CsgMeshBuilder();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.updateMatrixWorld(true);
    const polygons = builder.meshToPolygons(mesh);
    expect(polygons.length).toBeGreaterThan(0);
  });

  it('should rebuild a mesh from polygons', () => {
    const builder = new CsgMeshBuilder();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.updateMatrixWorld(true);
    const polygons = builder.meshToPolygons(mesh);
    const rebuilt = builder.polygonsToMesh(polygons, 0xff0000, 'Rebuilt');
    expect(rebuilt).toBeInstanceOf(THREE.Mesh);
    expect(rebuilt.name).toBe('Rebuilt');
    expect(rebuilt.geometry.getAttribute('position').count).toBeGreaterThan(0);
  });
});

describe('CsgBooleanOps', () => {
  let ops: CsgBooleanOps;

  beforeEach(() => {
    ops = new CsgBooleanOps();
  });

  it('should produce geometry for box union', () => {
    const a = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    b.position.set(1, 0, 0);
    const result = ops.operate(a, b, CsgOperation.UNION, 'UnionResult');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('UnionResult');
    expect(result!.geometry.getAttribute('position').count).toBeGreaterThan(0);
  });

  it('should produce geometry for box subtract', () => {
    const a = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    b.position.set(0.75, 0, 0);
    const result = ops.operate(a, b, CsgOperation.SUBTRACT, 'SubtractResult');
    expect(result).not.toBeNull();
    expect(result!.geometry.getAttribute('position').count).toBeGreaterThan(0);
  });

  it('should produce geometry for box intersect', () => {
    const a = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    b.position.set(0.5, 0, 0);
    const result = ops.operate(a, b, CsgOperation.INTERSECT, 'IntersectResult');
    expect(result).not.toBeNull();
    expect(result!.geometry.getAttribute('position').count).toBeGreaterThan(0);
  });
});

describe('TerrainGenerator', () => {
  it('should create a named terrain mesh with height variation', () => {
    const generator = new TerrainGenerator();
    const terrain = generator.createTerrain(10, 10, 8, 2, 42);
    expect(terrain).toBeInstanceOf(THREE.Mesh);
    expect(terrain.name.startsWith('Terrain_')).toBe(true);
    const positions = terrain.geometry.getAttribute('position');
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    expect(maxY).toBeGreaterThan(minY);
  });

  it('should be deterministic for the same seed', () => {
    const generator = new TerrainGenerator();
    const a = generator.createTerrain(8, 8, 4, 1.5, 7);
    const b = generator.createTerrain(8, 8, 4, 1.5, 7);
    const posA = a.geometry.getAttribute('position');
    const posB = b.geometry.getAttribute('position');
    expect(posA.getY(0)).toBeCloseTo(posB.getY(0));
    expect(posA.getY(5)).toBeCloseTo(posB.getY(5));
  });
});
