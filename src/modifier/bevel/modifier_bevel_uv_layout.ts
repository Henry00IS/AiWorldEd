import { Vector3, Vector4, type Matrix4 } from 'three';
import type { FaceSurfaceDescription } from '@/texture/uv_matrix/face_surface_description.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import {
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_AXIS,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_CUBIC,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_FRONT,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_OVERHEAD,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_PROJECT,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_SIDE,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_STRETCH,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TILE,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TRIM,
  MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL,
  type ModifierBevelUvLayout,
} from '@/modifier/volume/modifier_volume_bevel_keys.js';
import type { ModifierBevelDerivedBrush } from './modifier_bevel_derived.js';
import { modifierBevelLayoutFrame, type ModifierBevelLayoutFrame } from './modifier_bevel_uv_layout_frame.js';
import { modifierBevelProfileMeasure, type ModifierBevelProfileMeasure } from './modifier_bevel_uv_layout_profile.js';
import {
  modifierBevelLocalToWorld,
  modifierBevelNormalMatrix,
  modifierBevelWorldLayoutFrame,
} from './modifier_bevel_uv_layout_world.js';
import { modifierBevelGirderSurface } from './modifier_bevel_uv_girder_matrix.js';

/**
 * Builds the UV placement for one generated face.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Generated face index.
 * @param continued Surface produced by folding the parent texture.
 * @returns Surface for the volume's layout and texture.
 */
export function modifierBevelLayoutSurface(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  continued: FaceSurfaceDescription,
): FaceSurfaceDescription {
  const matrix = modifierBevelLayoutMatrix(source, derived, faceIndex, continued);
  return modifierBevelPaintTexture(continued, derived.textureId, matrix);
}

/**
 * Returns the UV matrix for the active layout.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Generated face index.
 * @param continued Folded parent surface.
 * @returns Matrix, or null to keep the folded surface.
 */
function modifierBevelLayoutMatrix(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  continued: FaceSurfaceDescription,
): SurfaceUvMatrix | null {
  return modifierBevelFaceMatrix(source, derived, faceIndex, continued);
}

/**
 * Builds a strip or projection matrix, without stitching a corner cap.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Generated face index.
 * @param continued Folded parent surface.
 * @returns Matrix, or null to keep the folded surface.
 */
export function modifierBevelFaceMatrix(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  continued: FaceSurfaceDescription,
): SurfaceUvMatrix | null {
  const projected = modifierBevelProjectedLayout(source, derived, faceIndex);
  if (projected) return projected;
  if (derived.layout === MODIFIER_VOLUME_BEVEL_UV_LAYOUT_PROJECT) {
    return modifierBevelProjectMatrix(source, derived, faceIndex);
  }
  if (derived.layout === MODIFIER_VOLUME_BEVEL_UV_LAYOUT_CUBIC) {
    return modifierBevelCubicMatrix(source, derived, faceIndex);
  }
  return modifierBevelEdgeLayoutMatrix(source, derived, faceIndex, continued);
}

/**
 * Projects a layout from fixed world axes.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Generated face index.
 * @returns Matrix, or null when the layout is not a view projection.
 */
function modifierBevelProjectedLayout(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
): SurfaceUvMatrix | null {
  const layout = derived.layout;
  const local = derived.placement.uvSpace === MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL;
  if (layout === MODIFIER_VOLUME_BEVEL_UV_LAYOUT_OVERHEAD) return modifierBevelViewMatrix(source, 0, 2, local);
  if (layout === MODIFIER_VOLUME_BEVEL_UV_LAYOUT_FRONT) return modifierBevelViewMatrix(source, 0, 1, local);
  if (layout === MODIFIER_VOLUME_BEVEL_UV_LAYOUT_SIDE) return modifierBevelViewMatrix(source, 2, 1, local);
  if (layout === MODIFIER_VOLUME_BEVEL_UV_LAYOUT_AXIS)
    return modifierBevelAxisMatrix(source, derived, faceIndex, local);
  return null;
}

/**
 * Projects from the world view closest to the face normal.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Generated face index.
 * @param local True when the brush frame is used.
 * @returns UV matrix.
 */
function modifierBevelAxisMatrix(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  local: boolean,
): SurfaceUvMatrix {
  const normal = modifierBevelAxisNormal(source, derived, faceIndex, local);
  if (Math.abs(normal.y) >= Math.abs(normal.x) && Math.abs(normal.y) >= Math.abs(normal.z)) {
    return modifierBevelViewMatrix(source, 0, 2, local);
  }
  if (Math.abs(normal.z) >= Math.abs(normal.x)) return modifierBevelViewMatrix(source, 0, 1, local);
  return modifierBevelViewMatrix(source, 2, 1, local);
}

