import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptShapeLeavesPositive } from '@/solid_script/language/solid_script_shape.js';
import { SOLID_SCRIPT_EXAMPLE_SPIRAL_STAIRCASE } from '@/solid_script/examples/solid_script_examples_showcase.js';

describe('SolidScript Spiral Staircase example', () => {
  it('runs the handrail through the top of every post along the spiral', () => {
    const result = solidScriptProgramRun(solidScriptDocumentCreate([...SOLID_SCRIPT_EXAMPLE_SPIRAL_STAIRCASE]), {
      box: [4, 4, 4],
    });
    expect(result.error?.message ?? null).toBeNull();
    // Posts and rail pieces are the brushes near the rail radius of 1.7 m.
    const near = result.shapes
      .flatMap(solidScriptShapeLeavesPositive)
      .filter((shape) => shape.kind === 'solid')
      .map((shape) => new THREE.Box3().setFromPoints(shape.points))
      .filter((bounds) => {
        const middle = bounds.getCenter(new THREE.Vector3());
        return Math.abs(Math.hypot(middle.x, middle.z) - 1.7) < 0.05;
      });
    const posts = near.filter((bounds) => bounds.max.y - bounds.min.y > 0.5);
    const rails = near.filter((bounds) => bounds.max.y - bounds.min.y <= 0.5);
    expect(posts).toHaveLength(18);
    expect(rails.length).toBeGreaterThan(0);
    for (const post of posts) {
      const top = post.getCenter(new THREE.Vector3()).setY(post.max.y);
      expect(rails.some((rail) => rail.clone().expandByScalar(0.005).containsPoint(top))).toBe(true);
    }
  });
});
