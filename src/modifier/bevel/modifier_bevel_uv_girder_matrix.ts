import { Matrix4, Vector3, Vector4 } from 'three';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import {
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_STRETCH,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TILE,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TRIM,
  type ModifierBevelUvLayout,
} from '@/modifier/volume/modifier_volume_bevel_keys.js';
import type { ModifierBevelDerivedBrush } from './modifier_bevel_derived.js';
import type { ModifierBevelGirder } from './modifier_bevel_uv_girder.js';
import { modifierBevelGirderFraction } from './modifier_bevel_uv_girder_angle.js';
import { modifierBevelLocalToWorld } from './modifier_bevel_uv_layout_world.js';

/** How length and profile become UV units. */
interface ModifierBevelGirderScale {
  /** UV units per world meter along the edge. */
  length: number;
  /** UV units per profile fraction. */
  profile: number;
}

/**
 * Builds a tile, trim, or stretch matrix from the face's girder.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Generated face index.
 * @returns Matrix, or null when this face has no girder chart.
 */
export function modifierBevelGirderSurface(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
): SurfaceUvMatrix | null {
  const scale = modifierBevelGirderScale(derived.layout, modifierBevelFaceGirder(derived, faceIndex));
  const girder = modifierBevelFaceGirder(derived, faceIndex);
  if (!scale || !girder) return null;
  return modifierBevelGirderMatrix(source, derived, faceIndex, girder, scale);
}

/**
 * Returns the girder assigned to a face.
 *
 * @param derived Derived brush.
 * @param faceIndex Face index.
 * @returns Girder, or null.
 */
function modifierBevelFaceGirder(derived: ModifierBevelDerivedBrush, faceIndex: number): ModifierBevelGirder | null {
  const index = derived.girderOfFace[faceIndex] ?? -1;
  return derived.girders[index] ?? null;
}

/**
 * Returns the UV scales for a girder layout.
 *
 * @param layout Volume layout.
 * @param girder Face girder.
 * @returns Scales, or null when the layout is not a girder chart.
 */
function modifierBevelGirderScale(
  layout: ModifierBevelUvLayout,
  girder: ModifierBevelGirder | null,
): ModifierBevelGirderScale | null {
  if (!girder) return null;
  if (layout === MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TILE) return { length: 1, profile: girder.profileMeters };
  if (layout === MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TRIM) return { length: 1, profile: 1 };
  if (layout === MODIFIER_VOLUME_BEVEL_UV_LAYOUT_STRETCH) return { length: 1 / girder.edgeMeters, profile: 1 };
  return null;
}

/**
 * Builds both rows for one face.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Face index.
 * @param girder Assigned girder.
 * @param scale Length and profile scales.
 * @returns Matrix, or null when the face has no vertices.
 */
function modifierBevelGirderMatrix(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  girder: ModifierBevelGirder,
  scale: ModifierBevelGirderScale,
): SurfaceUvMatrix | null {
  const points = modifierBevelFacePoints(derived, faceIndex);
  const normal = derived.localBrush.planes[faceIndex]?.normal;
  if (!normal || points.length === 0) return null;
  const matrix = modifierBevelLocalToWorld(source);
  const profile = modifierBevelProfileRow(girder, matrix, normal, points, scale.profile);
  if (!profile) return null;
  return new SurfaceUvMatrix(modifierBevelLengthRow(matrix, girder, scale.length), profile);
}

/**
 * Returns the vertices of one face.
 *
 * @param derived Derived brush.
 * @param faceIndex Face index.
 * @returns Local vertices.
 */
function modifierBevelFacePoints(derived: ModifierBevelDerivedBrush, faceIndex: number): Vector3[] {
  const face = derived.localBrush.faces[faceIndex];
  return face ? derived.localBrush.getFaceVertices(face) : [];
}

/**
 * Builds the length row in world meters along the edge.
 *
 * @param matrix Brush local-to-world matrix.
 * @param girder Assigned girder.
 * @param scale UV units per world meter.
 * @returns U row.
 */
function modifierBevelLengthRow(matrix: Matrix4, girder: ModifierBevelGirder, scale: number): Vector4 {
  const worldDir = girder.direction.clone().transformDirection(matrix);
  const gradient = modifierBevelWorldGradient(matrix, worldDir).multiplyScalar(scale);
  return new Vector4(gradient.x, gradient.y, gradient.z, -gradient.dot(girder.origin));
}

/**
 * Returns the local gradient of a world direction.
 *
 * @param matrix Brush local-to-world matrix.
 * @param worldDir Unit world direction.
 * @returns Local gradient.
 */
