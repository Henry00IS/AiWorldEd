import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { curveDecode, curveEncode } from '@/curve/model/curve_codec.js';
import { curveSegmentSectionSet } from '@/curve/model/curve_edit.js';
import { curveFromPolyline, type Curve, type CurveSegmentSection } from '@/curve/model/curve_model.js';
import { curveSegmentFixedDepthSet, curveSegmentSideSet } from '@/curve/model/curve_side.js';
import type { CurveSideChoice } from '@/curve/model/curve_section.js';
import { curveMovePoint } from '@/curve/model/curve_constrain.js';
import { generatorRevolveStationsFromCurve } from '@/generator/revolve/generator_revolve_curve.js';
import { generatorRevolveRuns } from '@/generator/revolve/generator_revolve_profile.js';
import {
  generatorRevolveBrushes,
  generatorRevolveSectionFrame,
  type GeneratorRevolveFrame,
} from '@/generator/revolve/generator_revolve_brush.js';
import {
  generatorRevolveStationAt,
  generatorRevolveSurfaces,
  generatorRevolveUvLayout,
} from '@/generator/revolve/generator_revolve_surface.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';

/**
 * Builds a profile whose segments all use one section and side mode.
 *
 * @param polyline Profile points.
 * @param section Cross-section.
 * @param side Side choice.
 * @param fixedDepth True keeps the depth fixed.
 * @returns Profile.
 */
function sidedCurve(
  polyline: [number, number][],
  section: CurveSegmentSection,
  side: CurveSideChoice,
  fixedDepth = false,
): Curve {
  const curve = curveFromPolyline(polyline);
  const indices = curve.segments.map((_, index) => index);
  const shaped = curveSegmentSideSet(curveSegmentSectionSet(curve, indices, section), indices, side);
  return curveSegmentFixedDepthSet(shaped, indices, fixedDepth);
}

/**
 * Revolves a profile two metres tall with radius one at a frame away from the
 * origin.
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
 * Measures the bounds of brushes relative to the frame centre.
 *
 * @param brushes Brushes.
 * @param frame Frame.
 * @returns Bounds around the axis.
 */
function bounds(brushes: readonly SolidBrush[], frame: GeneratorRevolveFrame): THREE.Box3 {
  const box = new THREE.Box3();
  for (const brush of brushes) for (const vertex of brush.vertices) box.expandByPoint(vertex.clone().sub(frame.center));
  return box;
}

/**
 * Returns the extents of the brush vertices at one height.
 *
 * @param brushes Brushes.
 * @param frame Frame.
 * @param height Height above the frame base.
 * @returns Bounds of the vertices at that height.
 */
function slice(brushes: readonly SolidBrush[], frame: GeneratorRevolveFrame, height: number): THREE.Box3 {
  const box = new THREE.Box3();
  for (const brush of brushes)
    for (const vertex of brush.vertices)
      if (Math.abs(vertex.y - frame.center.y - height) < 1e-9) box.expandByPoint(vertex.clone().sub(frame.center));
  return box;
}

