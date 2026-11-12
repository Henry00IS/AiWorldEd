import exampleData from './fixtures/example.json';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { curveFromData } from '@/curve/model/curve_codec.js';
import type { Curve } from '@/curve/model/curve_model.js';
import { generatorRevolveBrushes, type GeneratorRevolveFrame } from '@/generator/revolve/generator_revolve_brush.js';
import { generatorRevolveStationsFromCurve } from '@/generator/revolve/generator_revolve_curve.js';
import { generatorRevolveRuns, type GeneratorRevolveStation } from '@/generator/revolve/generator_revolve_profile.js';
import {
  generatorRevolveSurfaces,
  generatorRevolveUvLayout,
  type GeneratorRevolveWrap,
} from '@/generator/revolve/generator_revolve_surface.js';

/** UV of one side-face corner with what bounds its error. */
interface CornerUv {
  u: number;
  v: number;
  /** Largest U error a tapered face can have at this corner. */
  slack: number;
}

/**
 * Revolves a curve and maps its sides.
 *
 * @param curve Profile.
 * @param sides Side count.
 * @param wrap Wrap options.
 * @returns Side corners by position, the frame and the layout length.
 */
function revolve(curve: Curve, sides: number, wrap: GeneratorRevolveWrap) {
  const frame: GeneratorRevolveFrame = { center: new THREE.Vector3(1, 2, 3), sides };
  const stations = generatorRevolveStationsFromCurve(curve, 4, 1);
  const brushes = generatorRevolveBrushes(frame, generatorRevolveRuns(stations));
  const layout = generatorRevolveUvLayout(stations, sides, wrap);
  const corners = new Map<string, CornerUv[]>();
  for (const brush of brushes) sideCorners(brush, frame, layout, corners);
  return { corners, frame, brushes, layout, stations };
}

/**
 * Collects the UVs of every side-face corner.
 *
 * @param brush Brush.
 * @param frame Frame.
 * @param layout Layout.
 * @param corners Output map by corner position.
 */
function sideCorners(
  brush: ReturnType<typeof generatorRevolveBrushes>[number],
  frame: GeneratorRevolveFrame,
  layout: ReturnType<typeof generatorRevolveUvLayout>,
  corners: Map<string, CornerUv[]>,
): void {
  const surfaces = generatorRevolveSurfaces(brush, frame, layout);
  brush.faces.forEach((face, index) => {
    const surface = surfaces[index];
    if (!surface || Math.abs(brush.planes[index]?.normal.y ?? 1) > 0.999) return;
    const points = brush.getFaceVertexIndices(face).map((corner) => brush.vertices[corner] ?? new THREE.Vector3());
    const radii = points.map((point) => Math.hypot(point.x - frame.center.x, point.z - frame.center.z));
    const middle = (Math.max(...radii) + Math.min(...radii)) / 2;
    points.forEach((point, at) => {
      const key = `${point.x.toFixed(5)},${point.y.toFixed(5)},${point.z.toFixed(5)}`;
      const slack = (layout.around * Math.abs((radii[at] ?? 0) / Math.max(middle, 1e-9) - 1)) / (2 * frame.sides);
      corners.set(key, [...(corners.get(key) ?? []), { ...surface.uv.project(point), slack }]);
    });
  });
}

/**
 * Returns the U difference across the seam-aware wrap.
 *
 * @param a First U.
 * @param b Second U.
 * @param around Repeats around.
 * @returns Smallest difference modulo the wrap.
 */
function wrapDifference(a: number, b: number, around: number): number {
  const raw = Math.abs(a - b) % around;
  return Math.min(raw, around - raw);
}

/**
 * Returns the example curve.
 *
 * @returns Curve.
 */
function example(): Curve {
  const curve = curveFromData(exampleData.curve);
  if (!curve) throw new Error('Expected the example curve');
  return curve;
}

