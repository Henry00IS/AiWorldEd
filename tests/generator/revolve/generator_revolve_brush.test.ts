import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { generatorRevolveBrushes, generatorRevolveRunBrush } from '@/generator/revolve/generator_revolve_brush.js';
import { generatorRevolveRuns } from '@/generator/revolve/generator_revolve_profile.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';

const frame = { center: new THREE.Vector3(1, 2, 3), sides: 8 };

describe('revolve brushes', () => {
  it('builds a frustum with two caps and one side per ring edge', () => {
    const brush = generatorRevolveRunBrush(frame, [
      { height: 0, radius: 1 },
      { height: 2, radius: 0.5 },
    ]);
    if (!brush) throw new Error('Expected a brush');
    expect(brush.faces).toHaveLength(10);
    const box = new THREE.Box3().setFromPoints(brush.vertices);
    expect(box.min.y).toBeCloseTo(2);
    expect(box.max.y).toBeCloseTo(4);
  });

  it('closes cones and pyramids at an apex', () => {
    const square = generatorRevolveRunBrush({ ...frame, sides: 4 }, [
      { height: 0, radius: 1 },
      { height: 1, radius: 0 },
    ]);
    if (!square) throw new Error('Expected a pyramid');
    expect(square.faces).toHaveLength(5);
    expect(square.vertices).toHaveLength(5);
  });

  it('merges a concave run into one valid convex brush', () => {
    const runs = generatorRevolveRuns([
      { height: 0, radius: 0.5 },
      { height: 1, radius: 0.45 },
      { height: 2, radius: 0.3 },
      { height: 3, radius: 0 },
    ]);
    const brushes = generatorRevolveBrushes(frame, runs);
    expect(brushes).toHaveLength(1);
    for (const brush of brushes) expect(SolidBrushValidator.validateGenerated(brush).valid).toBe(true);
  });

  it('builds one brush per run', () => {
    const runs = generatorRevolveRuns([
      { height: 0, radius: 0.5 },
      { height: 1, radius: 0.4 },
      { height: 2, radius: 0.3 },
      { height: 3, radius: 0.2 },
      { height: 4, radius: 0.7 },
    ]);
    expect(generatorRevolveBrushes(frame, runs)).toHaveLength(2);
  });
});