describe('sided column sections', () => {
  it('stores side modes, fixed depth and the secondary line, and leaves plain curves unchanged', () => {
    const plain = sidedCurve(
      [
        [0, 0.5],
        [1, 0.8],
      ],
      'square',
      'mirror',
    );
    expect(curveEncode(plain)).not.toContain('secondary');
    expect(plain.segments[0]?.side).toBeUndefined();
    const custom = sidedCurve(
      [
        [0, 0.5],
        [1, 0.8],
      ],
      'stadium',
      'custom',
      true,
    );
    expect(custom.secondary?.points).toHaveLength(2);
    expect(custom.segments[0]).toMatchObject({ side: 'custom', fixedDepth: true });
    expect(curveDecode(curveEncode(custom))).toEqual(custom);
    expect(curveSegmentSectionSet(custom, [0], 'round').segments[0]?.side).toBeUndefined();
    expect(curveSegmentSectionSet(custom, [0], 'bar').segments[0]?.fixedDepth).toBeUndefined();
  });

  it('builds the same brushes for mirrored sides as before side modes existed', () => {
    const polyline: [number, number][] = [
      [0, 0.4],
      [0.5, 0.6],
      [1, 1],
    ];
    const plain = revolve(curveSegmentSectionSet(curveFromPolyline(polyline), [0, 1], 'square'));
    const mirrored = revolve(sidedCurve(polyline, 'square', 'mirror'));
    expect(mirrored.stations).toEqual(plain.stations);
    expect(mirrored.brushes.map((brush) => brush.vertices)).toEqual(plain.brushes.map((brush) => brush.vertices));
  });

  it.each([
    ['positive', 1, -0.4],
    ['negative', 0.4, -1],
  ] as const)('grows only one side in %s mode and keeps the other at the narrowest value', (side, right, left) => {
    const { brushes, frame } = revolve(
      sidedCurve(
        [
          [0, 0.4],
          [1, 1],
        ],
        'square',
        side,
      ),
    );
    for (const brush of brushes) expect(SolidBrushValidator.validateGenerated(brush).valid).toBe(true);
    const top = slice(brushes, frame, 2);
    expect(top.max.x).toBeCloseTo(right, 9);
    expect(top.min.x).toBeCloseTo(left, 9);
    expect(top.max.z).toBeCloseTo(0.7, 9);
    const bottom = slice(brushes, frame, 0);
    expect(bottom.max.x).toBeCloseTo(0.4, 9);
    expect(bottom.min.x).toBeCloseTo(-0.4, 9);
  });

  it('keeps the depth of the lowest ring when the depth is fixed', () => {
    const { brushes, frame } = revolve(
      sidedCurve(
        [
          [0, 0.4],
          [1, 1],
        ],
        'square',
        'mirror',
        true,
      ),
      0.5,
    );
    const box = bounds(brushes, frame);
    expect(box.max.x).toBeCloseTo(1, 9);
    expect(box.max.z).toBeCloseTo(0.2, 9);
    expect(box.min.z).toBeCloseTo(-0.2, 9);
  });

  it('shapes the -X side of custom pieces with the secondary line, sliced at its points', () => {
    const custom = sidedCurve(
      [
        [0, 0.5],
        [1, 0.5],
      ],
      'bar',
      'custom',
    );
    const secondary = curveMovePoint(
      { points: custom.secondary?.points ?? [], segments: custom.secondary?.segments ?? [] },
      1,
      1,
      0.9,
    );
    const inserted = { ...custom, secondary: { points: secondary.points, segments: secondary.segments } };
    const { brushes, frame, stations } = revolve(inserted);
    expect(stations.map((station) => station.height)).toEqual([0, 2]);
    const top = slice(brushes, frame, 2);
    expect(top.max.x).toBeCloseTo(0.5, 9);
    expect(top.min.x).toBeCloseTo(-0.9, 9);
    expect(top.max.z).toBeCloseTo(0.3 * 0.7, 9);
  });

  it('slices custom pieces at interior points of the secondary line', () => {
    const custom = sidedCurve(
      [
        [0, 0.5],
        [1, 0.5],
      ],
      'bar',
      'custom',
    );
    const line = curveFromPolyline([
      [0, 0.5],
      [0.3, 0.9],
      [1, 0.2],
    ]);
    const { brushes, frame, stations } = revolve({
      ...custom,
      secondary: { points: line.points, segments: line.segments },
    });
    expect(stations.map((station) => station.height)).toEqual([0, 0.6, 2]);
    for (const brush of brushes) expect(SolidBrushValidator.validateGenerated(brush).valid).toBe(true);
    expect(slice(brushes, frame, 0.6).min.x).toBeCloseTo(-0.9, 9);
    expect(slice(brushes, frame, 0.6).max.x).toBeCloseTo(0.5, 9);
    expect(slice(brushes, frame, 2).min.x).toBeCloseTo(-0.2, 9);
  });

  it('keeps the base depth up to the apex of a fixed-depth gable', () => {
    const { brushes, frame } = revolve(
      sidedCurve(
        [
          [0, 1],
          [0.5, 1],
          [1, 0],
        ],
        'square',
        'mirror',
        true,
      ),
      0.2,
    );
    for (const brush of brushes) expect(SolidBrushValidator.validateGenerated(brush).valid).toBe(true);
    const ridge = slice(brushes, frame, 2);
    expect(ridge.max.x).toBeCloseTo(0, 9);
    expect(ridge.max.z).toBeCloseTo(0.2, 9);
    expect(ridge.min.z).toBeCloseTo(-0.2, 9);
  });

  it('flares both sides of a fixed-depth pier concavely into valid convex slices', () => {
    const curve = sidedCurve(
      [
        [0, 0.3],
        [0.6, 0.3],
        [0.8, 0.45],
        [0.9, 0.7],
        [1, 1],
      ],
      'square',
      'mirror',
      true,
    );
    const { brushes, frame } = revolve(curve);
    expect(brushes.length).toBeGreaterThan(1);
    for (const brush of brushes) expect(SolidBrushValidator.validateGenerated(brush).valid).toBe(true);
    const box = bounds(brushes, frame);
    expect(box.max.x).toBeCloseTo(1, 9);
    expect(box.min.x).toBeCloseTo(-1, 9);
    expect(box.max.z).toBeCloseTo(0.3, 9);
  });

  it('keeps the round ends of a fixed-depth stadium and lengthens its flat sides', () => {
    const { brushes, frame } = revolve(
      sidedCurve(
        [
          [0, 0.5],
          [1, 1],
        ],
        'stadium',
        'positive',
        true,
      ),
    );
    for (const brush of brushes) expect(SolidBrushValidator.validateGenerated(brush).valid).toBe(true);
    const top = slice(brushes, frame, 2);
    expect(top.max.x).toBeCloseTo(1, 9);
    expect(top.min.x).toBeCloseTo(-0.5, 9);
    expect(top.max.z).toBeCloseTo(0.25, 9);
  });

  it('wraps sided pieces with finite UVs that start at the bottom', () => {
    const { brushes, frame, stations } = revolve(
      sidedCurve(
        [
          [0, 0.4],
          [1, 1],
        ],
        'square',
        'positive',
        true,
      ),
    );
    const layout = generatorRevolveUvLayout(stations, frame.sides, { mode: 'stretch', around: 1, along: 1 });
    for (const brush of brushes) {
      const bottom = Math.min(...brush.vertices.map((vertex) => vertex.y)) - frame.center.y;
      const section = generatorRevolveSectionFrame(frame, generatorRevolveStationAt(stations, bottom) ?? false);
      const surfaces = generatorRevolveSurfaces(brush, section, layout);
      brush.planes.forEach((plane, face) => {
        if (Math.abs(plane.normal.y) > 0.5) return;
        const lowest = brush.vertices.reduce((low, vertex) => (vertex.y < low.y ? vertex : low));
        const uv = surfaces[face]?.uv.project(lowest);
        expect(Number.isFinite(uv?.u)).toBe(true);
        expect(Number.isFinite(uv?.v)).toBe(true);
      });
    }
  });
});
