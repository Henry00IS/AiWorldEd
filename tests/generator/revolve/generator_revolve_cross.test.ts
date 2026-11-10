import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { curveDecode, curveEncode } from '@/curve/model/curve_codec.js';
import { curveSegmentPropertySet, curveSegmentSectionSet } from '@/curve/model/curve_edit.js';
import { curveFromPolyline, type Curve } from '@/curve/model/curve_model.js';
import { CURVE_CROSS_ARM_DEFAULT, CURVE_CROSS_ARM_MAX } from '@/curve/model/curve_section.js';
import { generatorRevolveStationsFromCurve } from '@/generator/revolve/generator_revolve_curve.js';
import { generatorRevolveRuns } from '@/generator/revolve/generator_revolve_profile.js';
import {
  generatorRevolveBrushes,
  generatorRevolveRing,
  generatorRevolveSectionFrame,
  type GeneratorRevolveFrame,
} from '@/generator/revolve/generator_revolve_brush.js';
import { generatorRevolveSurfaces, generatorRevolveUvLayout } from '@/generator/revolve/generator_revolve_surface.js';
import { generatorRevolveSmoothClasses } from '@/generator/revolve/generator_revolve_shading.js';
import { MODIFIER_SMOOTH_FLAT } from '@/modifier/smooth/modifier_smooth_shading.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidCsgCompiler } from '@/solid/algorithm/compile/solid_csg_compiler.js';
import { stackFixture } from '../../modifier/stack/modifier_stack_fixture.js';

/**
 * Builds a profile whose segments all use the cross section.
 *
 * @param polyline Profile points.
 * @param armWidth Optional arm width.
 * @returns Cross profile.
 */
function crossCurve(polyline: [number, number][], armWidth?: number): Curve {
  const curve = curveFromPolyline(polyline);
  const indices = curve.segments.map((_, index) => index);
  const cross = curveSegmentSectionSet(curve, indices, 'cross');
  return armWidth === undefined ? cross : curveSegmentPropertySet(cross, indices, 'armWidth', armWidth);
}

/**
 * Revolves a profile at a frame centred away from the origin.
 *
 * @param curve Profile.
 * @param aspect Depth divided by width.
 * @returns Frame, stations and brushes.
 */
function revolve(curve: Curve, aspect = 1) {
  const frame: GeneratorRevolveFrame = { center: new THREE.Vector3(1, 2, 3), sides: 8, aspect };
  const stations = generatorRevolveStationsFromCurve(curve, 2, 1);
  return { frame, stations, brushes: generatorRevolveBrushes(frame, generatorRevolveRuns(stations)) };
}

/**
 * Sums the area of compiled CSG polygons.
 *
 * @param polygons Polygons with ordered vertices.
 * @returns Total area.
 */
function polygonArea(polygons: readonly { vertices: THREE.Vector3[] }[]): number {
  let area = 0;
  for (const { vertices } of polygons) {
    const [first] = vertices;
    for (let index = 1; first && index + 1 < vertices.length; index++) {
      const edgeA = (vertices[index] ?? first).clone().sub(first);
      area += edgeA.cross((vertices[index + 1] ?? first).clone().sub(first)).length() / 2;
    }
  }
  return area;
}

/**
 * Returns a face's corners.
 *
 * @param brush Brush.
 * @param face Face index.
 * @returns Corner positions.
 */
function faceCorners(brush: SolidBrush, face: number): THREE.Vector3[] {
  const loop = brush.faces[face];
  return loop ? brush.getFaceVertexIndices(loop).map((corner) => brush.vertices[corner] ?? new THREE.Vector3()) : [];
}

/**
 * Returns whether a point lies on the outline of a ring.
 *
 * @param point Point at the ring height.
 * @param ring Closed outline.
 * @returns True when it is on one of the outline edges.
 */
function onOutline(point: THREE.Vector3, ring: readonly THREE.Vector3[]): boolean {
  return ring.some((start, index) => {
    const segment = new THREE.Line3(start, ring[(index + 1) % ring.length] ?? start);
    return segment.closestPointToPoint(point, true, new THREE.Vector3()).distanceTo(point) < 1e-6;
  });
}

