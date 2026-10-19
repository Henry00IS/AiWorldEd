import { describe, expect, it } from 'vitest';
import { BrushShapeFingerprint } from '@/solid/algorithm/spatial/brush_shape_fingerprint.js';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';

describe('brush shape fingerprint', () => {
  it('changes when a vertex that is not an endpoint moves', () => {
    const brush = SolidBrushFactory.createCenteredBox(1, 1, 1);
    const before = BrushShapeFingerprint.fromBrush(brush);
    const vertex = brush.vertices[1];
    if (!vertex) throw new Error('expected a vertex');
    vertex.x += 0.25;
    expect(BrushShapeFingerprint.fromBrush(brush)).not.toBe(before);
  });
});
