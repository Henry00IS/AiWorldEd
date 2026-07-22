import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GizmoAxis } from '../../src/types/transform_mode.js';
import { TransformConstraint } from '../../src/transform/transform_constraint.js';

describe('TransformConstraint.constrainTranslationToAxis', () => {
  it('should constrain to X axis only', () => {
    const delta = new THREE.Vector3(3, 5, 7);
    const result = TransformConstraint.constrainTranslationToAxis(delta, GizmoAxis.X);
    expect(result.x).toBe(3);
    expect(result.y).toBe(0);
    expect(result.z).toBe(0);
  });

  it('should constrain to Y axis only', () => {
    const delta = new THREE.Vector3(3, 5, 7);
    const result = TransformConstraint.constrainTranslationToAxis(delta, GizmoAxis.Y);
    expect(result.x).toBe(0);
    expect(result.y).toBe(5);
    expect(result.z).toBe(0);
  });

  it('should constrain to Z axis only', () => {
    const delta = new THREE.Vector3(3, 5, 7);
    const result = TransformConstraint.constrainTranslationToAxis(delta, GizmoAxis.Z);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.z).toBe(7);
  });

  it('should return zero for zero input', () => {
    const delta = new THREE.Vector3(0, 0, 0);
    const result = TransformConstraint.constrainTranslationToAxis(delta, GizmoAxis.X);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.z).toBe(0);
  });

  it('should handle negative values correctly', () => {
    const delta = new THREE.Vector3(-4, -5, -6);
    const result = TransformConstraint.constrainTranslationToAxis(delta, GizmoAxis.Y);
    expect(result.x).toBe(0);
    expect(result.y).toBe(-5);
    expect(result.z).toBe(0);
  });
});

describe('TransformConstraint.constrainTranslationToPlane', () => {
  it('should constrain to XY plane', () => {
    const delta = new THREE.Vector3(3, 5, 7);
    const result = TransformConstraint.constrainTranslationToPlane(delta, GizmoAxis.XY_PLANE);
    expect(result.x).toBe(3);
    expect(result.y).toBe(5);
    expect(result.z).toBe(0);
  });

  it('should constrain to YZ plane', () => {
    const delta = new THREE.Vector3(3, 5, 7);
    const result = TransformConstraint.constrainTranslationToPlane(delta, GizmoAxis.YZ_PLANE);
    expect(result.x).toBe(0);
    expect(result.y).toBe(5);
    expect(result.z).toBe(7);
  });

  it('should constrain to XZ plane', () => {
    const delta = new THREE.Vector3(3, 5, 7);
    const result = TransformConstraint.constrainTranslationToPlane(delta, GizmoAxis.XZ_PLANE);
    expect(result.x).toBe(3);
    expect(result.y).toBe(0);
    expect(result.z).toBe(7);
  });
});

describe('TransformConstraint.computeRotationAngle', () => {
  it('should return zero angle for identical directions', () => {
    const dir = new THREE.Vector3(1, 0, 0);
    const result = TransformConstraint.computeRotationAngle(dir, dir, new THREE.Vector3(0, 0, 1));
    expect(result).toBe(0);
  });

  it('should return PI/2 for perpendicular directions in XY plane', () => {
    const initial = new THREE.Vector3(1, 0, 0);
    const current = new THREE.Vector3(0, 1, 0);
    const result = TransformConstraint.computeRotationAngle(initial, current, new THREE.Vector3(0, 0, 1));
    expect(result).toBeCloseTo(Math.PI / 2);
  });

  it('should return negative angle for clockwise rotation', () => {
    const initial = new THREE.Vector3(0, 1, 0);
    const current = new THREE.Vector3(1, 0, 0);
    const result = TransformConstraint.computeRotationAngle(initial, current, new THREE.Vector3(0, 0, 1));
    expect(result).toBeCloseTo(-Math.PI / 2);
  });

  it('should handle zero vector gracefully', () => {
    const initial = new THREE.Vector3(0, 0, 0);
    const current = new THREE.Vector3(1, 0, 0);
    const result = TransformConstraint.computeRotationAngle(initial, current, new THREE.Vector3(0, 0, 1));
    expect(result).toBe(0);
  });

  it('should return PI for 180 degree rotation in plane', () => {
    const initial = new THREE.Vector3(1, 0, 0);
    const current = new THREE.Vector3(-1, 0.0001, 0);
    const result = TransformConstraint.computeRotationAngle(initial, current, new THREE.Vector3(0, 0, 1));
    expect(result).toBeCloseTo(Math.PI, 1);
  });
});

describe('TransformConstraint.computeScaleFactor', () => {
  it('should return 1 when distances are equal', () => {
    const result = TransformConstraint.computeScaleFactor(5, 5);
    expect(result).toBe(1);
  });

  it('should return 2 when distance doubles', () => {
    const result = TransformConstraint.computeScaleFactor(5, 10);
    expect(result).toBe(2);
  });

  it('should return 0.5 when distance halves', () => {
    const result = TransformConstraint.computeScaleFactor(10, 5);
    expect(result).toBe(0.5);
  });

  it('should clamp to minimum 0.01 when factor would be zero', () => {
    const result = TransformConstraint.computeScaleFactor(5, 0);
    expect(result).toBe(0.01);
  });

  it('should return 1 when initial distance is zero', () => {
    const result = TransformConstraint.computeScaleFactor(0, 10);
    expect(result).toBe(1);
  });
});
