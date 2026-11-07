import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { curveFromData } from '@/curve/model/curve_codec.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import {
  generatorRevolveBrushes,
  generatorRevolveSectionFrame,
  type GeneratorRevolveFrame,
} from '@/generator/revolve/generator_revolve_brush.js';
import { generatorRevolveStationsFromCurve } from '@/generator/revolve/generator_revolve_curve.js';
import { generatorRevolveRuns } from '@/generator/revolve/generator_revolve_profile.js';
import {
  generatorRevolveSquareAt,
  generatorRevolveSurfaces,
  generatorRevolveUvLayout,
} from '@/generator/revolve/generator_revolve_surface.js';

/**
 * Square foot tapering in, round shaft, square top flaring out like a trumpet
 * along a Bezier.
 */
const PROFILE = {
  points: [
    [0, 0.9, 0, 0, 0, 0],
    [0.25, 0.6, 0, 0, 0, 0],
    [0.25, 0.4, 0, 0, 0, 0],
    [0.7, 0.4, 0, 0, 0, 0],
    [1, 0.95, -0.25, -0.5, 0, 0],
  ],
  segments: [
    ['linear', 8, 's'],
    ['linear', 8],
    ['linear', 8],
    ['bezier', 8, 's'],
  ],
};

/**
 * Revolves the profile with 8 round sides.
 *
 * @param profile Profile data.
 * @returns Brushes, stations, frame and layout.
 */
function build(profile: typeof PROFILE = PROFILE) {
  const curve = curveFromData(profile);
  if (!curve) throw new Error('Expected the profile');
  const frame: GeneratorRevolveFrame = { center: new THREE.Vector3(), sides: 8 };
  const stations = generatorRevolveStationsFromCurve(curve, 3, 1);
  const brushes = generatorRevolveBrushes(frame, generatorRevolveRuns(stations));
  const layout = generatorRevolveUvLayout(stations, 8, { mode: 'stretch', around: 1, along: 1 });
  const square = (brush: SolidBrush) =>
    generatorRevolveSquareAt(stations, Math.min(...brush.vertices.map((vertex) => vertex.y)));
  return { brushes, frame, layout, square };
}

/**
 * Returns the side faces of a brush with their normal and corner UVs.
 *
 * @param brush Brush.
 * @param frame Frame of its section.
 * @param layout Layout.
 * @returns Side faces.
 */
function sides(brush: SolidBrush, frame: GeneratorRevolveFrame, layout: ReturnType<typeof generatorRevolveUvLayout>) {
  const surfaces = generatorRevolveSurfaces(brush, frame, layout);
  return brush.faces.flatMap((face, index) => {
    const normal = brush.planes[index]?.normal;
    const uv = surfaces[index]?.uv;
    if (!normal || !uv || Math.abs(normal.y) > 0.999) return [];
    const corners = brush.getFaceVertexIndices(face).map((corner) => brush.vertices[corner] ?? new THREE.Vector3());
    const uvs = corners.map((corner) => uv.project(corner));
    return [{ normal, corners, uvs, centre: uv.project(corners.reduce((a, b) => a.clone().add(b)).divideScalar(4)) }];
  });
}

describe('square revolve sections', () => {
  it('shapes square runs by the curve: a tapered frustum and a curved top in convex pieces', () => {
    const { brushes, square } = build();
    const squares = brushes.filter(square);
    expect(squares.length).toBeGreaterThan(2);
    for (const brush of squares)
      for (const vertex of brush.vertices) expect(Math.abs(vertex.x)).toBeCloseTo(Math.abs(vertex.z), 6);
    const foot = squares[0];
    if (!foot) throw new Error('Expected the foot');
    const halfWidth = (y: number) => Math.max(...foot.vertices.filter((v) => Math.abs(v.y - y) < 1e-6).map((v) => v.x));
    const box = new THREE.Box3().setFromPoints(foot.vertices);
    expect(foot.vertices).toHaveLength(8);
    expect(halfWidth(box.min.y)).toBeCloseTo(0.9, 6);
    expect(halfWidth(box.max.y)).toBeCloseTo(0.6, 6);
    const top = squares.slice(1);
    const widths = top.map((brush) => new THREE.Box3().setFromPoints(brush.vertices).max.x);
    expect(widths.every((width, at) => at === 0 || width > (widths[at - 1] ?? 0))).toBe(true);
    const allRound = build({ ...PROFILE, segments: PROFILE.segments.map((segment) => segment.slice(0, 2)) });
    const roundTop = allRound.brushes.filter((brush) => Math.min(...brush.vertices.map((v) => v.y)) >= 2.1 - 1e-6);
    expect(top.length).toBeGreaterThan(1);
    expect(top).toHaveLength(roundTop.length);
  });

  it('gives square faces a quarter turn of U centred on the round faces at the same angle, and the same V', () => {
    const { brushes, frame, layout, square } = build();
    const round = brushes.filter((brush) => !square(brush)).flatMap((brush) => sides(brush, frame, layout));
    const squares = brushes
      .filter(square)
      .flatMap((brush) => sides(brush, generatorRevolveSectionFrame(frame, true), layout));
    const wrap = (value: number) => value - Math.floor(value + 1e-9);
    for (const face of squares) {
      const twin = round.find(
        (other) => other.normal.clone().setY(0).normalize().dot(face.normal.clone().setY(0).normalize()) > 0.9999,
      );
      expect(twin).toBeDefined();
      expect(wrap(face.centre.u)).toBeCloseTo(wrap(twin?.centre.u ?? 0), 6);
      const span = (y: number) => {
        const us = face.uvs.filter((_, at) => Math.abs((face.corners[at]?.y ?? 0) - y) < 1e-6).map((uv) => uv.u);
        return us.length > 1 ? Math.max(...us) - Math.min(...us) : 0;
      };
      const heights = face.corners.map((corner) => corner.y);
      expect((span(Math.min(...heights)) + span(Math.max(...heights))) / 2).toBeCloseTo(0.25, 6);
    }
    const foot = squares.filter((face) => face.normal.z > 0.9 && face.corners.every((corner) => corner.y < 1));
    const shaft = round.filter((face) => face.normal.z > 0.9);
    const vAt = (faces: typeof round, y: number) =>
      faces
        .flatMap((face) => face.uvs.filter((_, at) => Math.abs((face.corners[at]?.y ?? 0) - y) < 1e-6))
        .map((uv) => uv.v);
    const footTop = Math.max(...vAt(foot, 0.75));
    expect(footTop).toBeCloseTo(Math.hypot(0.75, 0.3) / layout.arcs[layout.arcs.length - 1]!.length, 6);
    expect(Math.min(...vAt(shaft, 0.75))).toBeGreaterThan(footTop);
  });
});
