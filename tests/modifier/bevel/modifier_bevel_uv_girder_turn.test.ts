import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { modifierBevelResolveDerivedSurface } from '@/modifier/bevel/modifier_bevel_stand_in.js';
import {
  modifierBevelProfileChain,
  modifierBevelProfileStrip,
} from '@/modifier/bevel/modifier_bevel_uv_layout_profile.js';
import { modifierBevelSharedEdge } from '@/modifier/bevel/modifier_bevel_face_graph.js';
import type { ModifierBevelDerivedBrush } from '@/modifier/bevel/modifier_bevel_derived.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import {
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_STRETCH,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TRIM,
  MODIFIER_VOLUME_BEVEL_UV_OWNER_SINGLE,
  MODIFIER_VOLUME_BEVEL_UV_PIVOT_ANCHOR,
  MODIFIER_VOLUME_BEVEL_UV_SPACE_WORLD,
  MODIFIER_VOLUME_BEVEL_UV_WINDING,
  type ModifierBevelUvLayout,
} from '@/modifier/volume/modifier_volume_bevel_keys.js';
import { deriveVolume } from './modifier_bevel_uv_owner_fixture.js';

describe('bevel trim and stretch rotation', () => {
  it('turns trim and stretch without shearing the main profile', () => {
    expect(chartHolds(MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TRIM)).toBe(true);
    expect(chartHolds(MODIFIER_VOLUME_BEVEL_UV_LAYOUT_STRETCH)).toBe(true);
  });
});

/** One derived bevel and its profile curve. */
interface TurnedChart {
  /** Authored instance. */
  instance: SolidBrushInstance;
  /** Derived bevel. */
  derived: ModifierBevelDerivedBrush;
  /** Profile faces. */
  chain: number[];
}

/**
 * Returns whether a 45 degree turn stays rectangular on the widest profile
 * face.
 *
 * @param layout Trim or stretch.
 * @returns True when that face stays rectangular, the curve moves, and seams
 *   agree.
 */
function chartHolds(layout: ModifierBevelUvLayout): boolean {
  const plain = turnedChart(layout, 0);
  const turned = turnedChart(layout, 45);
  const face = widestFace(plain);
  return faceStaysRectangular(turned, face) && seamsAgree(turned) && chartMoved(plain, turned);
}

/**
 * Derives a four-segment chart at one rotation.
 *
 * @param layout Trim or stretch.
 * @param rotation Rotation in degrees.
 * @returns Instance, derived brush, and curve.
 */
function turnedChart(layout: ModifierBevelUvLayout, rotation: number): TurnedChart {
  const placed = deriveVolume(
    4,
    MODIFIER_VOLUME_BEVEL_UV_OWNER_SINGLE,
    MODIFIER_VOLUME_BEVEL_UV_WINDING,
    1,
    rotation,
    MODIFIER_VOLUME_BEVEL_UV_PIVOT_ANCHOR,
    MODIFIER_VOLUME_BEVEL_UV_SPACE_WORLD,
    layout,
  );
  const face = placed.derived.faces.findIndex((_, index) => modifierBevelProfileStrip(placed.derived, index));
  return { ...placed, chain: modifierBevelProfileChain(placed.derived, Math.max(face, 0)) };
}

/**
 * Returns the profile face with the widest V span.
 *
 * @param sample Unrotated chart.
 * @returns Face index.
 */
function widestFace(sample: TurnedChart): number {
  let best = sample.chain[0] ?? 0;
  let bestSpan = -1;
  for (const face of sample.chain) {
    const span = faceVSpan(sample, face);
    if (span <= bestSpan) continue;
    bestSpan = span;
    best = face;
  }
  return best;
}

/**
 * Returns the V span of one face.
 *
 * @param sample Chart.
 * @param faceIndex Face index.
 * @returns Highest V minus lowest V.
 */
function faceVSpan(sample: TurnedChart, faceIndex: number): number {
  const loop = sample.derived.localBrush.faces[faceIndex];
  const points = loop ? sample.derived.localBrush.getFaceVertices(loop) : [];
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    const sampleV = faceUv(sample, faceIndex).project(point).v;
    low = Math.min(low, sampleV);
    high = Math.max(high, sampleV);
  }
  return high - low;
}

/**
 * Returns whether one face's U and V gradients stay perpendicular.
 *
 * @param sample Rotated chart.
 * @param faceIndex Face index.
 * @returns True when the normalized gradients are nearly perpendicular.
 */
function faceStaysRectangular(sample: TurnedChart, faceIndex: number): boolean {
  const matrix = faceUv(sample, faceIndex);
  const along = new Vector3(matrix.u.x, matrix.u.y, matrix.u.z);
  const across = new Vector3(matrix.v.x, matrix.v.y, matrix.v.z);
  const scale = along.length() * across.length();
  if (scale < 1e-8) return false;
  return Math.abs(along.dot(across)) / scale < 0.02;
}

/**
 * Returns whether neighboring segments still share UVs.
 *
 * @param sample Rotated chart.
 * @returns True when every shared vertex matches.
 */
function seamsAgree(sample: TurnedChart): boolean {
  for (let index = 1; index < sample.chain.length; index += 1) {
    if (!seamMatches(sample, sample.chain[index - 1] ?? 0, sample.chain[index] ?? 0)) return false;
  }
  return sample.chain.length > 1;
}

/**
 * Returns whether one shared edge has one UV.
 *
 * @param sample Rotated chart.
 * @param left First segment.
 * @param right Next segment.
 * @returns True when both endpoints agree.
 */
function seamMatches(sample: TurnedChart, left: number, right: number): boolean {
  const edge = modifierBevelSharedEdge(sample.derived.localBrush, left, right);
  if (!edge) return false;
  return uvAgrees(sample, left, right, edge.pointA) && uvAgrees(sample, left, right, edge.pointB);
}

/**
 * Returns whether two faces agree at a point.
 *
 * @param sample Rotated chart.
 * @param left First face.
 * @param right Second face.
 * @param point Local point.
 * @returns True when U and V agree.
 */
function uvAgrees(sample: TurnedChart, left: number, right: number, point: Vector3): boolean {
  const a = faceUv(sample, left).project(point);
  const b = faceUv(sample, right).project(point);
  return Math.abs(a.u - b.u) < 1e-3 && Math.abs(a.v - b.v) < 1e-3;
}

/**
 * Returns whether the rotation changed a curve sample.
 *
 * @param plain Unrotated chart.
 * @param turned Rotated chart.
 * @returns True when the first face UV moved.
 */
function chartMoved(plain: TurnedChart, turned: TurnedChart): boolean {
  const face = plain.chain[0] ?? 0;
  const loop = plain.derived.localBrush.faces[face];
  const sample = loop ? plain.derived.localBrush.getFaceVertices(loop)[0] : undefined;
  if (!sample) return false;
  const before = faceUv(plain, face).project(sample);
  const after = faceUv(turned, face).project(sample);
  return Math.hypot(before.u - after.u, before.v - after.v) > 0.02;
}

/**
 * Resolves one face UV.
 *
 * @param sample Derived chart.
 * @param faceIndex Face index.
 * @returns UV matrix.
 */
function faceUv(sample: TurnedChart, faceIndex: number): SurfaceUvMatrix {
  return modifierBevelResolveDerivedSurface(sample.instance, sample.derived, faceIndex).uv;
}