/**
 * Returns the normal used to choose an axis projection.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Face index.
 * @param local True when the brush frame is used.
 * @returns Unit normal.
 */
function modifierBevelAxisNormal(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  local: boolean,
): Vector3 {
  if (local) return derived.localBrush.planes[faceIndex]?.normal?.clone() ?? new Vector3(0, 1, 0);
  return modifierBevelWorldFaceNormal(source, derived, faceIndex);
}

/**
 * Transforms a face normal into world space.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Face index.
 * @returns Unit world normal.
 */
function modifierBevelWorldFaceNormal(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
): Vector3 {
  const normal = derived.localBrush.planes[faceIndex]?.normal?.clone() ?? new Vector3(0, 1, 0);
  const world = normal.applyMatrix3(modifierBevelNormalMatrix(modifierBevelLocalToWorld(source)));
  if (world.lengthSq() <= 1e-16) return new Vector3(0, 1, 0);
  return world.normalize();
}

/**
 * Copies two world-axis rows into a UV matrix.
 *
 * @param source Authored instance.
 * @param uRow World row used as U. 0 is X, 1 is Y, and 2 is Z.
 * @param vRow World row used as V.
 * @param local True when rows come from the brush frame.
 * @returns UV matrix.
 */
function modifierBevelViewMatrix(
  source: SolidBrushInstance,
  uRow: number,
  vRow: number,
  local: boolean,
): SurfaceUvMatrix {
  const matrix = modifierBevelLocalToWorld(source);
  if (local)
    return new SurfaceUvMatrix(modifierBevelLocalAxisRow(matrix, uRow), modifierBevelLocalAxisRow(matrix, vRow));
  const elements = matrix.elements;
  return new SurfaceUvMatrix(modifierBevelMatrixRow(elements, uRow), modifierBevelMatrixRow(elements, vRow));
}

/**
 * Builds a UV row along one brush axis, in world meters from the brush origin.
 *
 * @param matrix Brush local-to-world matrix.
 * @param column Column index. 0 is X, 1 is Y, and 2 is Z.
 * @returns UV row in brush-local coordinates.
 */
function modifierBevelLocalAxisRow(matrix: Matrix4, column: number): Vector4 {
  const offset = column * 4;
  const elements = matrix.elements;
  const direction = new Vector3(elements[offset] ?? 0, elements[offset + 1] ?? 0, elements[offset + 2] ?? 0);
  if (direction.lengthSq() <= 1e-16) direction.set(column === 0 ? 1 : 0, column === 1 ? 1 : 0, column === 2 ? 1 : 0);
  else direction.normalize();
  return new Vector4(
    modifierBevelColumnDot(elements, 0, direction),
    modifierBevelColumnDot(elements, 1, direction),
    modifierBevelColumnDot(elements, 2, direction),
    0,
  );
}

/**
 * Dots one matrix column with a direction.
 *
 * @param elements Column-major matrix elements.
 * @param column Column index.
 * @param direction Unit direction.
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
 * Reads one row of a column-major matrix.
 *
 * @param elements Column-major matrix elements.
 * @param row Row index.
 * @returns Row as a UV vector.
 */
function modifierBevelMatrixRow(elements: ArrayLike<number>, row: number): Vector4 {
  const x = elements[row];
  const y = elements[row + 4];
  const z = elements[row + 8];
  const w = elements[row + 12];
  return new Vector4(x ?? 0, y ?? 0, z ?? 0, w ?? 0);
}

/**
 * Builds a tile, trim, or stretch matrix from the bevel edge.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Generated face index.
 * @param continued Folded parent surface.
 * @returns Matrix, or null to keep the folded surface.
 */
function modifierBevelEdgeLayoutMatrix(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  continued: FaceSurfaceDescription,
): SurfaceUvMatrix | null {
  const girder = modifierBevelGirderSurface(source, derived, faceIndex);
  if (girder) return girder;
  const local = modifierBevelLayoutFrame(derived.localBrush, faceIndex, derived.faces[faceIndex]);
  if (!local) return null;
  const posed = modifierBevelPosedEdgeLayout(source, derived, faceIndex, local);
  return posed ?? continued.uv;
}

/**
 * Places an edge layout in world units, stored for brush-local vertices.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Generated face index.
 * @param local Local edge frame.
 * @returns Matrix, or null when this layout is not an edge layout.
 */
function modifierBevelPosedEdgeLayout(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  local: ModifierBevelLayoutFrame,
): SurfaceUvMatrix | null {
  const posed = modifierBevelPosedFrame(source, derived, faceIndex, local);
  if (!posed) return null;
  const layout = modifierBevelUnposedEdgeLayout(derived.layout, posed.frame, posed.measure);
  if (!layout) return null;
  return layout.multiplyMatrix4(posed.matrix);
}

