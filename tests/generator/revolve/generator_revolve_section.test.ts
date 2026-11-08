import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { curveFromPolyline } from '@/curve/model/curve_model.js';
import { curveSegmentPropertySet, curveSegmentSectionSet } from '@/curve/model/curve_edit.js';
import { generatorRevolveCommonSides } from '@/generator/revolve/generator_revolve_section.js';
import { generatorRevolveStationsFromCurve } from '@/generator/revolve/generator_revolve_curve.js';
import { generatorRevolveRuns } from '@/generator/revolve/generator_revolve_profile.js';
import {
  generatorRevolveRing,
  generatorRevolveSectionFrame,
  generatorRevolveBrushes,
} from '@/generator/revolve/generator_revolve_brush.js';
import { generatorRevolveSmoothClasses } from '@/generator/revolve/generator_revolve_shading.js';

/** Shared rings preserve convex polygon edges and sensible default shading. */
describe('polygon and chamfer section outlines', () => {
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
    curve = curveSegmentSectionSet(curve, [1], 'rounded_square');
    curve = curveSegmentSectionSet(curve, [2], 'chamfered_square');
    curve = curveSegmentPropertySet(curveSegmentSectionSet(curve, [3], 'polygon'), [3], 'polygonSides', 3);
    curve = curveSegmentPropertySet(curveSegmentSectionSet(curve, [4], 'polygon'), [4], 'polygonSides', 5);
    const sides = generatorRevolveCommonSides(curve, 32);
    expect(sides).toBe(120);
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
  it('makes a square at chamfer zero, a regular octagon at one, and keeps all untwisted faces flat', () => {
    const frame = { center: new THREE.Vector3(), sides: 32 };
    const station = { height: 0, radius: 1, chamfered: true, chamferAmount: 1 };
    const octagon = generatorRevolveSectionFrame(frame, station);
    const ring = generatorRevolveRing(octagon, station);
    const [brush] = generatorRevolveBrushes(frame, [[station, { ...station, height: 2 }]]);
    if (!brush) throw new Error('Expected a chamfered prism');
    expect(brush.faces).toHaveLength(10);
    expect(generatorRevolveSmoothClasses(brush, octagon).every((value) => value === -1)).toBe(true);
    const trueCorners = ring.filter((_, index) => index % 4 === 0);
    const lengths = trueCorners.map((point, index) =>
      point.distanceTo(trueCorners[(index + 1) % trueCorners.length] ?? point),
    );
    for (const length of lengths) expect(length).toBeCloseTo(lengths[0] ?? 0, 8);
    const [square] = generatorRevolveBrushes(frame, [
      [
        { ...station, chamferAmount: 0 },
        { ...station, height: 2, chamferAmount: 0 },
      ],
    ]);
    expect(square?.vertices).toHaveLength(8);
  });
});
