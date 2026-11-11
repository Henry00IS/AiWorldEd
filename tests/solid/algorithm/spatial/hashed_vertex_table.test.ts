import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  SOLID_SQR_VERTEX_EQUAL_EPSILON,
  SOLID_VERTEX_EQUAL_EPSILON,
  SOLID_VERTEX_HASH_CELL_SIZE,
} from '@/solid/algorithm/math/solid_math_constants.js';
import { HashedVertexTable } from '@/solid/algorithm/spatial/hashed_vertex_table.js';

/**
 * Welds points by brute force with the table's documented rule: the closest
 * stored vertex strictly within the equal epsilon, ties going to the lower weld
 * cell and then the earlier insert.
 *
 * @param points Points to add in order.
 * @returns Index each point resolved to.
 */
function bruteForceWeld(points: readonly THREE.Vector3[]): number[] {
  const stored: THREE.Vector3[] = [];
  const cell = (point: THREE.Vector3) =>
    [point.x, point.y, point.z].map((value) => Math.trunc(value / SOLID_VERTEX_HASH_CELL_SIZE));
  const before = (a: number, b: number) => {
    const ca = cell(stored[a] as THREE.Vector3);
    const cb = cell(stored[b] as THREE.Vector3);
    for (let axis = 0; axis < 3; axis++) {
      if (ca[axis] !== cb[axis]) return (ca[axis] as number) < (cb[axis] as number);
    }
    return a < b;
  };
  return points.map((point) => {
    let best = -1;
    let bestDistance = SOLID_SQR_VERTEX_EQUAL_EPSILON;
    stored.forEach((candidate, index) => {
      const distance = candidate.distanceToSquared(point);
      if (distance < bestDistance || (distance === bestDistance && best >= 0 && before(index, best))) {
        best = index;
        bestDistance = distance;
      }
    });
    if (best >= 0) return best;
    stored.push(point.clone());
    return stored.length - 1;
  });
}

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

/** Replay helpers: query log, unwelded append and vertex slices. */
describe('HashedVertexTable replay helpers', () => {
  it('logs the stored vertex each add resolves to', () => {
    const table = new HashedVertexTable();
    const log: THREE.Vector3[] = [];
    table.setQueryLog(log);
    table.add(new THREE.Vector3(1, 0, 0));
    table.add(new THREE.Vector3(1 + SOLID_VERTEX_EQUAL_EPSILON * 0.2, 0, 0));
    table.setQueryLog(null);
    table.add(new THREE.Vector3(5, 0, 0));
    expect(log.length).toBe(2);
    expect(log[0]).toBe(log[1]);
    expect(log[0]?.x).toBe(1);
  });

  it('appends unwelded vertices in order and slices them back', () => {
    const table = new HashedVertexTable();
    table.add(new THREE.Vector3(0, 0, 0));
    table.appendUnwelded([new THREE.Vector3(2, 0, 0), new THREE.Vector3(3, 0, 0)]);
    expect(table.count).toBe(3);
    expect(table.verticesFrom(1).map((vertex) => vertex.x)).toEqual([2, 3]);
    expect(table.add(new THREE.Vector3(3 + SOLID_VERTEX_EQUAL_EPSILON * 0.2, 0, 0))).toBe(2);
  });

  it('welds correctly for many points spread over distant cells', () => {
    const table = new HashedVertexTable();
    const points: THREE.Vector3[] = [];
    for (let index = 0; index < 500; index++)
      points.push(new THREE.Vector3(index * 37.1 - 9000, (index % 13) * -0.7, index * 0.003));
    const indices = points.map((point) => table.add(point));
    const again = points.map((point) => table.add(point.clone().addScalar(SOLID_VERTEX_EQUAL_EPSILON * 0.1)));
    expect(again).toEqual(indices);
    expect(table.count).toBe(points.length);
  });

  it('resolves equally close candidates to the lower weld cell, then the earlier insert', () => {
    const offset = 2 ** -12;
    const query = new THREE.Vector3(1, 1, 1);
    const lower = new THREE.Vector3(1 - offset, 1, 1);
    const higher = new THREE.Vector3(1 + offset, 1, 1);
    const table = new HashedVertexTable();
    table.appendUnwelded([higher, lower]);
    expect(table.add(query)).toBe(1);
    const sameCell = new HashedVertexTable();
    sameCell.appendUnwelded([new THREE.Vector3(1, 1, 1 + offset), new THREE.Vector3(1, 1 + offset, 1)]);
    expect(sameCell.add(query)).toBe(0);
    const twins = new HashedVertexTable();
    twins.appendUnwelded([higher, higher.clone()]);
    expect(twins.add(query)).toBe(0);
  });

  it('welds a dense lattice cloud exactly like a brute-force search', () => {
    const step = 2 ** -13;
    const points: THREE.Vector3[] = [];
    let seed = 7;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let index = 0; index < 600; index++) {
      const lattice = () => Math.round((next() - 0.5) * 40) * step;
      points.push(new THREE.Vector3(lattice(), 1 + lattice(), -1 + lattice()));
    }
    const table = new HashedVertexTable();
    expect(points.map((point) => table.add(point))).toEqual(bruteForceWeld(points));
  });

  it('weldShared returns the stored vertex object for the welded point', () => {
    const table = new HashedVertexTable();
    const first = table.weldShared(new THREE.Vector3(1, 2, 3));
    const again = table.weldShared(new THREE.Vector3(1, 2, 3));
    expect(again).toBe(first);
    expect(first.toArray()).toEqual([1, 2, 3]);
    expect(table.count).toBe(1);
  });
});