describe('revolve surfaces', () => {
  it('runs V continuously along the whole Example profile across faces and stacked pieces', () => {
    const { corners, brushes } = revolve(example(), 8, { mode: 'stretch', around: 1, along: 1 });
    expect(brushes.length).toBeGreaterThan(1);
    let shared = 0;
    for (const uvs of corners.values()) {
      if (uvs.length < 2) continue;
      shared++;
      for (const uv of uvs) expect(uv.v).toBeCloseTo(uvs[0]?.v ?? 0, 6);
    }
    expect(shared).toBeGreaterThan(50);
    const vs = [...corners.values()].flat().map((uv) => uv.v);
    expect(Math.min(...vs)).toBeCloseTo(0, 6);
    expect(Math.max(...vs)).toBeCloseTo(1, 6);
  });

  it('keeps U on shared edges within the taper bound, exact on straight sections', () => {
    const { corners } = revolve(example(), 8, { mode: 'stretch', around: 1, along: 1 });
    for (const uvs of corners.values()) {
      const [first, ...rest] = uvs;
      for (const uv of rest) {
        if (!first) continue;
        const bound = first.slack + uv.slack + 1e-6;
        expect(wrapDifference(first.u, uv.u, 1)).toBeLessThanOrEqual(bound);
      }
    }
  });

  it('closes the seam exactly and gives every side face its own slice', () => {
    const straight = curveFromData({
      points: [
        [0, 0.6, 0, 0, 0, 0],
        [1, 0.6, 0, 0, 0, 0],
      ],
      segments: [['linear', 1]],
    });
    if (!straight) throw new Error('Expected curves');
    const { corners } = revolve(straight, 6, { mode: 'stretch', around: 1, along: 1 });
    const us = [...corners.values()].flat().map((uv) => uv.u);
    expect(Math.min(...us)).toBeCloseTo(0, 9);
    expect(Math.max(...us)).toBeCloseTo(1, 9);
    for (const uvs of corners.values()) {
      const [first, second] = uvs;
      if (first && second) expect(wrapDifference(first.u, second.u, 1)).toBeCloseTo(0, 9);
    }
    const slices = new Set(us.map((u) => Math.round(u * 6)));
    expect(slices.size).toBe(7);
  });

  it('tiles whole repeats around and along, or square tiles at the widest ring', () => {
    const straight = curveFromData({
      points: [
        [0, 0.5, 0, 0, 0, 0],
        [1, 0.5, 0, 0, 0, 0],
      ],
      segments: [['linear', 1]],
    });
    if (!straight) throw new Error('Expected a curve');
    const tiled = revolve(straight, 8, { mode: 'tile', around: 3, along: 2 });
    const all = [...tiled.corners.values()].flat();
    expect(Math.max(...all.map((uv) => uv.u)) - Math.min(...all.map((uv) => uv.u))).toBeCloseTo(3, 9);
    expect(Math.max(...all.map((uv) => uv.v))).toBeCloseTo(2, 9);
    const square = revolve(straight, 8, { mode: 'tile', around: 2, along: 'density' });
    const perimeter = 8 * 2 * 0.5 * Math.sin(Math.PI / 8);
    const top = Math.max(...[...square.corners.values()].flat().map((uv) => uv.v));
    expect(top).toBeCloseTo(4 / (perimeter / 2), 6);
  });

  it('maps caps planar, centred on the axis', () => {
    const { brushes, frame, layout } = revolve(example(), 8, { mode: 'stretch', around: 1, along: 1 });
    const bottom = brushes[0];
    if (!bottom) throw new Error('Expected a brush');
    const surfaces = generatorRevolveSurfaces(bottom, frame, layout);
    const cap = bottom.planes.findIndex((plane) => plane.normal.y < -0.999);
    const uv = surfaces[cap]?.uv.project(frame.center);
    expect(uv?.u).toBeCloseTo(0.5, 9);
    expect(uv?.v).toBeCloseTo(0.5, 9);
  });

  it('keeps stations unchanged for unit stations', () => {
    const stations: GeneratorRevolveStation[] = [
      { height: 0, radius: 1 },
      { height: 1, radius: 1 },
    ];
    expect(generatorRevolveUvLayout(stations, 4, { mode: 'stretch', around: 1, along: 1 }).arcs[1]?.length).toBe(1);
  });
});