describe('cross column sections', () => {
  it('stores the arm width in the profile text and repairs it', () => {
    const curve = crossCurve(
      [
        [0, 0.8],
        [1, 0.8],
      ],
      0.2,
    );
    expect(curveDecode(curveEncode(curve))).toEqual(curve);
    expect(
      crossCurve([
        [0, 1],
        [1, 1],
      ]).segments[0]?.armWidth,
    ).toBe(CURVE_CROSS_ARM_DEFAULT);
    expect(
      crossCurve(
        [
          [0, 1],
          [1, 1],
        ],
        4,
      ).segments[0]?.armWidth,
    ).toBe(CURVE_CROSS_ARM_MAX);
    expect(curveSegmentSectionSet(curve, [0], 'square').segments[0]?.armWidth).toBeUndefined();
  });

  it('outlines a plus whose two arms keep the same thickness when the depth is stretched', () => {
    const station = { height: 0, radius: 1, crossArm: 0.25 };
    const frame = generatorRevolveSectionFrame({ center: new THREE.Vector3(), sides: 8, aspect: 2 }, station);
    const ring = generatorRevolveRing(frame, station);
    expect(ring).toHaveLength(12);
    const xs = ring.map((point) => Math.abs(point.x));
    const zs = ring.map((point) => Math.abs(point.z));
    expect(Math.max(...xs)).toBeCloseTo(1, 9);
    expect(Math.max(...zs)).toBeCloseTo(2, 9);
    expect(Math.min(...xs)).toBeCloseTo(0.25, 9);
    expect(Math.min(...zs)).toBeCloseTo(0.25, 9);
  });

  it('builds a centre and four arms that touch without overlapping', () => {
    const { brushes } = revolve(
      crossCurve([
        [0, 0.8],
        [1, 0.8],
      ]),
    );
    expect(brushes).toHaveLength(5);
    for (const brush of brushes) {
      expect(SolidBrushValidator.validateGenerated(brush).valid).toBe(true);
      expect(brush.faces).toHaveLength(6);
    }
    const volume = brushes.reduce((sum, brush) => {
      const size = brush.computeLocalBounds().getSize(new THREE.Vector3());
      return sum + size.x * size.y * size.z;
    }, 0);
    const half = 0.3 * 0.8;
    expect(volume).toBeCloseTo((8 * half * 0.8 - 4 * half * half) * 2, 9);
  });

  it('compiles to the exact outer surface of a tapered cross with no inner faces', () => {
    const profile = curveEncode(
      crossCurve([
        [0, 0.8],
        [0.5, 0.8],
        [1, 0.4],
      ]),
    );
    const fixture = stackFixture([{ kind: 'column', parameters: { profile, sides: '8' } }], 1);
    const polygons = new SolidCsgCompiler().compile(fixture.compile().instances.slice(1), { forceFull: true });
    const arm = 0.3;
    const cap = (radius: number) => (8 * arm - 4 * arm * arm) * radius * radius;
    const slant = (inset: number, along: number) => along * Math.hypot(0.5, inset);
    const sides = 8 * 0.4 * 0.5 + 4 * slant(0.2, 2 * arm * 0.3) + 8 * slant(0.2 * arm, (1 - arm) * 0.3);
    expect(polygonArea(polygons)).toBeCloseTo(cap(0.4) + cap(0.2) + sides, 6);
  });

  it('twists into valid pieces that still reach the full arm length', () => {
    const curve = curveSegmentPropertySet(
      crossCurve([
        [0, 0.8],
        [1, 0.8],
      ]),
      [0],
      'twist',
      90,
    );
    const { brushes, frame } = revolve(curve);
    expect(brushes.length).toBeGreaterThan(5);
    expect(brushes.length % 5).toBe(0);
    for (const brush of brushes) expect(SolidBrushValidator.validateGenerated(brush).valid).toBe(true);
    const reach = Math.max(
      ...brushes.flatMap((brush) =>
        brush.vertices.map((vertex) => vertex.distanceTo(frame.center.clone().setY(vertex.y))),
      ),
    );
    expect(reach).toBeCloseTo(0.8 * Math.hypot(1, 0.3), 6);
  });

  it('wraps the texture once around the twelve outline edges with matching U at shared corners', () => {
    const { brushes, frame, stations } = revolve(
      crossCurve([
        [0, 0.8],
        [1, 0.8],
      ]),
    );
    const layout = generatorRevolveUvLayout(stations, frame.sides, { mode: 'stretch', around: 1, along: 1 });
    const section = generatorRevolveSectionFrame(frame, stations[0] ?? false);
    const ring = generatorRevolveRing(section, { height: 0, radius: 0.8 }).map((point) => point.setY(frame.center.y));
    const byCorner = new Map<string, number[]>();
    const slices = new Set<number>();
    for (const brush of brushes) {
      const surfaces = generatorRevolveSurfaces(brush, section, layout);
      brush.planes.forEach((plane, face) => {
        const corners = faceCorners(brush, face);
        const bottom = corners.map((corner) => corner.clone().setY(frame.center.y));
        const centre = corners
          .reduce((sum, corner) => sum.add(corner), new THREE.Vector3())
          .divideScalar(corners.length);
        const outer = [...bottom, centre.clone().setY(frame.center.y)].every((point) => onOutline(point, ring));
        if (Math.abs(plane.normal.y) > 0.5 || !outer) return;
        slices.add(Math.round(((surfaces[face]?.uv.project(centre).u ?? 0) + 1) * 24) % 24);
        for (const corner of corners) {
          const key = `${corner.x.toFixed(5)},${corner.y.toFixed(5)},${corner.z.toFixed(5)}`;
          byCorner.set(key, [...(byCorner.get(key) ?? []), surfaces[face]?.uv.project(corner).u ?? 0]);
        }
      });
    }
    expect(slices.size).toBe(12);
    for (const us of byCorner.values()) {
      expect(us).toHaveLength(2);
      const difference = Math.abs((us[0] ?? 0) - (us[1] ?? 0)) % 1;
      expect(Math.min(difference, 1 - difference)).toBeCloseTo(0, 9);
    }
  });

  it('keeps every side of an untwisted cross flat shaded', () => {
    const { brushes, frame, stations } = revolve(
      crossCurve([
        [0, 0.8],
        [1, 0.8],
      ]),
    );
    const section = generatorRevolveSectionFrame(frame, stations[0] ?? false);
    for (const brush of brushes)
      expect(generatorRevolveSmoothClasses(brush, section).every((value) => value === MODIFIER_SMOOTH_FLAT)).toBe(true);
  });

  it('builds a bar as one flat rectangular brush whose thickness ignores the depth stretch', () => {
    const curve = curveSegmentPropertySet(
      curveSegmentSectionSet(
        curveFromPolyline([
          [0, 0.8],
          [1, 0.8],
        ]),
        [0],
        'bar',
      ),
      [0],
      'armWidth',
      0.2,
    );
    expect(curveDecode(curveEncode(curve))).toEqual(curve);
    const { brushes, frame, stations } = revolve(curve, 2);
    expect(brushes).toHaveLength(1);
    const brush = brushes[0]!;
    expect(brush.faces).toHaveLength(6);
    const size = brush.computeLocalBounds().getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(1.6, 9);
    expect(size.z).toBeCloseTo(2 * 0.2 * 0.8, 9);
    const section = generatorRevolveSectionFrame(frame, stations[0] ?? false);
    expect(generatorRevolveSmoothClasses(brush, section).every((value) => value === MODIFIER_SMOOTH_FLAT)).toBe(true);
  });

  it.each(['bar', 'square'] as const)('keeps the apex when a flat %s section tapers to a point', (section) => {
    const curve = curveSegmentSectionSet(
      curveFromPolyline([
        [0, 0.8],
        [0.6, 0.8],
        [1, 0],
      ]),
      [0, 1],
      section,
    );
    const { brushes } = revolve(curve);
    const tops = brushes.map((brush) => Math.max(...brush.vertices.map((vertex) => vertex.y)));
    expect(Math.max(...tops)).toBeCloseTo(4, 9);
    for (const brush of brushes) expect(SolidBrushValidator.validateGenerated(brush).valid).toBe(true);
  });

  it('tapers a cross to a point as one apex for every piece', () => {
    const { brushes, frame } = revolve(
      crossCurve([
        [0, 0.8],
        [1, 0],
      ]),
    );
    expect(brushes).toHaveLength(5);
    for (const brush of brushes) {
      expect(SolidBrushValidator.validateGenerated(brush).valid).toBe(true);
      const top = Math.max(...brush.vertices.map((vertex) => vertex.y));
      const apex = brush.vertices.filter((vertex) => Math.abs(vertex.y - top) < 1e-9);
      expect(apex).toHaveLength(1);
      expect(apex[0]!.distanceTo(new THREE.Vector3(frame.center.x, top, frame.center.z))).toBeCloseTo(0, 9);
    }
  });
});
