import { describe, it, expect } from 'vitest';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidPlane } from '@/solid/brush/solid_plane.js';
import { SolidBrushGeometryEquality } from '@/solid/brush/solid_brush_geometry_equality.js';

/** SolidBrushGeometryEquality compares brush geometry exactly. */
describe('SolidBrushGeometryEquality', () => {
  it('treats separately built identical brushes and clones as equal', () => {
    const first = SolidBrushFactory.createCenteredBox(2, 3, 4);
    expect(SolidBrushGeometryEquality.equals(first, SolidBrushFactory.createCenteredBox(2, 3, 4))).toBe(true);
    expect(SolidBrushGeometryEquality.equals(first, first.clone())).toBe(true);
  });

  it('detects a tiny vertex or plane change', () => {
    const first = SolidBrushFactory.createCenteredBox(2, 3, 4);
    const movedVertex = first.clone();
    const vertex = movedVertex.vertices[0];
    expect(vertex).toBeDefined();
    vertex?.setX(vertex.x + 1e-12);
    expect(SolidBrushGeometryEquality.equals(first, movedVertex)).toBe(false);
    const movedPlane = first.clone();
    const plane = movedPlane.planes[0];
    expect(plane).toBeDefined();
    if (plane) movedPlane.planes[0] = new SolidPlane(plane.normal.clone(), plane.offset + 1e-12);
    expect(SolidBrushGeometryEquality.equals(first, movedPlane)).toBe(false);
  });

  it('detects different topology sizes', () => {
    const box = SolidBrushFactory.createCenteredBox(1, 1, 1);
    const other = box.clone();
    other.planes.pop();
    expect(SolidBrushGeometryEquality.equals(box, other)).toBe(false);
  });
});
