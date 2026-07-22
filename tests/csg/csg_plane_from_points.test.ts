import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  buildVerticalPlaneFromTwoPoints,
  buildPlaneFromThreePoints,
  buildPlaneFromPlacementPoints,
  flipPlane,
  planeToCsgForm
} from '../../src/csg/csg_plane_from_points.js';

describe('csg_plane_from_points', () => {
  it('should build a vertical plane containing two points', () => {
    const a = new THREE.Vector3(0, 0, 0);
    const b = new THREE.Vector3(2, 0, 0);
    const plane = buildVerticalPlaneFromTwoPoints(a, b);
    expect(plane).not.toBeNull();
    expect(Math.abs(plane!.distanceToPoint(a))).toBeLessThan(1e-6);
    expect(Math.abs(plane!.distanceToPoint(b))).toBeLessThan(1e-6);
    expect(Math.abs(plane!.normal.dot(new THREE.Vector3(0, 1, 0)))).toBeLessThan(1e-6);
    const edge = b.clone().sub(a).normalize();
    expect(Math.abs(plane!.normal.dot(edge))).toBeLessThan(1e-6);
  });

  it('should return null for coincident two-point input', () => {
    const a = new THREE.Vector3(1, 2, 3);
    expect(buildVerticalPlaneFromTwoPoints(a, a.clone())).toBeNull();
  });

  it('should build a free plane from three non-collinear points', () => {
    const a = new THREE.Vector3(0, 0, 0);
    const b = new THREE.Vector3(1, 0, 0);
    const c = new THREE.Vector3(0, 1, 0);
    const plane = buildPlaneFromThreePoints(a, b, c);
    expect(plane).not.toBeNull();
    expect(Math.abs(plane!.distanceToPoint(a))).toBeLessThan(1e-6);
    expect(Math.abs(plane!.distanceToPoint(b))).toBeLessThan(1e-6);
    expect(Math.abs(plane!.distanceToPoint(c))).toBeLessThan(1e-6);
  });

  it('should reject collinear three-point input', () => {
    const a = new THREE.Vector3(0, 0, 0);
    const b = new THREE.Vector3(1, 0, 0);
    const c = new THREE.Vector3(2, 0, 0);
    expect(buildPlaneFromThreePoints(a, b, c)).toBeNull();
  });

  it('should prefer three-point plane when three points are provided', () => {
    const points = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 1)
    ];
    const plane = buildPlaneFromPlacementPoints(points);
    expect(plane).not.toBeNull();
    points.forEach((point) => {
      expect(Math.abs(plane!.distanceToPoint(point))).toBeLessThan(1e-6);
    });
  });

  it('should flip plane half-spaces', () => {
    const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), -1);
    const flipped = flipPlane(plane);
    expect(flipped.normal.x).toBeCloseTo(-1);
    expect(flipped.constant).toBeCloseTo(1);
  });

  it('should convert Three.js plane to CSG n·x = c form', () => {
    const point = new THREE.Vector3(2, 0, 0);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      new THREE.Vector3(1, 0, 0),
      point
    );
    const csg = planeToCsgForm(plane);
    expect(csg.normal.x).toBeCloseTo(1);
    expect(csg.constant).toBeCloseTo(2);
  });
});
