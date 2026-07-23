import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '../../src/solid/brush/solid_brush_factory.js';
import { SolidBrushValidator } from '../../src/solid/brush/solid_brush_validator.js';

/**
 * Unit tests for convex solid brush construction and wing-edge validation.
 */
describe('SolidBrushFactory', () => {
  it('creates a valid box brush with six faces and mutual twin edges', () => {
    const size = 3 + Math.random() * 2;
    const half = size * 0.5;
    const brush = SolidBrushFactory.createBox(
      new THREE.Vector3(-half, -half, -half),
      new THREE.Vector3(half, half, half)
    );
    expect(brush.faces.length).toBe(6);
    expect(brush.vertices.length).toBe(8);
    expect(brush.wingEdges.length).toBe(24);
    const validation = SolidBrushValidator.validate(brush);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
  });

  it('produces bounds that match the requested min/max', () => {
    const min = new THREE.Vector3(-1.5, -2, -0.5);
    const max = new THREE.Vector3(2.5, 1, 3);
    const brush = SolidBrushFactory.createBox(min, max);
    const bounds = brush.computeLocalBounds();
    expect(bounds.min.x).toBeCloseTo(min.x, 5);
    expect(bounds.min.y).toBeCloseTo(min.y, 5);
    expect(bounds.min.z).toBeCloseTo(min.z, 5);
    expect(bounds.max.x).toBeCloseTo(max.x, 5);
    expect(bounds.max.y).toBeCloseTo(max.y, 5);
    expect(bounds.max.z).toBeCloseTo(max.z, 5);
  });

  it('creates a centered box with symmetric extents', () => {
    const width = 4;
    const height = 2;
    const depth = 6;
    const brush = SolidBrushFactory.createCenteredBox(width, height, depth);
    const bounds = brush.computeLocalBounds();
    expect(bounds.min.x).toBeCloseTo(-width * 0.5, 5);
    expect(bounds.max.x).toBeCloseTo(width * 0.5, 5);
    expect(bounds.min.y).toBeCloseTo(-height * 0.5, 5);
    expect(bounds.max.y).toBeCloseTo(height * 0.5, 5);
    expect(bounds.min.z).toBeCloseTo(-depth * 0.5, 5);
    expect(bounds.max.z).toBeCloseTo(depth * 0.5, 5);
  });
});
