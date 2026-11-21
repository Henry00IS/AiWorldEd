import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { modifierGeneratorNodeSize, MODIFIER_GENERATOR_NODE_KINDS } from '@/modifier/stack/modifier_generator_node.js';
import { ModifierStackKindGenerator } from '@/modifier/stack/kinds/generator/modifier_stack_kind_generator.js';
import { solidHullBrushFromPoints } from '@/solid/algorithm/surface/solid_hull_brush.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { generatorRhombicuboctahedronPoints } from '@/generator/rhombicuboctahedron/generator_rhombicuboctahedron.js';
import { primitivePieces } from '../../modifier/stack/kinds/generator/primitive/primitive_fixture.js';

describe('Rhombicuboctahedron', () => {
  it('is a generator node with Grid Aligned as its default Precision', () => {
    const kind = modifierStackKindFind('rhombicuboctahedron');
    expect(kind).toBeInstanceOf(ModifierStackKindGenerator);
    expect(MODIFIER_GENERATOR_NODE_KINDS).toContain('rhombicuboctahedron');
    const field = kind?.fields.find((entry) => entry.key === 'precision');
    expect(field?.default).toBe('Grid Aligned');
    expect(field?.choices?.map((choice) => choice.label)).toEqual(['Grid Aligned', 'Precise']);
  });

  for (const precision of ['Grid Aligned', 'Precise'] as const) {
    it(`${precision} has 24 vertices and 26 convex faces, including eight triangles`, () => {
      const points = generatorRhombicuboctahedronPoints(precision);
      const brush = solidHullBrushFromPoints(points);
      expect(brush).not.toBeNull();
      expect(points).toHaveLength(24);
      expect(brush?.vertices).toHaveLength(24);
      expect(brush?.faces).toHaveLength(26);
      expect(brush && SolidBrushValidator.validateGenerated(brush).valid).toBe(true);
      const sides = brush?.faces.map((face) => brush.getFaceVertexIndices(face).length);
      expect(sides?.filter((count) => count === 3)).toHaveLength(8);
      expect(sides?.filter((count) => count === 4)).toHaveLength(18);
    });

    it(`${precision} has six axis, twelve edge and eight corner directions`, () => {
      const brush = solidHullBrushFromPoints(generatorRhombicuboctahedronPoints(precision));
      const directions = brush?.planes.map((plane) => plane.normal.toArray().map((n) => Math.round(n * 10000)));
      const wanted: number[][] = [];
      for (const x of [-1, 0, 1])
        for (const y of [-1, 0, 1])
          for (const z of [-1, 0, 1])
            if (x || y || z)
              wanted.push(
                new THREE.Vector3(x, y, z)
                  .normalize()
                  .toArray()
                  .map((n) => Math.round(n * 10000)),
              );
      expect(directions?.map(String).sort()).toEqual(wanted.map(String).sort());
    });
  }

  it('puts every default generator corner on the quarter metre grid', () => {
    const size = modifierGeneratorNodeSize('rhombicuboctahedron');
    expect(size).toEqual([1, 1, 1]);
    const { pieces, box } = primitivePieces('rhombicuboctahedron', size);
    expect(pieces).toHaveLength(1);
    const middle = box.getCenter(new THREE.Vector3());
    const corners = (pieces[0]?.brush.vertices ?? []).map((vertex) =>
      vertex
        .clone()
        .sub(middle)
        .toArray()
        .map((value) => Math.abs(value))
        .sort()
        .join(','),
    );
    expect(corners).toHaveLength(24);
    expect(new Set(corners)).toEqual(new Set(['0.25,0.25,0.5']));
    for (const vertex of pieces[0]?.brush.vertices ?? [])
      for (const coordinate of vertex.toArray()) expect(coordinate * 4).toBeCloseTo(Math.round(coordinate * 4), 8);
  });

  it('gives Precise square quadrilaterals with equal edges, and off-grid corners', () => {
    const brush = solidHullBrushFromPoints(generatorRhombicuboctahedronPoints('Precise'));
    for (const face of brush?.faces ?? []) {
      const points = brush?.getFaceVertexIndices(face).map((index) => brush.vertices[index]);
      if (!points) continue;
      const lengths = points.map((point, index) =>
        point?.distanceTo(points[(index + 1) % points.length] ?? new THREE.Vector3()),
      );
      for (const length of lengths) expect(length).toBeCloseTo(2, 8);
      if (points.length === 4) {
        const [a, b, c] = points;
        expect(a && b && c && a.clone().sub(b).dot(c.clone().sub(b))).toBeCloseTo(0, 8);
      }
    }
    expect(
      brush?.vertices.some((point) =>
        point.toArray().some((value) => Math.abs(value * 32 - Math.round(value * 32)) > 1e-6),
      ),
    ).toBe(true);
  });

  it('fills a non-cubic box with one valid piece in either mode', () => {
    for (const precision of ['Grid Aligned', 'Precise']) {
      const { pieces, box } = primitivePieces('rhombicuboctahedron', [3, 2, 5], { precision });
      expect(pieces).toHaveLength(1);
      const brush = pieces[0]?.brush;
      expect(brush && SolidBrushValidator.validateGenerated(brush).valid).toBe(true);
      const bounds = new THREE.Box3().setFromPoints(brush?.vertices ?? []);
      expect(bounds.min.distanceTo(box.min)).toBeLessThan(1e-6);
      expect(bounds.max.distanceTo(box.max)).toBeLessThan(1e-6);
    }
  });
});
