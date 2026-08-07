import * as THREE from 'three';
import type { EditorPlaneFrame } from '@/navigation/orientation/editor_orientation_basis.js';

/**
 * Transforms a world-space point into the oriented grid frame.
 *
 * @param worldPoint Point in world space.
 * @param frame Grid plane frame (origin + orthonormal axes).
 * @param target Optional vector to write into.
 * @returns Coordinates along U, V, and normal of the frame.
 */
export function worldPointToGridLocal(
  worldPoint: THREE.Vector3,
  frame: EditorPlaneFrame,
  target: THREE.Vector3 = new THREE.Vector3(),
): THREE.Vector3 {
  const dx = worldPoint.x - frame.origin.x;
  const dy = worldPoint.y - frame.origin.y;
  const dz = worldPoint.z - frame.origin.z;
  return target.set(
    dx * frame.uAxis.x + dy * frame.uAxis.y + dz * frame.uAxis.z,
    dx * frame.vAxis.x + dy * frame.vAxis.y + dz * frame.vAxis.z,
    dx * frame.normal.x + dy * frame.normal.y + dz * frame.normal.z,
  );
}

/**
 * Transforms a world-space direction into the oriented grid frame.
 *
 * @param worldDirection Direction in world space (need not be unit).
 * @param frame Grid plane frame.
 * @param target Optional vector to write into.
 * @returns Direction expressed in U/V/normal axes.
 */
export function worldDirectionToGridLocal(
  worldDirection: THREE.Vector3,
  frame: EditorPlaneFrame,
  target: THREE.Vector3 = new THREE.Vector3(),
): THREE.Vector3 {
  return target.set(
    worldDirection.x * frame.uAxis.x + worldDirection.y * frame.uAxis.y + worldDirection.z * frame.uAxis.z,
    worldDirection.x * frame.vAxis.x + worldDirection.y * frame.vAxis.y + worldDirection.z * frame.vAxis.z,
    worldDirection.x * frame.normal.x + worldDirection.y * frame.normal.y + worldDirection.z * frame.normal.z,
  );
}

/**
 * Selects the two local-space axes used as UV from the dominant component of
 * the face normal (the pair orthogonal to that component).
 *
 * @param localNormal Face normal in grid-local space.
 * @returns Indices of the two local axes used for UV (0=U, 1=V, 2=N).
 */
export function pickProjectedGridUvAxes(localNormal: THREE.Vector3): [number, number] {
  const absX = Math.abs(localNormal.x);
  const absY = Math.abs(localNormal.y);
  const absZ = Math.abs(localNormal.z);
  if (absX >= absY && absX >= absZ) {
    return [2, 1];
  }
  if (absY >= absX && absY >= absZ) {
    return [0, 2];
  }
  return [0, 1];
}

/**
 * Projects a grid-local position onto the face UV plane for lattice sampling.
 *
 * @param localPoint Position in grid-local coordinates.
 * @param uvAxes Axis pair selecting which local components map to U and V.
 * @param cellSize World size of one grid cell.
 * @param target Optional vector2 to write into.
 * @returns Cell-space UV coordinates.
 */
export function projectGridLocalToCellUv(
  localPoint: THREE.Vector3,
  uvAxes: [number, number],
  cellSize: number,
  target: THREE.Vector2 = new THREE.Vector2(),
): THREE.Vector2 {
  const safeCell = Math.max(cellSize, 1e-6);
  const components = [localPoint.x, localPoint.y, localPoint.z];
  return target.set(components[uvAxes[0]]! / safeCell, components[uvAxes[1]]! / safeCell);
}

/**
 * Screen-space line half-width in pixels (fwidth scale). Slightly fuller than a
 * pure hairline for a stable lattice stroke.
 */
export const PROJECTED_GRID_LINE_WIDTH_PIXELS = 1.1;

/**
 * Solid core fraction of the half-width. Zero keeps a pure soft AA falloff (no
 * thick filled stroke).
 */
export const PROJECTED_GRID_LINE_CORE_FRACTION = 0;

/**
 * Minimum axis derivative (world units / pixel) so lines never collapse to a
 * sub-pixel unstable hairline on exact grid planes.
 */
export const PROJECTED_GRID_MIN_AXIS_DERIVATIVE = 1e-4;

/**
 * Screen-space fade thresholds (pixels per period). Below hide the layer is
 * gone; above full the layer is fully visible. Tuned so minor lines drop first,
 * then section (4×), then major (8×).
 */
export const PROJECTED_GRID_MINOR_FADE_HIDE_PX = 2.5;
export const PROJECTED_GRID_MINOR_FADE_FULL_PX = 6.0;
export const PROJECTED_GRID_SECTION_FADE_HIDE_PX = 2.0;
export const PROJECTED_GRID_SECTION_FADE_FULL_PX = 5.0;
export const PROJECTED_GRID_MAJOR_FADE_HIDE_PX = 1.75;
export const PROJECTED_GRID_MAJOR_FADE_FULL_PX = 4.5;

/** Grazing N·V where lattice starts fading (steep views). */
export const PROJECTED_GRID_GRAZING_FADE_HIDE = 0.06;

/** Grazing N·V where lattice is fully visible. */
export const PROJECTED_GRID_GRAZING_FADE_FULL = 0.22;