/** World edge frame plus the curve placement of one generated face. */
interface ModifierBevelPosedFrame {
  /** Brush local-to-world matrix. */
  matrix: Matrix4;
  /** Edge frame in world space. */
  frame: ModifierBevelLayoutFrame;
  /** Distances and parent phase for this face. */
  measure: ModifierBevelProfileMeasure;
}

/**
 * Builds the world frame and curve measure for one generated face.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Generated face index.
 * @param local Local edge frame.
 * @returns World frame, or null when the face collapses.
 */
function modifierBevelPosedFrame(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  local: ModifierBevelLayoutFrame,
): ModifierBevelPosedFrame | null {
  const matrix = modifierBevelLocalToWorld(source);
  const frame = modifierBevelWorldLayoutFrame(matrix, derived.localBrush, faceIndex, local);
  if (!frame) return null;
  return { matrix, frame, measure: modifierBevelProfileMeasure(source, derived, faceIndex, matrix) };
}

/**
 * Builds a tile, trim, or stretch matrix in the frame's own space.
 *
 * @param layout Volume layout.
 * @param frame Edge frame.
 * @param measure Curve placement for this face.
 * @returns Matrix, or null when the layout is not an edge layout.
 */
function modifierBevelUnposedEdgeLayout(
  layout: ModifierBevelUvLayout,
  frame: ModifierBevelLayoutFrame,
  measure: ModifierBevelProfileMeasure,
): SurfaceUvMatrix | null {
  if (layout === MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TILE) return modifierBevelTileMatrix(frame, measure);
  if (layout === MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TRIM) return modifierBevelTrimMatrix(frame, measure);
  if (layout === MODIFIER_VOLUME_BEVEL_UV_LAYOUT_STRETCH) return modifierBevelStretchMatrix(frame, measure);
  return null;
}

/**
 * Repeats the texture in world units across the whole curve.
 *
 * @param frame Edge frame.
 * @param measure Curve placement for this face.
 * @returns UV matrix.
 */
function modifierBevelTileMatrix(
  frame: ModifierBevelLayoutFrame,
  measure: ModifierBevelProfileMeasure,
): SurfaceUvMatrix {
  return modifierBevelPhasedWorldMatrix(frame, measure);
}

/**
 * Fits one texture across the whole curve and repeats it along the length.
 *
 * @param frame Edge frame.
 * @param measure Curve placement for this face.
 * @returns UV matrix.
 */
function modifierBevelTrimMatrix(
  frame: ModifierBevelLayoutFrame,
  measure: ModifierBevelProfileMeasure,
): SurfaceUvMatrix {
  const total = modifierBevelCurveTotal(measure.arcTotal);
  const scale = measure.acrossSign / total;
  const along = modifierBevelAlongRow(measure, measure.alongSign, measure.phaseU);
  const across = modifierBevelAcrossRow(
    frame,
    modifierBevelChainRate(measure.reversed, scale),
    modifierBevelPhasedShift(measure, frame, scale),
  );
  return new SurfaceUvMatrix(along, across);
}

/**
 * Stretches one texture copy over the whole curve.
 *
 * @param frame Edge frame.
 * @param measure Curve placement for this face.
 * @returns UV matrix.
 */
function modifierBevelStretchMatrix(
  frame: ModifierBevelLayoutFrame,
  measure: ModifierBevelProfileMeasure,
): SurfaceUvMatrix {
  const total = modifierBevelCurveTotal(measure.arcTotal);
  const alongScale = 1 / modifierBevelCurveTotal(measure.alongSpan);
  const along = modifierBevelAlongRow(measure, alongScale, -measure.minAlong * alongScale);
  const across = modifierBevelAcrossRow(
    frame,
    modifierBevelChainRate(measure.reversed, 1 / total),
    modifierBevelTravelOffset(measure.reversed, measure.arcStart, frame, 1 / total),
  );
  return new SurfaceUvMatrix(along, across);
}

/**
 * Adds the parent phase to a curve offset.
 *
 * @param measure Curve placement.
 * @param frame Edge frame.
 * @param acrossScale UV units per world unit across the curve.
 * @returns V offset.
 */
function modifierBevelPhasedShift(
  measure: ModifierBevelProfileMeasure,
  frame: ModifierBevelLayoutFrame,
  acrossScale: number,
): number {
  return measure.phaseV + modifierBevelTravelOffset(measure.reversed, measure.arcStart, frame, acrossScale);
}

/**
 * Returns the across scale, flipped when the face points back along the curve.
 *
 * @param reversed True when across points toward the start.
 * @param scale Unsigned UV units per world unit.
 * @returns Signed scale.
 */
