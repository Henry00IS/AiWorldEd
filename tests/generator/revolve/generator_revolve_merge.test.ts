import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import example from './fixtures/example.json';
import { curveFromData } from '@/curve/model/curve_codec.js';
import { curvePresetBuild } from '@/curve/model/curve_preset.js';
import { generatorRevolveStationsFromCurve } from '@/generator/revolve/generator_revolve_curve.js';
import { generatorRevolveRuns, generatorRevolvePieceSolid } from '@/generator/revolve/generator_revolve_profile.js';
import { curveSegmentSectionSet } from '@/curve/model/curve_edit.js';
import { curveFromPolyline, type CurveSegmentSection } from '@/curve/model/curve_model.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { generatorRevolveSurfaces, generatorRevolveUvLayout } from '@/generator/revolve/generator_revolve_surface.js';
import { generatorRevolveBrushes, generatorRevolveSectionFrame } from '@/generator/revolve/generator_revolve_brush.js';

/**
 * Builds a single cubic outward bulge with eight sampled pieces.
 *
 * @returns A profile whose solid is convex.
 */
function bulge() {
  return curvePresetBuild({
    id: 'bulge',
    label: 'Bulge',
    tooltip: '',
    start: 0.2,
    steps: [['B', 1, 0.2, 1 / 3, 1, 2 / 3, 1]],
    markers: { bottom: 0.2, top: 0.8 },
  });
}

/**
 * Measures unmerged sampled pieces and validated convex brush count.
 *
 * @param curve Profile under test.
 * @returns Sampled pieces and actual brushes.
 */
function counts(curve: ReturnType<typeof bulge>) {
  const stations = generatorRevolveStationsFromCurve(curve, 4, 1);
  const sampled = stations.slice(1).filter((end, index) => {
    const start = stations[index];
    return start && generatorRevolvePieceSolid(start, end);
  }).length;
  const brushes = generatorRevolveBrushes({ center: new THREE.Vector3(), sides: 16 }, generatorRevolveRuns(stations));
  for (const brush of brushes) expect(SolidBrushValidator.validateGenerated(brush).valid).toBe(true);
  return [sampled, brushes.length];
}

/**
 * Documents actual brush counts, including the owner's original profile and new
 * non-round sections.
 */
describe('convex column brush merging', () => {
  it('already reduces the original Example from 22 sampled pieces to 13 convex brushes', () => {
    const curve = curveFromData(example.curve);
    if (!curve) throw new Error('Expected the original Example profile');
    expect(counts(curve)).toEqual([22, 13]);
  });

  it.each<CurveSegmentSection>(['round', 'square', 'rounded_square'])(
    'merges the eight-piece outward Bezier into one %s brush',
    (section) => {
      expect(counts(curveSegmentSectionSet(bulge(), [0], section))).toEqual([8, 1]);
    },
  );

  it('merges a straight shaft and never bridges inward bends or shape changes', () => {
    expect(
      counts(
        curveFromPolyline([
          [0, 0.8],
          [0.25, 0.8],
          [0.5, 0.8],
          [0.75, 0.8],
          [1, 0.8],
        ]),
      ),
    ).toEqual([4, 1]);
    const inward = curveFromPolyline([
      [0, 0.8],
      [0.5, 0.2],
      [1, 0.8],
    ]);
    expect(counts(inward)).toEqual([2, 2]);
    const straight = curveFromPolyline([
      [0, 0.8],
      [0.5, 0.8],
      [1, 0.8],
    ]);
    expect(counts(curveSegmentSectionSet(straight, [0], 'rounded_square'))).toEqual([2, 2]);
  });

  it('keeps every curved-band UV identical to the unmerged result', () => {
    const curve = curveSegmentSectionSet(bulge(), [0], 'rounded_square');
    const stations = generatorRevolveStationsFromCurve(curve, 4, 1);
    const frame = { center: new THREE.Vector3(), sides: 16, aspect: 1.4 };
    const section = generatorRevolveSectionFrame(frame, stations[0] ?? false);
    const layout = generatorRevolveUvLayout(stations, 16, { mode: 'tile', around: 3, along: 2 }, 1.4);
    const pieces = stations.slice(1).map((station, index) => [stations[index] ?? station, station]);
    const surfaces = (runs: typeof pieces) =>
      generatorRevolveBrushes(frame, runs)
        .flatMap((brush) => {
          const mapped = generatorRevolveSurfaces(brush, section, layout);
          return brush.faces.flatMap((face, index) => {
            if (Math.abs(brush.planes[index]?.normal.y ?? 1) > 0.999) return [];
            return brush
              .getFaceVertices(face)
              .map((point) => ({ point: point.toArray(), uv: mapped[index]?.uv.project(point) }));
          });
        })
        .sort((a, b) => JSON.stringify(a.point).localeCompare(JSON.stringify(b.point)));
    expect(surfaces(generatorRevolveRuns(stations))).toEqual(surfaces(pieces));
  });
});
