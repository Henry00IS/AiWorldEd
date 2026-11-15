import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { editAxisDragParameter, editSnapDistanceToGrid } from '@/edit/tool/edit_axis_drag.js';

describe('editAxisDragParameter', () => {
  it('finds the axis point under a ray that crosses the axis', () => {
    const origin = new THREE.Vector3(Math.random(), Math.random(), Math.random());
    const direction = new THREE.Vector3(Math.random() - 0.5, 1, Math.random() - 0.5).normalize();
    const distance = Math.random() * 4 - 2;
    const target = origin.clone().addScaledVector(direction, distance);
    const side = new THREE.Vector3(1, 0, 0).cross(direction).normalize();
    const rayOrigin = target.clone().addScaledVector(side, 10);
    const parameter = editAxisDragParameter(origin, direction, rayOrigin, target.clone().sub(rayOrigin));
    expect(parameter).toBeCloseTo(distance, 6);
  });

  it('gives up when the ray runs along the axis', () => {
    const axis = new THREE.Vector3(0, 1, 0);
    expect(editAxisDragParameter(new THREE.Vector3(), axis, new THREE.Vector3(0, 5, 0), axis.clone())).toBeNull();
  });
});

describe('editSnapDistanceToGrid', () => {
  it('rounds to whole grid steps only when snapping applies', () => {
    const interval = 0.25 + Math.random();
    expect(editSnapDistanceToGrid(interval * 2.4, interval, true)).toBeCloseTo(interval * 2, 9);
    expect(editSnapDistanceToGrid(-interval * 1.6, interval, true)).toBeCloseTo(-interval * 2, 9);
    expect(editSnapDistanceToGrid(interval * 2.4, interval, false)).toBeCloseTo(interval * 2.4, 9);
  });
});
