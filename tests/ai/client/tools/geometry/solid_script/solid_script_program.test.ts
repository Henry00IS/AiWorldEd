import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptProgramEvaluate } from '@/ai/client/tools/geometry/solid_script/solid_script_program.js';
import type { SolidScriptShape } from '@/ai/client/tools/geometry/solid_script/solid_script_shape.js';

/**
 * Returns the bounds of a solid shape.
 *
 * @param shape Shape.
 * @returns Box.
 */
function bounds(shape: SolidScriptShape | undefined): THREE.Box3 {
  if (shape?.kind !== 'solid') throw new Error('expected a solid');
  return new THREE.Box3().setFromPoints(shape.points);
}

describe('solidScriptProgramEvaluate', () => {
  it('evaluates a translated, centered cube', () => {
    const { shapes } = solidScriptProgramEvaluate('translate([1, 2, 3]) cube([2, 4, 6], center = true);');
    const box = bounds(shapes[0]);
    expect(box.min.toArray()).toEqual([0, 0, 0]);
    expect(box.max.toArray()).toEqual([2, 4, 6]);
  });

  it('keeps difference operands in order with module names as labels', () => {
    const { shapes } = solidScriptProgramEvaluate(
      'module wall() cube([4, 0.2, 3]); module door() cube([1, 1, 2]); difference() { wall(); translate([1.5, -0.4, 0]) door(); }',
    );
    const [root] = shapes;
    expect(root?.kind).toBe('boolean');
    if (root?.kind !== 'boolean') return;
    expect(root.operation).toBe('difference');
    expect(root.children.map((child) => child.label)).toEqual(['wall', 'door']);
  });

  it('supports variables, functions, for loops, ranges and comprehensions', () => {
    const { shapes, messages } = solidScriptProgramEvaluate(`
      step = 0.25;
      function rise(i) = i * step;
      sizes = [for (i = [1:3]) i * 2];
      echo(sizes = sizes);
      for (i = [0:2]) translate([0, i * 0.3, rise(i)]) cube([1, 0.3, step]);
    `);
    expect(messages).toEqual(['ECHO: sizes = [2, 4, 6]']);
    const [loop] = shapes;
    expect(loop?.kind === 'boolean' && loop.children.length).toBe(3);
    if (loop?.kind !== 'boolean') return;
    expect(bounds(loop.children[2]).min.z).toBeCloseTo(0.5);
  });

  it('passes children through user modules', () => {
    const { shapes } = solidScriptProgramEvaluate('module lift(h) translate([0, 0, h]) children(); lift(2) cube(1);');
    expect(bounds(shapes[0]).min.z).toBe(2);
  });

  it('honours $fn on cylinders and degrees in rotate', () => {
    const { shapes } = solidScriptProgramEvaluate('rotate([90, 0, 0]) cylinder(h = 2, r = 1, $fn = 8);');
    const shape = shapes[0];
    expect(shape?.kind === 'solid' && shape.points.length).toBe(16);
    expect(bounds(shape).min.y).toBeCloseTo(-2);
  });

  it('extrudes concave polygons into convex pieces and holes into a difference', () => {
    const outline = solidScriptProgramEvaluate(
      'linear_extrude(height = 1) polygon([[0,0],[2,0],[2,1],[1,1],[1,2],[0,2]]);',
    ).shapes[0];
    expect(outline?.kind === 'boolean' && outline.operation).toBe('union');
    const ring = solidScriptProgramEvaluate(
      'linear_extrude(1) polygon(points = [[0,0],[4,0],[4,4],[0,4],[1,1],[3,1],[3,3],[1,3]], paths = [[0,1,2,3],[4,5,6,7]]);',
    ).shapes[0];
    expect(ring?.kind === 'boolean' && ring.operation).toBe('difference');
  });

  it('hulls children into one solid and skips disabled statements', () => {
    const { shapes } = solidScriptProgramEvaluate('* cube(9); hull() { cube(1); translate([3, 0, 0]) sphere(0.5); }');
    expect(shapes).toHaveLength(1);
    expect(bounds(shapes[0]).max.x).toBeCloseTo(3.5);
  });

  it('reports unsupported modules and syntax errors with line numbers', () => {
    expect(() => solidScriptProgramEvaluate('cube(1);\nrotate_extrude() circle(1);')).toThrow(
      /line 2: rotate_extrude\(\) is not supported/,
    );
    expect(() => solidScriptProgramEvaluate('cube(1\ncube(2);')).toThrow(/line 2: expected "\)"/);
    expect(() => solidScriptProgramEvaluate('cube(1)\ncube(2);')).toThrow(/line 1: cube\(\) takes no children/);
    expect(() => solidScriptProgramEvaluate('square(1);')).toThrow(/2D and must be inside linear_extrude/);
  });
});