/**
 * Smooth 0..1 visibility from screen-space pixels covered by one grid period.
 *
 * @param pixelsPerPeriod Approximate pixels across one period.
 * @param hideBelow Fully hidden at or below this many pixels.
 * @param fullAbove Fully visible at or above this many pixels.
 * @returns Visibility factor in 0..1.
 */
export function projectedGridLayerScreenFade(pixelsPerPeriod: number, hideBelow: number, fullAbove: number): number {
  return smoothstep(hideBelow, fullAbove, pixelsPerPeriod);
}

/**
 * Visibility from view-grazing angle (absolute N·V).
 *
 * @param normalDotView Abs cosine of surface normal and view direction.
 * @returns Visibility factor in 0..1.
 */
export function projectedGridGrazingFade(normalDotView: number): number {
  return smoothstep(PROJECTED_GRID_GRAZING_FADE_HIDE, PROJECTED_GRID_GRAZING_FADE_FULL, Math.abs(normalDotView));
}

/**
 * World-space distance from a coordinate to the nearest period boundary. Uses
 * floor-mod so large positions (e.g. Z=-130) do not rely on fract of huge cell
 * indices.
 *
 * @param worldAlongAxis Position along one grid axis.
 * @param period Line spacing in the same units.
 * @returns Distance in [0, period/2].
 */
export function distanceToNearestProjectedGridLine(worldAlongAxis: number, period: number): number {
  const safePeriod = Math.max(period, 1e-6);
  const halfPeriod = safePeriod * 0.5;
  const wrapped = worldAlongAxis + halfPeriod - safePeriod * Math.floor((worldAlongAxis + halfPeriod) / safePeriod);
  const centered = wrapped - halfPeriod;
  return Math.abs(centered);
}

/**
 * Picks a high-contrast lattice line color for a surface sample. Light lines on
 * dark surfaces, dark lines on light surfaces (display-referred RGB).
 *
 * @param surfaceRgb Encoded surface color.
 * @param themeLineRgb Theme line color before adaptation.
 * @returns Adapted display RGB for the lattice stroke.
 */
export function adaptiveProjectedGridLineColor(surfaceRgb: THREE.Color, themeLineRgb: THREE.Color): THREE.Color {
  const surfaceLuma = projectedGridLuminance(surfaceRgb);
  const lightLine = themeLineRgb.clone().lerp(new THREE.Color(0.84, 0.84, 0.86), 0.78);
  const darkLine = themeLineRgb.clone().lerp(new THREE.Color(0.09, 0.09, 0.1), 0.62);
  const t = smoothstep(0.28, 0.52, surfaceLuma);
  return lightLine.lerp(darkLine, t);
}

/**
 * Rec.709-ish luminance of a display RGB color.
 *
 * @param rgb Color sample.
 * @returns Luminance in 0..1.
 */
function projectedGridLuminance(rgb: THREE.Color): number {
  return rgb.r * 0.2126 + rgb.g * 0.7152 + rgb.b * 0.0722;
}

/**
 * Evaluates an anti-aliased lattice mask from world-space face UV and period
 * using world-space distance and derivative-based anti-aliasing.
 *
 * @param faceUv World-space face UV (not cell-scaled).
 * @param derivativeApprox Approximate |d(faceUv)/d(pixel)| per axis.
 * @param period Line spacing for both axes.
 * @returns Line intensity in 0..1.
 */
export function evaluateProjectedGridLineMask(
  faceUv: THREE.Vector2,
  derivativeApprox: THREE.Vector2,
  period: number = 1,
): number {
  const gx = evaluateAxisLineMask(faceUv.x, Math.max(derivativeApprox.x, PROJECTED_GRID_MIN_AXIS_DERIVATIVE), period);
  const gy = evaluateAxisLineMask(faceUv.y, Math.max(derivativeApprox.y, PROJECTED_GRID_MIN_AXIS_DERIVATIVE), period);
  return Math.min(Math.max(gx + gy - gx * gy, 0), 1);
}

/**
 * Returns the line mask along one world-space axis.
 *
 * @param worldAlongAxis Position along the axis.
 * @param derivative Approximate screen-space derivative of that coordinate.
 * @param period Line spacing.
 * @returns Line intensity in 0..1 for that axis.
 */
function evaluateAxisLineMask(worldAlongAxis: number, derivative: number, period: number): number {
  const safePeriod = Math.max(period, 1e-6);
  const distanceToLine = distanceToNearestProjectedGridLine(worldAlongAxis, safePeriod);
  const halfWidth = Math.min(
    Math.max(derivative * PROJECTED_GRID_LINE_WIDTH_PIXELS, derivative * 0.5),
    safePeriod * 0.45,
  );
  const coreWidth = halfWidth * PROJECTED_GRID_LINE_CORE_FRACTION;
  return 1 - smoothstep(coreWidth, halfWidth, distanceToLine);
}

/**
 * Hermite smoothstep from edge0 to edge1.
 *
 * @param edge0 Lower edge.
 * @param edge1 Upper edge.
 * @param value Sample value.
 * @returns Interpolated 0..1 result.
 */
function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge1 <= edge0) {
    return value < edge0 ? 0 : 1;
  }
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}
