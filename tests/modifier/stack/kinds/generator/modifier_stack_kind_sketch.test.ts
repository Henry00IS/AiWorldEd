import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { modifierStackParameterSet } from '@/modifier/stack/modifier_stack_operations.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { sketchEncode, sketchShapeCreate, type SketchShape } from '@/sketch/model/sketch_model.js';
import { expectStackConvex, stackFixture } from '../../modifier_stack_fixture.js';

/**
 * Builds a sketch generator and returns its pieces.
 *
 * @param parameters Sketch parameters.
 * @returns Generated brushes.
 */
function sketch(parameters: Record<string, unknown>): SolidBrushInstance[] {
  return stackFixture([{ kind: 'sketch', parameters }], 4)
    .compile()
    .instances.slice(1);
}

/**
 * Returns the bounds of brushes.
 *
 * @param pieces Brushes.
 * @returns Bounds.
 */
function bounds(pieces: readonly SolidBrushInstance[]): THREE.Box3 {
  const box = new THREE.Box3();
  for (const piece of pieces) for (const vertex of piece.brush.vertices) box.expandByPoint(vertex);
  return box;
}

/**
 * Checks that every piece is a valid convex brush.
 *
 * @param pieces Pieces.
 */
function expectValid(pieces: readonly SolidBrushInstance[]): void {
  expect(pieces.length).toBeGreaterThan(0);
  for (const piece of pieces) {
    expectStackConvex(piece);
    expect(SolidBrushValidator.validateGenerated(piece.brush).valid).toBe(true);
  }
}

/**
 * Encodes a one-shape sketch.
 *
 * @param shape Shape.
 * @returns Encoded sketch.
 */
function only(shape: SketchShape): string {
  return sketchEncode({ shapes: [shape] });
}

describe('sketch generator', () => {
  it('extrudes every shape type into valid convex brushes through the box height', () => {
    for (const type of ['rectangle', 'circle', 'arc', 'polygon', 'polyline'] as const) {
      const pieces = sketch({ sketch: only(sketchShapeCreate(type)) });
      expectValid(pieces);
      const box = bounds(pieces);
      expect(box.max.y - box.min.y).toBeCloseTo(4, 4);
    }
  });

  it('places a rectangle by its centre and size on the plane', () => {
    const box = bounds(sketch({ sketch: only({ type: 'rectangle', u: 0.5, v: 0, width: 1, height: 2 }) }));
    expect(box.max.x - box.min.x).toBeCloseTo(1, 4);
    expect(box.max.z - box.min.z).toBeCloseTo(2, 4);
    const centre = box.getCenter(new THREE.Vector3());
    expect(
      centre.x -
        bounds(sketch({ sketch: only({ type: 'rectangle', u: 0, v: 0, width: 1, height: 2 }) })).getCenter(
          new THREE.Vector3(),
        ).x,
    ).toBeCloseTo(0.5, 4);
  });

  it('revolves a profile into a ring of valid wedges around the vertical axis', () => {
    const profile = only({ type: 'rectangle', u: 1, v: 0.5, width: 0.5, height: 1 });
    const pieces = sketch({ sketch: profile, build: 'revolve', sides: 12, angle: 360 });
    expectValid(pieces);
    expect(pieces.length).toBe(12);
    const box = bounds(pieces);
    expect(box.max.x - box.min.x).toBeCloseTo(box.max.z - box.min.z, 3);
    expect(box.max.x - box.min.x).toBeGreaterThan(2.4);
    const half = sketch({ sketch: profile, build: 'revolve', sides: 6, angle: 180 });
    expectValid(half);
    expect(half.length).toBe(6);
  });

  it('cuts revolve profiles that cross the axis instead of making inside-out brushes', () => {
    const pieces = sketch({ sketch: only({ type: 'rectangle', u: 0, v: 0.5, width: 2, height: 1 }), build: 'revolve' });
    expectValid(pieces);
  });

  it('rebuilds when the sketch is edited and stays a plain stack parameter', () => {
    const fixture = stackFixture([{ kind: 'sketch', parameters: { sketch: only(sketchShapeCreate('rectangle')) } }], 4);
    const before = fixture.compile().instances.length;
    let stack = ModifierVolume.read(fixture.volume);
    const step = stack.modifiers[0]?.id ?? '';
    const two = sketchEncode({
      shapes: [sketchShapeCreate('rectangle'), { type: 'rectangle', u: 1.5, v: 0, width: 0.5, height: 0.5 }],
    });
    stack = modifierStackParameterSet(stack, step, 'sketch', two);
    ModifierVolume.write(fixture.volume, stack);
    expect(fixture.compile().instances.length).toBe(before + 1);
    expect(ModifierVolume.read(fixture.volume).modifiers[0]?.parameters['sketch']).toBe(two);
  });

  it('normalizes broken sketch values back to the default and summarizes the shapes', () => {
    const kind = modifierStackKindFind('sketch');
    const parameters = kind?.normalizeParameters({ sketch: '{oops' }) ?? {};
    expect(parameters['sketch']).toBe(kind?.normalizeParameters({})['sketch']);
    expect(kind?.summary(parameters)).toBe('1 Shape · Extrude');
  });

  it('draws its outline guide in the node frame', () => {
    const fixture = stackFixture([{ kind: 'sketch', parameters: {} }], 4);
    fixture.volume.updateMatrixWorld(true);
    const kind = modifierStackKindFind('sketch');
    const [guide] = kind?.helpers(fixture.volume, kind.normalizeParameters({})) ?? [];
    expect(guide).toBeInstanceOf(THREE.LineSegments);
    const geometry = (guide as THREE.LineSegments).geometry;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox ?? new THREE.Box3();
    expect(box.max.x).toBeCloseTo(1 / 4, 4);
    expect(box.min.x).toBeCloseTo(-1 / 4, 4);
  });
});