function modifierBevelWorldGradient(matrix: Matrix4, worldDir: Vector3): Vector3 {
  const elements = matrix.elements;
  return new Vector3(
    modifierBevelColumnDot(elements, 0, worldDir),
    modifierBevelColumnDot(elements, 1, worldDir),
    modifierBevelColumnDot(elements, 2, worldDir),
  );
}

/**
 * Dots one matrix column with a direction.
 *
 * @param elements Column-major matrix elements.
 * @param column Column index.
 * @param direction World direction.
 * @returns Dot product.
 */
function modifierBevelColumnDot(elements: ArrayLike<number>, column: number, direction: Vector3): number {
  const offset = column * 4;
  return (
    (elements[offset] ?? 0) * direction.x +
    (elements[offset + 1] ?? 0) * direction.y +
    (elements[offset + 2] ?? 0) * direction.z
  );
}

/**
 * Builds the profile row from the extreme fractions on the face.
 *
 * @param girder Assigned girder.
 * @param matrix Brush local-to-world matrix.
 * @param normal Face normal.
 * @param points Face vertices.
 * @param scale UV units per profile fraction.
 * @returns V row, or null when the face has no width.
 */
function modifierBevelProfileRow(
  girder: ModifierBevelGirder,
  matrix: Matrix4,
  normal: Vector3,
  points: readonly Vector3[],
  scale: number,
): Vector4 | null {
  const across = modifierBevelProfileAcross(girder, normal);
  const span = modifierBevelFractionSpan(girder, matrix, points, across);
  if (!across || !span) return null;
  return modifierBevelAcrossRow(across, span.low, span.lowValue * scale, span.rate * scale);
}

/**
 * Returns a unit direction across the profile, in the face.
 *
 * @param girder Assigned girder.
 * @param normal Face normal.
 * @returns Unit direction, or null when the edge is the normal.
 */
function modifierBevelProfileAcross(girder: ModifierBevelGirder, normal: Vector3): Vector3 | null {
  const across = new Vector3().crossVectors(normal, girder.direction);
  if (across.lengthSq() < 1e-12) return null;
  return across.normalize();
}

/** Profile extremes of one face. */
interface ModifierBevelFractionSpan {
  /** Vertex at the lower fraction. */
  low: Vector3;
  /** Scaled value at that vertex before the rate is applied. */
  lowValue: number;
  /** Fraction change per local unit across the face. */
  rate: number;
}

/**
 * Measures the profile fraction at the face extremes.
 *
 * @param girder Assigned girder.
 * @param matrix Brush local-to-world matrix.
 * @param points Face vertices.
 * @param across Unit across direction.
 * @returns Span, or null when the face has no vertices.
 */
function modifierBevelFractionSpan(
  girder: ModifierBevelGirder,
  matrix: Matrix4,
  points: readonly Vector3[],
  across: Vector3 | null,
): ModifierBevelFractionSpan | null {
  if (!across) return null;
  const ranked = modifierBevelRankFractions(girder, matrix, points);
  const low = ranked[0];
  const high = ranked[ranked.length - 1];
  if (!low || !high) return null;
  return modifierBevelSpanRecord(low, high, across);
}

/**
 * Builds the span record from the low and high vertices.
 *
 * @param low Lowest fraction sample.
 * @param high Highest fraction sample.
 * @param across Unit across direction.
 * @returns Span.
 */
function modifierBevelSpanRecord(
  low: { point: Vector3; fraction: number },
  high: { point: Vector3; fraction: number },
  across: Vector3,
): ModifierBevelFractionSpan {
  const width = high.point.clone().sub(low.point).dot(across);
  const rate = Math.abs(width) < 1e-8 ? 0 : (high.fraction - low.fraction) / width;
  return { low: low.point, lowValue: low.fraction, rate };
}

/**
 * Lists face vertices from the lowest profile fraction to the highest.
 *
 * @param girder Assigned girder.
 * @param matrix Brush local-to-world matrix.
 * @param points Face vertices.
 * @returns Ranked samples.
 */
function modifierBevelRankFractions(
  girder: ModifierBevelGirder,
  matrix: Matrix4,
  points: readonly Vector3[],
): { point: Vector3; fraction: number }[] {
  const ranked = points.map((point) => ({ point, fraction: modifierBevelGirderFraction(girder, matrix, point) }));
  ranked.sort((left, right) => left.fraction - right.fraction);
  return ranked;
}

/**
 * Builds a V row along an across direction.
 *
 * @param across Unit across direction.
 * @param origin Point where the unscaled value is known.
 * @param value Value at that point, before scaling.
 * @param rate UV units per local unit.
 * @returns V row.
 */
function modifierBevelAcrossRow(across: Vector3, origin: Vector3, value: number, rate: number): Vector4 {
  const gradient = across.clone().multiplyScalar(rate);
  return new Vector4(gradient.x, gradient.y, gradient.z, value - gradient.dot(origin));
}
