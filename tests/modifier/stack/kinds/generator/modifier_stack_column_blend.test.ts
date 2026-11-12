import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { curveDecode, curveEncode } from '@/curve/model/curve_codec.js';
import { curveFromPolyline, type Curve, type CurveSegment } from '@/curve/model/curve_model.js';
import { curvePresetBuild, type CurvePreset } from '@/curve/model/curve_preset.js';
import { CURVE_PRESETS_PROPS_TOOLS } from '@/curve/model/curve_preset_props_tools.js';
import { CURVE_PRESETS_PROPS_CONTAINERS } from '@/curve/model/curve_preset_props_containers.js';
import { generatorRevolveStationsFromCurve } from '@/generator/revolve/generator_revolve_curve.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { stackFixture } from '../../modifier_stack_fixture.js';

/**
 * A nail profile as saved before Blend existed: a square tip below a round
 * shank.
 */
const OLD_NAIL =
  '{"points":[[0,0,0,0,0,0],[0.06,0.52,0,0,0,0],[0.95,0.52,0,0,0,0],[0.965,0.7,0,0,0,0],[0.965,1,0,0,0,0],[0.985,1,0,0,0,0],[1,0.88,0,0,0,0]],"segments":[["linear",8,"s"],["linear",8],["linear",8],["linear",8],["linear",8],["linear",8]],"markers":{"parked":{"bottom":0.06,"top":0.95}}}';

/**
 * Builds a column in a uniform volume and returns its pieces.
 *
 * @param profile Encoded profile.
 * @param size Volume size.
 * @returns Pieces.
 */
function column(profile: string, size = 1): SolidBrushInstance[] {
  return stackFixture([{ kind: 'column', parameters: { profile, sides: '24' } }], size)
    .compile()
    .instances.slice(1);
}

/**
 * Returns a piece's world-space vertices.
 *
 * @param piece Piece.
 * @returns Vertices.
 */
function vertices(piece: SolidBrushInstance): THREE.Vector3[] {
  const matrix = piece.getLocalMatrix();
  return piece.brush.vertices.map((vertex) => vertex.clone().applyMatrix4(matrix));
}

/**
 * Returns a preset by id.
 *
 * @param id Preset id.
 * @returns Preset.
 */
function preset(id: string): CurvePreset {
  const found = [...CURVE_PRESETS_PROPS_TOOLS, ...CURVE_PRESETS_PROPS_CONTAINERS].find((entry) => entry.id === id);
  if (!found) throw new Error(`Missing preset ${id}`);
  return found;
}

/**
 * Expects every piece to be a valid convex brush: each vertex lies on or behind
 * every face plane, within a thousandth of the piece's size.
 *
 * @param pieces Pieces.
 * @param label Failure label.
 */
function expectConvex(pieces: readonly SolidBrushInstance[], label: string): void {
  for (const piece of pieces) {
    expect(SolidBrushValidator.validateGenerated(piece.brush).valid, label).toBe(true);
    const size = piece.brush.computeLocalBounds().getSize(new THREE.Vector3()).length();
    for (const plane of piece.brush.planes)
      for (const vertex of piece.brush.vertices)
        expect(plane.signedDistance(vertex), label).toBeLessThanOrEqual(size * 1e-3 + 1e-9);
  }
}

/**
 * Returns the widest distance from the axis of the vertices within a height
 * band of the column.
 *
 * @param pieces Pieces.
 * @param from Lowest height.
 * @param to Highest height.
 * @returns Largest radius.
 */
function widest(pieces: readonly SolidBrushInstance[], from: number, to: number): number {
  const radii = pieces
    .flatMap(vertices)
    .filter((vertex) => vertex.y >= from && vertex.y <= to)
    .map((vertex) => Math.hypot(vertex.x, vertex.z));
  return Math.max(...radii);
}

/**
 * Returns how much more level face area faces down than up at a height. Faces
 * between stacked pieces pair up and cancel; a ledge or lip leaves a rest.
 *
 * @param pieces Pieces.
 * @param height World height.
 * @returns Unmatched level area.
 */
function ledgeArea(pieces: readonly SolidBrushInstance[], height: number): number {
  let area = 0;
  for (const piece of pieces) {
    const world = vertices(piece);
    for (const face of piece.brush.faces) {
      const corners = piece.brush.getFaceVertexIndices(face).map((index) => world[index]!);
      if (!corners.every((corner) => Math.abs(corner.y - height) < 1e-4)) continue;
      const normal = new THREE.Vector3();
      corners.forEach((corner, at) => normal.add(corner.clone().cross(corners[(at + 1) % corners.length]!)));
      area += normal.y / 2;
    }
  }
  return Math.abs(area);
}

/**
 * Builds a straight profile through points and gives its segments settings.
 *
 * @param points Points as [x, y].
 * @param segments Settings per segment.
 * @returns Curve.
 */
