import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { modifierGeneratorNodeSize, MODIFIER_GENERATOR_NODE_KINDS } from '@/modifier/stack/modifier_generator_node.js';
import { ModifierStackKindGenerator } from '@/modifier/stack/kinds/generator/modifier_stack_kind_generator.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { generatorIcosphere } from '@/generator/icosphere/generator_icosphere.js';
import { primitivePieces } from '../../modifier/stack/kinds/generator/primitive/primitive_fixture.js';

describe('Icosphere', () => {
  for (const [subdivisions, points, faces] of [
    [1, 12, 20],
    [2, 42, 80],
    [3, 162, 320],
  ] as const)
    it(`gives ${points} corners on the unit sphere and ${faces} outward triangles at Subdivisions ${subdivisions}`, () => {
      const shape = generatorIcosphere(subdivisions);
      expect(shape.points).toHaveLength(points);
      expect(shape.faces).toHaveLength(faces);
      for (const point of shape.points) expect(point.length()).toBeCloseTo(1, 9);
      for (const face of shape.faces) {
        const [a, b, c] = face.map((index) => shape.points[index] ?? new THREE.Vector3());
        if (!a || !b || !c) throw new Error('not a triangle');
        const normal = b.clone().sub(a).cross(c.clone().sub(a));
        expect(normal.dot(a.clone().add(b).add(c))).toBeGreaterThan(0);
      }
    });

  it('puts a corner at the top and the bottom', () => {
    const tops = generatorIcosphere(1).points.filter((point) => Math.abs(Math.abs(point.y) - 1) < 1e-9);
    expect(tops).toHaveLength(2);
  });

  it('is a generator node with Subdivisions from 1 to 4, starting at 2, in a 2 m box', () => {
    const kind = modifierStackKindFind('icosphere');
    expect(kind).toBeInstanceOf(ModifierStackKindGenerator);
    expect(MODIFIER_GENERATOR_NODE_KINDS).toContain('icosphere');
    expect(modifierGeneratorNodeSize('icosphere')).toEqual([2, 2, 2]);
    const field = kind?.fields.find((entry) => entry.key === 'subdivisions');
    expect([field?.label, field?.default, field?.min, field?.max]).toEqual(['Subdivisions', 2, 1, 4]);
  });

  it('fills its box with one valid convex piece of the chosen subdivision', () => {
    const { pieces, box } = primitivePieces('icosphere', [3, 2, 5], { subdivisions: 2 });
    expect(pieces).toHaveLength(1);
    const brush = pieces[0]?.brush;
    expect(brush && SolidBrushValidator.validateGenerated(brush).valid).toBe(true);
    expect(brush?.faces).toHaveLength(80);
    const bounds = new THREE.Box3().setFromPoints(brush?.vertices ?? []);
    expect(bounds.min.y).toBeCloseTo(box.min.y, 6);
    expect(bounds.max.y).toBeCloseTo(box.max.y, 6);
    expect(box.containsBox(bounds.expandByScalar(-1e-6))).toBe(true);
  });
});
