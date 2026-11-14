import { describe, expect, it } from 'vitest';
import {
  SKETCH_MAX_SHAPES,
  SKETCH_SHAPE_TYPES,
  sketchCanonical,
  sketchDecode,
  sketchEncode,
  sketchShapeCreate,
  sketchShapeNormalize,
} from '@/sketch/model/sketch_model.js';
import { sketchArea, sketchOutlines, sketchShapeOutlines } from '@/sketch/model/sketch_regions.js';
import { sketchConvexPieces, sketchIsConvex } from '@/sketch/model/sketch_convex.js';

describe('sketch model', () => {
  it('round-trips every shape type through its encoding', () => {
    const sketch = { shapes: SKETCH_SHAPE_TYPES.map((type) => sketchShapeCreate(type)) };
    expect(sketchDecode(sketchEncode(sketch))).toEqual(sketch);
  });

  it('rejects broken shapes and clamps sizes instead of failing', () => {
    expect(sketchShapeNormalize({ type: 'triangle' })).toBeNull();
    expect(sketchShapeNormalize({ type: 'polygon', points: [{ u: 0, v: 0 }] })).toBeNull();
    const rectangle = sketchShapeNormalize({ type: 'rectangle', u: 0, v: 0, width: -3, height: Number.NaN });
    expect(rectangle?.type).toBe('rectangle');
    if (rectangle?.type === 'rectangle') {
      expect(rectangle.width).toBeGreaterThan(0);
      expect(rectangle.height).toBeGreaterThan(0);
    }
  });

  it('falls back to the default for values that are no sketch and caps the shape count', () => {
    const fallback = sketchEncode({ shapes: [sketchShapeCreate('circle')] });
    expect(sketchCanonical('nope', fallback)).toBe(fallback);
    expect(sketchCanonical(42, fallback)).toBe(fallback);
    const many = sketchEncode({
      shapes: Array.from({ length: SKETCH_MAX_SHAPES + 5 }, () => sketchShapeCreate('rectangle')),
    });
    expect(sketchDecode(many)?.shapes.length).toBe(SKETCH_MAX_SHAPES);
  });
});

describe('sketch regions', () => {
  it('splits every shape into counter-clockwise convex pieces covering its area', () => {
    for (const type of SKETCH_SHAPE_TYPES) {
      for (const outline of sketchShapeOutlines(sketchShapeCreate(type))) {
        expect(sketchArea(outline)).toBeGreaterThan(0);
        const pieces = sketchConvexPieces(outline);
        expect(pieces.length).toBeGreaterThan(0);
        let total = 0;
        for (const piece of pieces) {
          expect(sketchIsConvex(piece)).toBe(true);
          total += sketchArea(piece);
        }
        expect(total).toBeCloseTo(sketchArea(outline), 5);
      }
    }
  });

  it('keeps an L outline as few convex pieces with its exact area', () => {
    const [outline] = sketchOutlines({ shapes: [sketchShapeCreate('polygon')] });
    expect(sketchArea(outline ?? [])).toBeCloseTo(3, 6);
    expect(sketchConvexPieces(outline ?? []).length).toBe(2);
  });

  it('turns clockwise outlines counter-clockwise', () => {
    const [outline] = sketchOutlines({
      shapes: [
        {
          type: 'polygon',
          points: [
            { u: 0, v: 0 },
            { u: 0, v: 1 },
            { u: 1, v: 1 },
            { u: 1, v: 0 },
          ],
        },
      ],
    });
    expect(sketchArea(outline ?? [])).toBeCloseTo(1, 6);
  });
});
