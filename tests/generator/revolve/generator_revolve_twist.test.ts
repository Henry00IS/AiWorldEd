import { generatorRevolveSmoothClasses } from '@/generator/revolve/generator_revolve_shading.js';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { curveFromPolyline } from '@/curve/model/curve_model.js';
import { curveSegmentPropertySet, curveSegmentSectionSet } from '@/curve/model/curve_edit.js';
import { generatorRevolveStationsFromCurve } from '@/generator/revolve/generator_revolve_curve.js';
import { generatorRevolveRuns } from '@/generator/revolve/generator_revolve_profile.js';
import { generatorRevolveBrushes, generatorRevolveSectionFrame } from '@/generator/revolve/generator_revolve_brush.js';
import { generatorRevolveUvLayout, generatorRevolveSurfaces } from '@/generator/revolve/generator_revolve_surface.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';

/** Verifies actual convex twisted brushes, not merely a sampled profile. */
describe('twisted convex lathe sections', () => {
  it.each(['square', 'rounded_square', 'chamfered_square', 'polygon'] as const)(
    'builds a convex %s quarter-turn without incorrectly merging the twist',
    (section) => {
      const curve = curveSegmentPropertySet(
        curveSegmentSectionSet(
          curveFromPolyline([
            [0, 0.6],
            [1, 0.6],
          ]),
          [0],
          section,
        ),
        [0],
        'twist',
        90,
      );
      const stations = generatorRevolveStationsFromCurve(curve, 4, 1);
      const runs = generatorRevolveRuns(stations);
      expect(runs).toHaveLength(18);
      expect(stations.at(-1)?.angle).toBe(90);
      const frame = { center: new THREE.Vector3(), sides: 24 };
      const brushes = generatorRevolveBrushes(frame, runs);
      expect(brushes).toHaveLength(runs.length);
      const layout = generatorRevolveUvLayout(stations, 24, { mode: 'stretch', around: 1, along: 1 });
      const sharedUvs = new Map<string, { u: number; v: number }>();
      const sideClasses = new Set<number>();
      brushes.forEach((brush, index) => {
        expect(SolidBrushValidator.validateGenerated(brush).valid).toBe(true);
        const sectionFrame = generatorRevolveSectionFrame(frame, runs[index]?.[0] ?? false);
        const surfaces = generatorRevolveSurfaces(brush, sectionFrame, layout);
        for (const value of generatorRevolveSmoothClasses(brush, sectionFrame)) if (value > 0) sideClasses.add(value);
        brush.faces.forEach((face, faceIndex) => {
          for (const point of brush.getFaceVertices(face)) {
            const uv = surfaces[faceIndex]?.uv.project(point);
            expect(Number.isFinite(uv?.u)).toBe(true);
            expect(Number.isFinite(uv?.v)).toBe(true);
            if (Math.abs(brush.planes[faceIndex]?.normal.y ?? 0) > 0.999 || !uv) continue;
            expect(uv.v).toBeCloseTo(point.y / 4, 5);
            const key = point
              .toArray()
              .map((value) => value.toFixed(6))
              .join(',');
            const previous = sharedUvs.get(key);
            if (previous) {
              expect(uv.v).toBeCloseTo(previous.v, 5);
              const delta = uv.u - previous.u;
              expect(delta - Math.round(delta)).toBeCloseTo(0, 5);
            }
            sharedUvs.set(key, uv);
          }
        });
      });
      expect(sideClasses.size).toBe(section === 'chamfered_square' ? 8 : section === 'polygon' ? 6 : 4);
    },
  );
});
