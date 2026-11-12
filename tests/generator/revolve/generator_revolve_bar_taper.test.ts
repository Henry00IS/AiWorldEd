import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { curveDecode, curveEncode } from '@/curve/model/curve_codec.js';
import { curveDeletePoint, curveInsertPoint, curveMirror, curveSegmentPropertySet } from '@/curve/model/curve_edit.js';
import { curveFromPolyline, type Curve } from '@/curve/model/curve_model.js';
import { curvePresetBuild } from '@/curve/model/curve_preset.js';
import { CURVE_PRESETS_PROPS_TOOLS } from '@/curve/model/curve_preset_props_tools.js';
import { generatorRevolveStationsFromCurve } from '@/generator/revolve/generator_revolve_curve.js';
import { generatorRevolveRuns } from '@/generator/revolve/generator_revolve_profile.js';
import { generatorRevolveBrushes, type GeneratorRevolveFrame } from '@/generator/revolve/generator_revolve_brush.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';

/**
 * Builds a bar profile whose segments taper from one thickness to another.
 *
 * @param polyline Profile points.
 * @param start Thickness at the bottom of every segment.
 * @param end Thickness at the top of every segment, or undefined for an even
 *   bar.
 * @returns Profile.
 */
function bar(polyline: [number, number][], start: number, end?: number): Curve {
  const curve = curveFromPolyline(polyline);
  curve.segments = curve.segments.map((segment) => ({
    ...segment,
    section: 'bar',
    armWidth: start,
    ...(end !== undefined ? { armWidthEnd: end } : {}),
  }));
  return curveDecode(curveEncode(curve)) ?? curve;
}

/**
 * Revolves a profile two metres tall with radius one.
 *
 * @param curve Profile.
 * @returns Brushes.
 */
function revolve(curve: Curve): SolidBrush[] {
  const frame: GeneratorRevolveFrame = { center: new THREE.Vector3(), sides: 8, aspect: 1 };
  return generatorRevolveBrushes(frame, generatorRevolveRuns(generatorRevolveStationsFromCurve(curve, 2, 1)));
}

/**
 * Returns the largest |z| of the brush vertices at one height.
 *
 * @param brushes Brushes.
 * @param height Height.
 * @returns Half thickness there.
 */
function thicknessAt(brushes: readonly SolidBrush[], height: number): number {
  const zs = brushes.flatMap((brush) =>
    brush.vertices.filter((vertex) => Math.abs(vertex.y - height) < 1e-9).map((vertex) => Math.abs(vertex.z)),
  );
  return Math.max(...zs);
}

describe('tapered bar sections', () => {
  it('stores the end thickness, a sharp 0 included, and drops it when the bar is even', () => {
    const sharp = bar(
      [
        [0, 1],
        [1, 1],
      ],
      0.4,
      0,
    );
    expect(sharp.segments[0]).toMatchObject({ armWidth: 0.4, armWidthEnd: 0 });
    expect(curveDecode(curveEncode(sharp))).toEqual(sharp);
    expect(
      bar(
        [
          [0, 1],
          [1, 1],
        ],
        0.4,
        0.4,
      ).segments[0]?.armWidthEnd,
    ).toBeUndefined();
    expect(
      curveEncode(
        bar(
          [
            [0, 1],
            [1, 1],
          ],
          0.4,
        ),
      ),
    ).not.toContain('null');
    expect(curveSegmentPropertySet(sharp, [0], 'armWidthEnd', 0.2).segments[0]?.armWidthEnd).toBe(0.2);
  });

  it('builds one smooth wedge brush that thins linearly to a sharp edge', () => {
    const brushes = revolve(
      bar(
        [
          [0, 1],
          [1, 1],
        ],
        0.4,
        0,
      ),
    );
    expect(brushes).toHaveLength(1);
    for (const brush of brushes) expect(SolidBrushValidator.validateGenerated(brush).valid).toBe(true);
    expect(thicknessAt(brushes, 0)).toBeCloseTo(0.4, 9);
    expect(thicknessAt(brushes, 2)).toBeCloseTo(0, 9);
    const sloped = brushes[0]?.planes.filter(
      (plane) => Math.abs(plane.normal.y) > 1e-6 && Math.abs(plane.normal.z) > 0.1,
    );
    expect(sloped?.length).toBe(2);
  });

  it('keeps the thickness continuous across segments of one taper and steps only where it jumps', () => {
    const preset = curvePresetBuild({
      id: 'wedge',
      label: 'Wedge',
      tooltip: 'Wedge.',
      markers: { bottom: 0.1, top: 0.9 },
      start: 1,
      steps: [
        ['L', 0.5, 1],
        ['L', 1, 1],
      ],
      sections: [{ from: 0, to: 1, section: 'bar', armWidth: 0.4, armWidthEnd: 0 }],
    });
    expect(preset.segments.map((segment) => [segment.armWidth, segment.armWidthEnd])).toEqual([
      [0.4, 0.2],
      [0.2, 0],
    ]);
    const smooth = revolve(preset);
    expect(thicknessAt(smooth, 1)).toBeCloseTo(0.2, 9);
    const jump = {
      ...preset,
      segments: preset.segments.map((segment, index) => (index ? { ...segment, armWidth: 0.3 } : segment)),
    };
    const stations = generatorRevolveStationsFromCurve(jump, 2, 1).filter(
      (station) => Math.abs(station.height - 1) < 1e-9,
    );
    expect(stations).toHaveLength(2);
  });

  it('splits, joins and mirrors the taper with the segments', () => {
    const sharp = bar(
      [
        [0, 1],
        [1, 1],
      ],
      0.4,
      0,
    );
    const { curve: split } = curveInsertPoint(sharp, 0.25);
    const values = split.segments.flatMap((segment) => [segment.armWidth ?? -1, segment.armWidthEnd ?? -1]);
    [0.4, 0.3, 0.3, 0].forEach((value, index) => expect(values[index]).toBeCloseTo(value, 9));
    expect(curveDeletePoint(split, 1).segments[0]).toMatchObject({ armWidth: 0.4, armWidthEnd: 0 });
    expect(curveMirror(sharp).segments[0]).toMatchObject({ armWidth: 0, armWidthEnd: 0.4 });
  });

  it('builds the flathead screwdriver blade as a smooth wedge, not stacked boxes', () => {
    const preset = CURVE_PRESETS_PROPS_TOOLS.find((entry) => entry.id === 'flathead_screwdriver');
    if (!preset) throw new Error('flathead screwdriver missing');
    const stations = generatorRevolveStationsFromCurve(curvePresetBuild(preset), 1, 1).filter(
      (station) => station.height >= 0.86 - 1e-9,
    );
    const heights = stations.map((station) => station.height);
    expect(new Set(heights).size).toBe(heights.length);
    const brushes = revolve(curvePresetBuild(preset));
    for (const brush of brushes) expect(SolidBrushValidator.validateGenerated(brush).valid).toBe(true);
  });
});
