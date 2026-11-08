import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  generatorRevolveCornerCuts,
  generatorRevolveCornerPoint,
  generatorRevolveSharpVertices,
  generatorRevolveSideNormal,
} from '@/generator/revolve/generator_revolve_corner.js';

/** Corner cuts shared by square and polygon sections. */
describe('generator revolve corner cuts', () => {
  it('lists square and polygon corners counter-clockwise from the first corner past +X', () => {
    expect(generatorRevolveSharpVertices().map((vertex) => vertex.toArray())).toEqual([
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ]);
    const hexagon = generatorRevolveSharpVertices(6);
    expect(hexagon).toHaveLength(6);
    expect(Math.atan2(hexagon[0]?.y ?? 0, hexagon[0]?.x ?? 0)).toBeCloseTo(Math.PI / 6, 12);
    expect(generatorRevolveSideNormal(new THREE.Vector2(1, -1), new THREE.Vector2(1, 1)).toArray()).toEqual([1, 0, 0]);
  });

  it('cuts one straight chamfer face with its ends the corner size along both sides', () => {
    const [cut] = generatorRevolveCornerCuts(generatorRevolveSharpVertices(), 0.3, 1);
    expect(cut).toHaveLength(2);
    expect(cut?.[0]?.x).toBeCloseTo(1, 12);
    expect(cut?.[0]?.y).toBeCloseTo(0.7, 12);
    expect(cut?.[1]?.x).toBeCloseTo(0.7, 12);
    expect(cut?.[1]?.y).toBeCloseTo(1, 12);
  });

  it.each([3, 5, 8])('rounds a %s-sided polygon corner on an arc tangent to both sides', (corners) => {
    const vertices = generatorRevolveSharpVertices(corners);
    const cuts = generatorRevolveCornerCuts(vertices, 0.5, 4);
    const cut = cuts[0] ?? [];
    expect(cut).toHaveLength(5);
    const side = (vertices[0] ?? new THREE.Vector2()).distanceTo(vertices[1] ?? new THREE.Vector2());
    expect(cut[0]?.distanceTo(vertices[0] ?? new THREE.Vector2())).toBeCloseTo(side / 4, 12);
    expect(cut[4]?.distanceTo(vertices[0] ?? new THREE.Vector2())).toBeCloseTo(side / 4, 12);
    const centre = (vertices[0] ?? new THREE.Vector2())
      .clone()
      .multiplyScalar(
        1 - side / 4 / Math.tan(Math.PI / corners) / (vertices[0]?.length() ?? 1) / Math.cos(Math.PI / corners),
      );
    const radii = cut.map((point) => point.distanceTo(centre));
    for (const radius of radii) expect(radius).toBeCloseTo(radii[0] ?? 0, 9);
  });

  it('gives every corner one ring point per face and the rest along the side after it', () => {
    const cuts = generatorRevolveCornerCuts(generatorRevolveSharpVertices(), 0.5, 2);
    const ring = Array.from({ length: 24 }, (_, index) => generatorRevolveCornerPoint(cuts, 24, index));
    expect(ring.slice(0, 3).map((point) => point.toArray())).toEqual((cuts[0] ?? []).map((point) => point.toArray()));
    expect(ring[6]?.toArray()).toEqual(cuts[1]?.[0]?.toArray());
    expect(ring[4]?.y).toBeCloseTo(1, 12);
  });

  it('hands the points of a side with no length left to the corner faces', () => {
    const cuts = generatorRevolveCornerCuts(generatorRevolveSharpVertices(), 1, 2);
    const ring = Array.from({ length: 12 }, (_, index) => generatorRevolveCornerPoint(cuts, 12, index));
    const keys = new Set(ring.map((point) => `${point.x.toFixed(9)},${point.y.toFixed(9)}`));
    expect(keys.size).toBe(12);
    for (const point of ring) expect(point.length()).toBeLessThanOrEqual(1 + 1e-12);
  });
});
