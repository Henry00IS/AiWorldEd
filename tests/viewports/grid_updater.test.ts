import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { computeOptimalDivisions, updateGridDivisions } from '../../src/viewports/grid_updater.js';
import { Grids } from '../../src/viewports/grids.js';

describe('computeOptimalDivisions', () => {
  it('should return 50 for a snap interval of 1.0', () => {
    expect(computeOptimalDivisions(1.0)).toBe(50);
  });

  it('should return 25 for a snap interval of 2.0', () => {
    expect(computeOptimalDivisions(2.0)).toBe(25);
  });

  it('should return 500 clamped to 200 for a small interval', () => {
    expect(computeOptimalDivisions(0.1)).toBe(200);
  });

  it('should return 1 for a very large interval', () => {
    expect(computeOptimalDivisions(100.0)).toBe(1);
  });

  it('should return 1000 clamped to 200 for interval 0.05', () => {
    expect(computeOptimalDivisions(0.05)).toBe(200);
  });

  it('should return 5 for a snap interval of 10.0', () => {
    expect(computeOptimalDivisions(10.0)).toBe(5);
  });
});

describe('updateGridDivisions', () => {
  it('should call setSnapInterval on infinite grids', () => {
    const grids = new Grids(50, 50, 'xz', 'orthographic');
    const spy = vi.spyOn(grids, 'setSnapInterval');
    updateGridDivisions(grids, 0.5);
    expect(spy).toHaveBeenCalledWith(0.5);
  });

  it('should update legacy GridHelper divisions for interval 1.0', () => {
    const helper = new THREE.GridHelper(50, 10);
    updateGridDivisions(helper, 1.0);
    expect(helper.divisions).toBe(50);
  });

  it('should update legacy GridHelper divisions for interval 5.0', () => {
    const helper = new THREE.GridHelper(50, 10);
    updateGridDivisions(helper, 5.0);
    expect(helper.divisions).toBe(10);
  });

  it('should cap legacy divisions at maximum for small interval', () => {
    const helper = new THREE.GridHelper(50, 10);
    updateGridDivisions(helper, 0.01);
    expect(helper.divisions).toBe(200);
  });

  it('should cap legacy divisions at minimum for very large interval', () => {
    const helper = new THREE.GridHelper(50, 10);
    updateGridDivisions(helper, 200.0);
    expect(helper.divisions).toBe(1);
  });
});
