import { describe, expect, it } from 'vitest';
import { paintShapeFind, paintShapes } from '@/paint/shape/paint_shape_catalog.js';

describe('Paint shapes', () => {
  it.each(paintShapes.map((shape) => [shape.id, shape] as const))(
    '%s covers its middle and not its corners',
    (_id, shape) => {
      const center = Math.max(...[0, 0.1, -0.1, 0.2, -0.3].map((y) => shape.coverage(0, y, 0.02, 1, 0)));
      expect(center).toBeGreaterThan(0.9);
      expect(shape.coverage(0.99, 0.99, 0.02, 1, 0)).toBeLessThan(0.05);
      expect(shape.coverage(-0.99, -0.99, 0.02, 1, 0)).toBeLessThan(0.05);
    },
  );

  it('softens round edges with low hardness', () => {
    const round = paintShapeFind('round');
    expect(round.coverage(0.5, 0, 0.01, 1, 0)).toBeCloseTo(1);
    expect(round.coverage(0.5, 0, 0.01, 0, 0)).toBeLessThan(0.6);
  });

  it('mirrors footprints on odd dabs', () => {
    const feet = paintShapeFind('footprints');
    expect(feet.coverage(0.2, 0.67, 0.01, 1, 0)).toBeCloseTo(feet.coverage(-0.2, 0.67, 0.01, 1, 1));
    expect(feet.alternatingOffset).toBeGreaterThan(0);
  });

  it('falls back to round for unknown ids', () => {
    expect(paintShapeFind('missing').id).toBe('round');
  });
});