function profile(points: [number, number][], segments: Partial<CurveSegment>[]): Curve {
  const curve = curveFromPolyline(points);
  segments.forEach((settings, index) => Object.assign(curve.segments[index]!, settings));
  return curve;
}

describe('column section blends', () => {
  it('builds profiles saved before Blend as before, without blend data on stations', () => {
    const old = curveDecode(OLD_NAIL)!;
    const stations = generatorRevolveStationsFromCurve(old, 1, 0.5);
    expect(stations.some((station) => 'blendStart' in station || 'segment' in station)).toBe(false);
    const pieces = column(OLD_NAIL);
    const shank = widest(pieces, -1, 1) * 0.52;
    expect(widest(pieces, -0.5, -0.5 + 0.06)).toBeGreaterThan(shank * 1.3);
    expect(ledgeArea(pieces, -0.5 + 0.06)).toBeGreaterThan(shank * shank * 0.5);
  });

  it('keeps stations unchanged when Blend is set where no section changes', () => {
    const plain = profile(
      [
        [0, 0.5],
        [0.4, 0.5],
        [1, 0.3],
      ],
      [{ section: 'square' }, { section: 'square' }],
    );
    const flagged = profile(
      [
        [0, 0.5],
        [0.4, 0.5],
        [1, 0.3],
      ],
      [{ section: 'square' }, { section: 'square', blend: true }],
    );
    expect(generatorRevolveStationsFromCurve(flagged, 2, 1)).toEqual(generatorRevolveStationsFromCurve(plain, 2, 1));
    expect(column(curveEncode(flagged)).map(vertices)).toEqual(column(curveEncode(plain)).map(vertices));
  });

  it('grinds the nail tip into the shank with no lip and only convex pieces', () => {
    const pieces = column(curveEncode(curvePresetBuild(preset('nail'))));
    expectConvex(pieces, 'nail');
    const shank = widest(pieces, -1, 1) * 0.52;
    expect(widest(pieces, -0.5, 0.4)).toBeLessThanOrEqual(shank * (1 + 1e-6));
    expect(ledgeArea(pieces, -0.5 + 0.06)).toBeLessThan(1e-9);
    expect(ledgeArea(pieces, -0.5 + 0.085)).toBeLessThan(1e-9);
  });

  it('flares the screwdriver blades and tent peg arms into round parts without a ledge', () => {
    for (const [id, joint] of [
      ['flathead_screwdriver', 0.86],
      ['phillips_screwdriver', undefined],
      ['tent_peg', 0.86],
      ['whiskey_bottle', 0.77],
      ['canoe_paddle', 0.46],
      ['antenna', 0.05],
    ] as const) {
      const pieces = column(curveEncode(curvePresetBuild(preset(id))));
      expectConvex(pieces, id);
      if (joint !== undefined) expect(ledgeArea(pieces, -0.5 + joint), id).toBeLessThan(1e-9);
    }
  }, 30_000);

  it('builds cross blends as four convex wedges that survive a tiny volume', () => {
    const curve = profile(
      [
        [0, 0.6],
        [0.5, 0.6],
        [1, 0.6],
      ],
      [{ section: 'cross', armWidth: 0.2 }, { blend: true }],
    );
    for (const size of [1, 0.03]) {
      const pieces = column(curveEncode(curve), size);
      expectConvex(pieces, `cross ${size}`);
      const upper = pieces.filter((piece) => vertices(piece).every((vertex) => vertex.y >= -1e-9 * size));
      expect(upper.length, `cross ${size}`).toBeGreaterThanOrEqual(4);
    }
    const phillips = column(curveEncode(curvePresetBuild(preset('phillips_screwdriver'))), 0.032);
    expectConvex(phillips, 'phillips small');
  });

  it('blends sided, fixed-depth and tapered bar segments into valid pieces', () => {
    const points: [number, number][] = [
      [0, 0.5],
      [0.5, 0.5],
      [0.8, 0.4],
      [1, 0.4],
    ];
    for (const segments of [
      [{ section: 'bar', armWidth: 0.4, armWidthEnd: 0.1 }, { blend: true }, {}],
      [{ section: 'square', side: 'positive' }, { section: 'square', blend: true }, {}],
      [{ section: 'square', fixedDepth: true }, { blend: true }, { section: 'polygon', polygonSides: 6 }],
      [{ section: 'bar', armWidth: 0.3 }, { blend: true }, { section: 'cross', armWidth: 0.2, blend: true }],
    ] as Partial<CurveSegment>[][]) {
      const pieces = column(curveEncode(profile(points, segments)));
      const label = JSON.stringify(segments);
      expect(pieces.length, label).toBeGreaterThan(0);
      expectConvex(pieces, label);
      for (const vertex of pieces.flatMap(vertices)) {
        expect(Math.abs(vertex.x), label).toBeLessThanOrEqual(0.5 + 1e-6);
        expect(Math.abs(vertex.z), label).toBeLessThanOrEqual(0.5 + 1e-6);
      }
    }
  });
});
