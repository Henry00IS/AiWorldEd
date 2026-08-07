import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  SOLID_SQR_VERTEX_EQUAL_EPSILON,
  SOLID_VERTEX_EQUAL_EPSILON,
  SOLID_VERTEX_HASH_CELL_SIZE,
} from '@/solid/algorithm/math/solid_math_constants.js';
import { HashedVertexTable } from '@/solid/algorithm/spatial/hashed_vertex_table.js';

/** HashedVertexTable welds with sub-millimeter vertex epsilon. */
describe('HashedVertexTable', () => {
  it('uses sub-millimeter cell size and weld epsilon defaults', () => {
    expect(SOLID_VERTEX_EQUAL_EPSILON).toBeCloseTo(0.0005, 10);
    expect(SOLID_VERTEX_HASH_CELL_SIZE).toBeCloseTo(0.00125, 10);
    expect(SOLID_SQR_VERTEX_EQUAL_EPSILON).toBeCloseTo(0.0005 * 0.0005, 12);
  });

  it('welds points within the equal epsilon to one index', () => {
    const table = new HashedVertexTable();
    const first = table.add(new THREE.Vector3(1, 2, 3));
    const offset = SOLID_VERTEX_EQUAL_EPSILON * 0.5;
    const second = table.add(new THREE.Vector3(1 + offset, 2, 3));
    expect(second).toBe(first);
    expect(table.count).toBe(1);
  });

  it('keeps points beyond the equal epsilon as separate vertices', () => {
    const table = new HashedVertexTable();
    const first = table.add(new THREE.Vector3(0, 0, 0));
    const second = table.add(new THREE.Vector3(SOLID_VERTEX_EQUAL_EPSILON * 2, 0, 0));
    expect(second).not.toBe(first);
    expect(table.count).toBe(2);
  });

  it('snap returns the canonical welded coordinates', () => {
    const table = new HashedVertexTable();
    const canonical = table.snap(new THREE.Vector3(10, 0, 0));
    const offset = SOLID_VERTEX_EQUAL_EPSILON * 0.25;
    const snapped = table.snap(new THREE.Vector3(10 + offset, 0, 0));
    expect(snapped.distanceTo(canonical)).toBe(0);
    expect(table.count).toBe(1);
  });

  it('clear removes all welded vertices', () => {
    const table = new HashedVertexTable();
    table.add(new THREE.Vector3(1, 0, 0));
    table.clear();
    expect(table.count).toBe(0);
    table.add(new THREE.Vector3(1, 0, 0));
    expect(table.count).toBe(1);
  });

  it('welds across negative-space cell boundaries using toward-zero cell indices', () => {
    const table = new HashedVertexTable();
    const cellSize = SOLID_VERTEX_HASH_CELL_SIZE;
    const first = table.add(new THREE.Vector3(-cellSize * 0.1, 0, 0));
    const second = table.add(new THREE.Vector3(-cellSize * 0.1 + SOLID_VERTEX_EQUAL_EPSILON * 0.25, 0, 0));
    expect(second).toBe(first);
    expect(table.count).toBe(1);
  });
});
