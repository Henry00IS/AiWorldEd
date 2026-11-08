import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { curveFromPolyline } from '@/curve/model/curve_model.js';
import { curveSegmentPropertySet, curveSegmentSectionSet } from '@/curve/model/curve_edit.js';
import {
  generatorRevolveCommonSides,
  generatorRevolveOutlineSimplify,
} from '@/generator/revolve/generator_revolve_section.js';
import { generatorRevolveStationsFromCurve } from '@/generator/revolve/generator_revolve_curve.js';
import { generatorRevolveRuns } from '@/generator/revolve/generator_revolve_profile.js';
import {
  generatorRevolveRing,
  generatorRevolveSectionFrame,
  generatorRevolveBrushes,
} from '@/generator/revolve/generator_revolve_brush.js';
import { generatorRevolveSmoothClasses } from '@/generator/revolve/generator_revolve_shading.js';

/** Shared rings preserve convex polygon edges and sensible default shading. */
describe('polygon and cut-corner section outlines', () => {
  it('chooses one common ring resolution and samples every polygon edge evenly', () => {
    let curve = curveFromPolyline([
      [0, 0.8],
      [0.2, 0.8],
      [0.4, 0.8],
      [0.6, 0.8],
      [0.8, 0.8],
      [1, 0.8],
    ]);
    curve = curveSegmentSectionSet(curve, [0], 'square');
    curve = curveSegmentPropertySet(curveSegmentSectionSet(curve, [1], 'square'), [1], 'cornerSize', 0.3);
    curve = curveSegmentPropertySet(curveSegmentSectionSet(curve, [2], 'square'), [2], 'cornerSize', 0.3);
    curve = curveSegmentPropertySet(curve, [2], 'cornerSides', 1);
    curve = curveSegmentPropertySet(curveSegmentSectionSet(curve, [3], 'polygon'), [3], 'polygonSides', 3);
    curve = curveSegmentPropertySet(curveSegmentSectionSet(curve, [4], 'polygon'), [4], 'polygonSides', 5);
    const sides = generatorRevolveCommonSides(curve, 32);
    expect(sides).toBe(60);
    const stations = generatorRevolveStationsFromCurve(curve, 4, 1);
    for (const station of stations.slice(0, -1)) {
      const frame = generatorRevolveSectionFrame({ center: new THREE.Vector3(), sides }, station);
      expect(generatorRevolveRing(frame, station)).toHaveLength(sides);
    }
  });
  it.each([3, 4, 5, 6, 8, 12])('compiles a %s-sided polygon without retaining redundant flat-edge samples', (sides) => {
    const curve = curveSegmentPropertySet(
      curveSegmentSectionSet(
        curveFromPolyline([
          [0, 0.8],
          [1, 0.8],
        ]),
        [0],
        'polygon',
      ),
      [0],
      'polygonSides',
      sides,
    );
    const stations = generatorRevolveStationsFromCurve(curve, 4, 1);
    const resolution = generatorRevolveCommonSides(curve, 32);
    expect(resolution % 4).toBe(0);
    expect(resolution % sides).toBe(0);
    const [brush] = generatorRevolveBrushes(
      { center: new THREE.Vector3(), sides: resolution },
      generatorRevolveRuns(stations),
    );
    expect(brush?.faces).toHaveLength(sides + 2);
  });
  it('cuts a straight chamfer with one corner side, which makes a regular octagon and keeps all faces flat', () => {
    const frame = { center: new THREE.Vector3(), sides: 32 };
    const station = { height: 0, radius: 1, square: true, cornerSize: 2 - Math.SQRT2, cornerSides: 1 };
    const octagon = generatorRevolveSectionFrame(frame, station);
    const ring = generatorRevolveRing(octagon, station);
    const [brush] = generatorRevolveBrushes(frame, [[station, { ...station, height: 2 }]]);
    if (!brush) throw new Error('Expected a chamfered prism');
    expect(brush.faces).toHaveLength(10);
    expect(generatorRevolveSmoothClasses(brush, octagon).every((value) => value === -1)).toBe(true);
    const corners = generatorRevolveOutlineSimplify(ring);
    expect(corners).toHaveLength(8);
    const lengths = corners.map((point, index) => point.distanceTo(corners[(index + 1) % corners.length] ?? point));
    for (const length of lengths) expect(length).toBeCloseTo(lengths[0] ?? 0, 8);
    expect(corners[0]?.x).toBeCloseTo(1, 9);
    expect(corners[0]?.z).toBeCloseTo(1 - station.cornerSize, 9);
  });

  it.each([3, 4, 5, 6, 8, 12])('cuts every corner of a %s-sided polygon with the same number of faces', (sides) => {
    const frame = { center: new THREE.Vector3(), sides: 32 };
    const station = { height: 0, radius: 1, polygonSides: sides, cornerSize: 0.5, cornerSides: 3 };
    const cut = generatorRevolveSectionFrame(frame, station);
    expect(cut.sides % sides).toBe(0);
    expect(cut.sides).toBeGreaterThanOrEqual(sides * 4);
    const ring = generatorRevolveRing(cut, station);
    expect(ring).toHaveLength(cut.sides);
    expect(generatorRevolveOutlineSimplify(ring)).toHaveLength(sides * 4);
    const [brush] = generatorRevolveBrushes(frame, [[station, { ...station, height: 2 }]]);
    if (!brush) throw new Error('Expected a rounded prism');
    expect(brush.faces).toHaveLength(sides * 4 + 2);
    const flat = generatorRevolveSmoothClasses(brush, cut).filter((value) => value === -1);
    expect(flat).toHaveLength(sides + 2);
  });

  it('meets the cuts at the side middles at full size, without repeated corners', () => {
    const frame = { center: new THREE.Vector3(), sides: 16 };
    const station = { height: 0, radius: 1, square: true, cornerSize: 1, cornerSides: 1 };
    const ring = generatorRevolveRing(generatorRevolveSectionFrame(frame, station), station);
    expect(ring).toHaveLength(16);
    const unique = new Set(ring.map((point) => `${point.x.toFixed(9)},${point.z.toFixed(9)}`));
    expect(unique.size).toBe(16);
    expect(generatorRevolveOutlineSimplify(ring)).toHaveLength(4);
  });

  it('makes room for every corner face in the common ring count', () => {
    let curve = curveSegmentSectionSet(
      curveFromPolyline([
        [0, 0.8],
        [1, 0.8],
      ]),
      [0],
      'polygon',
    );
    curve = curveSegmentPropertySet(curveSegmentPropertySet(curve, [0], 'polygonSides', 12), [0], 'cornerSize', 0.5);
    curve = curveSegmentPropertySet(curve, [0], 'cornerSides', 8);
    expect(generatorRevolveCommonSides(curve, 32)).toBe(108);
    expect(generatorRevolveCommonSides(curve, 120)).toBe(120);
  });
});
