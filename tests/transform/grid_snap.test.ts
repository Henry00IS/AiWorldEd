import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { GridSnap } from '../../src/transform/grid_snap.js';

describe('GridSnap.snapValue', () => {
  let snap: GridSnap;

  beforeEach(() => {
    snap = new GridSnap(true, 1.0);
  });

  it('should snap 0.4 to 0', () => {
    expect(snap.snapValue(0.4)).toBeCloseTo(0);
  });

  it('should snap 0.6 to 1', () => {
    expect(snap.snapValue(0.6)).toBeCloseTo(1);
  });

  it('should snap -0.3 to 0', () => {
    expect(snap.snapValue(-0.3)).toBeCloseTo(0);
  });

  it('should snap -0.7 to -1', () => {
    expect(snap.snapValue(-0.7)).toBeCloseTo(-1);
  });

  it('should return value unchanged when snapping is disabled', () => {
    snap.setEnabled(false);
    expect(snap.snapValue(0.4)).toBe(0.4);
    expect(snap.snapValue(3.7)).toBe(3.7);
  });

  it('should snap with custom interval', () => {
    snap.setInterval(2.0);
    expect(snap.snapValue(3)).toBe(4);
    expect(snap.snapValue(4)).toBe(4);
    expect(snap.snapValue(5)).toBe(6);
  });
});

describe('GridSnap.snapVector3', () => {
  let snap: GridSnap;

  beforeEach(() => {
    snap = new GridSnap(true, 1.0);
  });

  it('should snap all components individually', () => {
    const vector = new THREE.Vector3(0.4, 1.7, -0.3);
    snap.snapVector3(vector);
    expect(vector.x).toBeCloseTo(0);
    expect(vector.y).toBeCloseTo(2);
    expect(vector.z).toBeCloseTo(0);
  });

  it('should not modify vector when snapping disabled', () => {
    snap.setEnabled(false);
    const vector = new THREE.Vector3(0.4, 1.7, -0.3);
    snap.snapVector3(vector);
    expect(vector.x).toBe(0.4);
    expect(vector.y).toBe(1.7);
    expect(vector.z).toBe(-0.3);
  });
});

describe('GridSnap state management', () => {
  it('should start with correct enabled state', () => {
    const enabledSnap = new GridSnap(true, 1.0);
    const disabledSnap = new GridSnap(false, 1.0);
    expect(enabledSnap.isEnabled()).toBe(true);
    expect(disabledSnap.isEnabled()).toBe(false);
  });

  it('should toggle enable/disable correctly', () => {
    const snap = new GridSnap(true, 1.0);
    expect(snap.isEnabled()).toBe(true);
    snap.setEnabled(false);
    expect(snap.isEnabled()).toBe(false);
    snap.setEnabled(true);
    expect(snap.isEnabled()).toBe(true);
  });

  it('should update interval correctly', () => {
    const snap = new GridSnap(true, 1.0);
    expect(snap.getInterval()).toBe(1.0);
    snap.setInterval(5.0);
    expect(snap.getInterval()).toBe(5.0);
  });
});

describe('GridSnap.snapChangedAxes', () => {
  it('should only snap axes that moved from the start position', () => {
    const snap = new GridSnap(true, 1.0);
    const start = new THREE.Vector3(0.3, 0.7, 0.2);
    const current = new THREE.Vector3(1.4, 0.7, 0.2);
    snap.snapChangedAxes(current, start);
    expect(current.x).toBeCloseTo(1);
    expect(current.y).toBeCloseTo(0.7);
    expect(current.z).toBeCloseTo(0.2);
  });

  it('should leave all axes alone when snapping is disabled', () => {
    const snap = new GridSnap(false, 1.0);
    const start = new THREE.Vector3(0, 0, 0);
    const current = new THREE.Vector3(0.4, 0.6, 0.8);
    snap.snapChangedAxes(current, start);
    expect(current.x).toBeCloseTo(0.4);
    expect(current.y).toBeCloseTo(0.6);
    expect(current.z).toBeCloseTo(0.8);
  });
});

describe('GridSnap rotation and scale snapping', () => {
  it('should snap angles to 15 degree increments by default', () => {
    const snap = new GridSnap(true, 1.0);
    const twelveDegrees = (12 * Math.PI) / 180;
    const snapped = snap.snapAngleRadians(twelveDegrees);
    expect(snapped).toBeCloseTo((15 * Math.PI) / 180);
  });

  it('should leave angles unchanged when snap is disabled', () => {
    const snap = new GridSnap(false, 1.0);
    const angle = 0.37;
    expect(snap.snapAngleRadians(angle)).toBeCloseTo(0.37);
  });

  it('should snap scale factors to 0.1 increments by default', () => {
    const snap = new GridSnap(true, 1.0);
    expect(snap.snapScaleFactor(1.24)).toBeCloseTo(1.2);
    expect(snap.snapScaleFactor(1.26)).toBeCloseTo(1.3);
  });

  it('should leave scale factors unchanged when snap is disabled', () => {
    const snap = new GridSnap(false, 1.0);
    expect(snap.snapScaleFactor(1.37)).toBeCloseTo(1.37);
  });
});