function modifierBevelChainRate(reversed: boolean, scale: number): number {
  if (reversed) return -scale;
  return scale;
}

/**
 * Returns the across offset measured from the start of the curve.
 *
 * @param reversed True when across points toward the start.
 * @param arcStart World distance before this face.
 * @param frame Edge frame.
 * @param scale Unsigned UV units per world unit.
 * @returns Offset added to V.
 */
function modifierBevelTravelOffset(
  reversed: boolean,
  arcStart: number,
  frame: ModifierBevelLayoutFrame,
  scale: number,
): number {
  const traveled = reversed ? arcStart + frame.minAcross + frame.acrossSpan : arcStart - frame.minAcross;
  return scale * traveled;
}

/**
 * Returns a positive curve width.
 *
 * @param total Measured width of the curve.
 * @returns Width safe to divide by.
 */
function modifierBevelCurveTotal(total: number): number {
  return Math.max(total, 1e-8);
}

/**
 * Builds the U row from the curve's shared along axis.
 *
 * @param measure Curve placement.
 * @param scale UV units per world unit along the bevel.
 * @param shift Added to U.
 * @returns U row.
 */
function modifierBevelAlongRow(measure: ModifierBevelProfileMeasure, scale: number, shift: number): Vector4 {
  return modifierBevelAxisRow(measure.along, measure.origin, scale, shift);
}

/**
 * Builds the V row from one face's across axis.
 *
 * @param frame Edge frame of this face.
 * @param scale UV units per world unit across the curve.
 * @param shift Added to V.
 * @returns V row.
 */
function modifierBevelAcrossRow(frame: ModifierBevelLayoutFrame, scale: number, shift: number): Vector4 {
  return modifierBevelAxisRow(frame.across, frame.origin, scale, shift);
}

/**
 * Builds one UV row from a unit axis, a scale, and an offset.
 *
 * @param axis Unit direction.
 * @param origin Point where the unscaled coordinate is zero.
 * @param scale UV units per world unit.
 * @param shift Added after scaling.
 * @returns U or V row.
 */
function modifierBevelAxisRow(axis: Vector3, origin: Vector3, scale: number, shift: number): Vector4 {
  const scaled = axis.clone().multiplyScalar(scale);
  return new Vector4(scaled.x, scaled.y, scaled.z, shift - scaled.dot(origin));
}

/**
 * Returns the parent face projection.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Generated face index.
 * @returns Parent UV matrix.
 */
function modifierBevelProjectMatrix(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
): SurfaceUvMatrix {
  const parent = derived.faces[faceIndex]?.parentSurfaceIndex ?? 0;
  return source.getFaceSurface(parent).uv;
}

/**
 * Places a world-unit grid across the whole curve.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Generated face index.
 * @returns UV matrix, or null when the face has no edge.
 */
function modifierBevelCubicMatrix(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
): SurfaceUvMatrix | null {
  const local = modifierBevelLayoutFrame(derived.localBrush, faceIndex, derived.faces[faceIndex]);
  if (!local) return null;
  const posed = modifierBevelPosedFrame(source, derived, faceIndex, local);
  if (!posed) return null;
  const grid = modifierBevelPhasedWorldMatrix(posed.frame, posed.measure);
  return grid.multiplyMatrix4(posed.matrix);
}

/**
 * Places a world-unit grid that meets the parent texture at the cut.
 *
 * @param frame Edge frame.
 * @param measure Curve placement for this face.
 * @returns UV matrix.
 */
function modifierBevelPhasedWorldMatrix(
  frame: ModifierBevelLayoutFrame,
  measure: ModifierBevelProfileMeasure,
): SurfaceUvMatrix {
  const along = modifierBevelAlongRow(measure, measure.alongSign, measure.phaseU);
  const across = modifierBevelAcrossRow(
    frame,
    modifierBevelChainRate(measure.reversed, measure.acrossSign),
    modifierBevelPhasedShift(measure, frame, measure.acrossSign),
  );
  return new SurfaceUvMatrix(along, across);
}

/**
 * Replaces the texture when the volume names one, and the matrix when given.
 *
 * @param continued Folded parent surface.
 * @param textureId Volume texture. Empty keeps the parent texture.
 * @param matrix Layout matrix, or null to keep the folded matrix.
 * @returns Surface to bake.
 */
function modifierBevelPaintTexture(
  continued: FaceSurfaceDescription,
  textureId: string,
  matrix: SurfaceUvMatrix | null,
): FaceSurfaceDescription {
  const uv = matrix ?? continued.uv;
  const nextTexture = textureId || continued.textureId;
  if (uv === continued.uv && nextTexture === continued.textureId) return continued;
  return { textureId: nextTexture, uv };
}
