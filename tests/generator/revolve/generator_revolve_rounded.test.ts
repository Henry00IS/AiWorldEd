import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { curveDecode, curveEncode } from '@/curve/model/curve_codec.js';
import { curveFromPolyline, curveEquals } from '@/curve/model/curve_model.js';
import {
  curveInsertPoint,
  curveMirror,
  curveSegmentPropertySet,
  curveSegmentSectionSet,
} from '@/curve/model/curve_edit.js';
import {
  generatorRevolveBrushes,
  generatorRevolveRing,
  generatorRevolveSectionFrame,
} from '@/generator/revolve/generator_revolve_brush.js';
import { generatorRevolveStationsFromCurve } from '@/generator/revolve/generator_revolve_curve.js';
import { generatorRevolveRuns } from '@/generator/revolve/generator_revolve_profile.js';
import { generatorRevolveSurfaces, generatorRevolveUvLayout } from '@/generator/revolve/generator_revolve_surface.js';
import { generatorRevolvePerimeter } from '@/generator/revolve/generator_revolve_perimeter.js';
import { generatorRevolveOutlineSimplify } from '@/generator/revolve/generator_revolve_section.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';

/**
 * Makes a straight square profile with rounded corners.
 *
 * @param size Corner size.
 * @param bottom Radius at the bottom.
 * @returns Profile curve.
 */
function roundedProfile(size: number, bottom = 0.8) {
  return curveSegmentPropertySet(
    curveSegmentSectionSet(
      curveFromPolyline([
        [0, bottom],
        [1, 0.8],
      ]),
      [0],
      'square',
    ),
    [0],
    'cornerSize',
    size,
  );
}

/**
 * Tests convexity, representation limits and exact perimeter mapping rather
 * than screenshot coordinates.
 */
describe('filleted lathe sections', () => {
  it('keeps fractions through serialization, insertion and mirroring and compares them for history', () => {
    const curve = roundedProfile(0.4);
    const restored = curveDecode(curveEncode(curve));
    expect(restored).toEqual(curve);
    expect(curveEquals(curve, roundedProfile(0.6))).toBe(false);
    const split = curveInsertPoint(curve, 0.5).curve;
    expect(split.segments.every((segment) => segment.cornerSize === 0.4)).toBe(true);
    expect(curveMirror(split).segments).toEqual(split.segments);
    expect(roundedProfile(-1).segments[0]?.cornerSize).toBeUndefined();
    expect(roundedProfile(2).segments[0]?.cornerSize).toBe(1);
  });

  it('reduces size zero to Square and size one to a circle touching the side middles', () => {
    const frame = { center: new THREE.Vector3(), sides: 16 };
    const station = { height: 0, radius: 1 };
    const ring = (size: number) =>
      generatorRevolveRing(
        generatorRevolveSectionFrame(frame, { ...station, square: true, cornerSize: size, cornerSides: 4 }),
        station,
      );
    expect(ring(0)).toEqual(generatorRevolveRing(generatorRevolveSectionFrame(frame, true), station));
    for (const point of generatorRevolveOutlineSimplify(ring(1)))
      expect(Math.hypot(point.x, point.z)).toBeCloseTo(1, 9);
    expect(generatorRevolveOutlineSimplify(ring(1))).toHaveLength(16);
    expect(ring(0)).toHaveLength(frame.sides);
    expect(ring(0.3)).toHaveLength(20);
  });

  it('builds valid convex rounded runs with aligned sides and a scaled rectangular depth', () => {
    const stations = generatorRevolveStationsFromCurve(roundedProfile(0.3), 4, 1);
    const frame = { center: new THREE.Vector3(), sides: 6, aspect: 1.5 };
    const brushes = generatorRevolveBrushes(frame, generatorRevolveRuns(stations));
    expect(brushes).toHaveLength(1);
    const brush = brushes[0];
    if (!brush) throw new Error('Expected a convex piece');
    expect(SolidBrushValidator.validateGenerated(brush).valid).toBe(true);
    expect(brush.vertices).toHaveLength(40);
    const size = new THREE.Box3().setFromPoints(brush.vertices).getSize(new THREE.Vector3());
    expect(size.z / size.x).toBeCloseTo(frame.aspect, 8);
  });

  it.each([0.000001, 0.0001, 0.001, 0.002, 0.005, 0.01, 0.99, 0.999999])(
    'keeps near-limit fraction %s valid at high resolution',
    (fraction) => {
      const stations = generatorRevolveStationsFromCurve(roundedProfile(fraction), 4, 1);
      const brushes = generatorRevolveBrushes(
        { center: new THREE.Vector3(), sides: 64 },
        generatorRevolveRuns(stations),
      );
      expect(brushes).toHaveLength(1);
      for (const brush of brushes) expect(SolidBrushValidator.validateGenerated(brush).valid).toBe(true);
    },
  );

  it.each([0.000001, 0.0001, 0.001, 0.01])(
    'keeps tapered near-square fraction %s convex after brush-precision welding',
    (fraction) => {
      const profile = roundedProfile(fraction, 0.2);
      const stations = generatorRevolveStationsFromCurve(profile, 4, 1);
      const brushes = generatorRevolveBrushes(
        { center: new THREE.Vector3(), sides: 64 },
        generatorRevolveRuns(stations),
      );
      expect(brushes).toHaveLength(1);
      for (const brush of brushes) expect(SolidBrushValidator.validateGenerated(brush).valid).toBe(true);
    },
  );

  it.each([0, 0.25, 1])('maps actual perimeter length with a closed seam at fraction %s', (fraction) => {
    const stations = generatorRevolveStationsFromCurve(roundedProfile(fraction), 4, 1);
    const original = { center: new THREE.Vector3(), sides: 16, aspect: 1.6 };
    const frame = generatorRevolveSectionFrame(original, stations[0] ?? false);
    const [brush] = generatorRevolveBrushes(original, generatorRevolveRuns(stations));
    if (!brush) throw new Error('Expected a brush');
    const layout = generatorRevolveUvLayout(stations, 16, { mode: 'tile', around: 3, along: 2 }, 1.6);
    const ring = generatorRevolveRing(frame, stations[0] ?? { height: 0, radius: 0.8 });
    const perimeter = generatorRevolvePerimeter(ring);
    const surfaces = generatorRevolveSurfaces(brush, frame, layout);
    let total = 0;
    brush.faces.forEach((face, index) => {
      if (Math.abs(brush.planes[index]?.normal.y ?? 1) > 0.999) return;
      const points = brush.getFaceVertices(face).filter((point) => Math.abs(point.y) < 1e-6);
      const [a, b] = points;
      const uv = surfaces[index]?.uv;
      if (!a || !b || !uv) throw new Error('Expected mapped bottom edge');
      const span = Math.abs(uv.project(a).u - uv.project(b).u);
      expect(span).toBeCloseTo((3 * a.distanceTo(b)) / perimeter, 7);
      expect(uv.project(a).v).toBeCloseTo(0, 7);
      total += span;
    });
    expect(total).toBeCloseTo(3, 7);
  });
});
