import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { solidHullBrushFromPoints } from '@/solid/algorithm/surface/solid_hull_brush.js';

/**
 * Builds the corners of an upright prism with a regular polygon base.
 *
 * @param sides Number of sides.
 * @param radius Corner distance from the axis.
 * @param height Height.
 * @returns Corner points.
 */
function prismCorners(sides: number, radius: number, height: number): Vector3[] {
  const corners: Vector3[] = [];
  for (let side = 0; side < sides; side++) {
    const angle = (side / sides) * Math.PI * 2;
    for (const z of [0, height]) corners.push(new Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, z));
  }
  return corners;
}

describe('solidHullBrushFromPoints', () => {
  it('merges the coplanar triangles of a small hull into whole faces', () => {
    const grid: Vector3[] = [];
    for (const x of [0, 1, 2]) for (const y of [0, 1, 2]) for (const z of [0, 1, 2]) grid.push(new Vector3(x, y, z));
    const brush = solidHullBrushFromPoints(grid);
    expect(brush?.faces.length).toBe(6);
  });

  it('merges the caps of a large hull, whose triangles are matched by shared edges, into one face each', () => {
    const sides = 40;
    const brush = solidHullBrushFromPoints(prismCorners(sides, 2, 1));
    expect(brush).not.toBeNull();
    expect(brush?.faces.length).toBe(sides + 2);
    const capCorners = brush?.faces
      .map((face) => brush.getFaceVertexIndices(face).length)
      .filter((count) => count === sides);
    expect(capCorners?.length).toBe(2);
  });

  it('gives the same faces for the same points every time', () => {
    const points = prismCorners(24, 1.5, 2).concat([new Vector3(0, 0, 3), new Vector3(0, 0, -1)]);
    const first = solidHullBrushFromPoints(points);
    const second = solidHullBrushFromPoints(points.map((point) => point.clone()));
    const loops = (brush: typeof first) =>
      brush?.faces.map((face) => brush.getFaceVertexIndices(face).map((index) => brush.vertices[index]?.toArray()));
    expect(loops(second)).toEqual(loops(first));
  });
});
