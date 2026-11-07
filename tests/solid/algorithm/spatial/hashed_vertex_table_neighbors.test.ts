import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  SOLID_SQR_VERTEX_EQUAL_EPSILON,
  SOLID_VERTEX_EQUAL_EPSILON,
  SOLID_VERTEX_HASH_CELL_SIZE,
} from '@/solid/algorithm/math/solid_math_constants.js';
import { HashedVertexTable } from '@/solid/algorithm/spatial/hashed_vertex_table.js';

/**
 * Welds points by scanning every stored vertex: the closest one inside the
 * equal epsilon, or a new vertex.
 *
 * @param stored Stored vertices (grows in place).
 * @param point Point to weld.
 * @returns Welded index.
 */
function referenceAdd(stored: THREE.Vector3[], point: THREE.Vector3): number {
  let closestIndex = -1;
  let closestDistance = SOLID_SQR_VERTEX_EQUAL_EPSILON;
  stored.forEach((vertex, index) => {
    const distance = vertex.distanceToSquared(point);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });
  if (closestIndex >= 0) return closestIndex;
  stored.push(point.clone());
  return stored.length - 1;
}

/**
 * Returns a deterministic pseudo-random generator.
 *
 * @param seed Seed.
 * @returns Generator of values in [0, 1).
 */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

/**
 * Returns a coordinate close to a cell boundary, so the weld ball often reaches
 * into the neighbor cells.
 *
 * @param next Random generator.
 * @param base Coordinate the boundary is picked around.
 * @returns Coordinate.
 */
function nearBoundary(next: () => number, base: number): number {
  const cell = Math.round(base / SOLID_VERTEX_HASH_CELL_SIZE) + Math.floor(next() * 6) - 3;
  return cell * SOLID_VERTEX_HASH_CELL_SIZE + (next() - 0.5) * SOLID_VERTEX_EQUAL_EPSILON * 3;
}

describe('HashedVertexTable neighbor cells', () => {
  it.for([0, -7.3, 190.25, -1234.5])('welds like a full scan around %s', (base) => {
    const next = random(Math.abs(base * 1000) + 1);
    const table = new HashedVertexTable();
    const stored: THREE.Vector3[] = [];
    for (let i = 0; i < 4000; i++) {
      const point = new THREE.Vector3(nearBoundary(next, base), nearBoundary(next, -base), nearBoundary(next, base));
      expect(table.add(point)).toBe(referenceAdd(stored, point));
    }
    expect(table.count).toBe(stored.length);
  });

  it('welds a point whose epsilon ball reaches a diagonal neighbor cell', () => {
    const table = new HashedVertexTable();
    const edge = SOLID_VERTEX_HASH_CELL_SIZE * 3;
    const step = SOLID_VERTEX_EQUAL_EPSILON * 0.25;
    const first = table.add(new THREE.Vector3(edge - step, edge - step, edge - step));
    expect(table.add(new THREE.Vector3(edge + step, edge + step, edge + step))).toBe(first);
  });
});
