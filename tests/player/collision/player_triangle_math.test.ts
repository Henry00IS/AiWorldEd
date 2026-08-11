import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  playerClosestPointOnTriangle,
  playerClosestPointsSegmentSegment,
  playerClosestPointsSegmentTriangle,
  playerTriangleNormalFromVertices,
} from '@/player/collision/player_triangle_math.js';

describe('player_triangle_math', () => {
  it('finds the closest point on a triangle face interior', () => {
    const a = new THREE.Vector3(0, 0, 0);
    const b = new THREE.Vector3(2, 0, 0);
    const c = new THREE.Vector3(0, 0, 2);
    const point = new THREE.Vector3(0.4, 1, 0.4);
    const closest = playerClosestPointOnTriangle(point, a, b, c, new THREE.Vector3());
    expect(closest.x).toBeCloseTo(0.4, 4);
    expect(closest.y).toBeCloseTo(0, 4);
    expect(closest.z).toBeCloseTo(0.4, 4);
  });

  it('clamps closest point to a triangle vertex', () => {
    const a = new THREE.Vector3(0, 0, 0);
    const b = new THREE.Vector3(1, 0, 0);
    const c = new THREE.Vector3(0, 0, 1);
    const point = new THREE.Vector3(-2, 0, -2);
    const closest = playerClosestPointOnTriangle(point, a, b, c, new THREE.Vector3());
    expect(closest.x).toBeCloseTo(0, 4);
    expect(closest.z).toBeCloseTo(0, 4);
  });

  it('measures distance from a vertical segment to a floor triangle', () => {
    const segA = new THREE.Vector3(0, 0.35, 0);
    const segB = new THREE.Vector3(0, 1.4, 0);
    const a = new THREE.Vector3(-1, 0, -1);
    const b = new THREE.Vector3(1, 0, -1);
    const c = new THREE.Vector3(0, 0, 1);
    const onSeg = new THREE.Vector3();
    const onTri = new THREE.Vector3();
    const distance = playerClosestPointsSegmentTriangle(segA, segB, a, b, c, onSeg, onTri);
    expect(distance).toBeCloseTo(0.35, 3);
    expect(onTri.y).toBeCloseTo(0, 4);
    expect(onSeg.y).toBeCloseTo(0.35, 3);
  });

  it('finds closest points between two skew segments', () => {
    const onA = new THREE.Vector3();
    const onB = new THREE.Vector3();
    playerClosestPointsSegmentSegment(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0.5, 1, 0.5),
      new THREE.Vector3(0.5, 1, -0.5),
      onA,
      onB,
    );
    expect(onA.x).toBeCloseTo(0.5, 4);
    expect(onB.y).toBeCloseTo(1, 4);
  });

  it('builds a unit normal from triangle vertices', () => {
    const normal = new THREE.Vector3();
    const ok = playerTriangleNormalFromVertices(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(1, 0, 0),
      normal,
    );
    expect(ok).toBe(true);
    expect(normal.y).toBeCloseTo(1, 4);
  });
});
