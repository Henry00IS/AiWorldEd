import * as THREE from 'three';
import type { DataOrientedBounds } from '@/transform/bounds/builder_oriented_bounds.js';
import { CadRulerStyle } from '@/rulers/system/cad_ruler_style.js';
import type { CadLineSegment, CadLabelSpec, LocalAxisIndex } from './cad_dimension_types.js';
import type { CadPlacementContext } from './cad_placement_context.js';

/**
 * Shared scratch vectors for CAD geometry builders (single-threaded render
 * path).
 */
export const scratchCamRight = new THREE.Vector3();
export const scratchCamUp = new THREE.Vector3();
export const scratchAxisX = new THREE.Vector3();
export const scratchAxisY = new THREE.Vector3();
export const scratchAxisZ = new THREE.Vector3();
export const scratchPointA = new THREE.Vector3();
export const scratchPointB = new THREE.Vector3();
export const scratchOutward = new THREE.Vector3();
export const scratchDimA = new THREE.Vector3();
export const scratchDimB = new THREE.Vector3();
export const scratchMid = new THREE.Vector3();
export const scratchWorkA = new THREE.Vector3();
export const scratchWorkB = new THREE.Vector3();
export const scratchToCamera = new THREE.Vector3();
export const scratchEdgeCandidate = new THREE.Vector3();

/** Default camera for tests that omit an explicit placement context. */
export const defaultTestCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);

/**
 * Resolves a legacy bounds-based scale. Prefer camera placement context for
 * live rendering; kept for tests that only need a positive number.
 *
 * @param halfExtents Oriented half extents.
 * @returns Small fixed stand-off independent of the longest edge.
 */
export function resolveCadOffsetScale(halfExtents: THREE.Vector3): number {
  const shortest = Math.min(halfExtents.x, halfExtents.y, halfExtents.z);
  const basis = Number.isFinite(shortest) && shortest > 1e-6 ? shortest : CadRulerStyle.minimumOffsetWorld;
  return THREE.MathUtils.clamp(basis * 0.15, CadRulerStyle.minimumOffsetWorld, 0.35);
}

/**
 * Extracts local axes of oriented bounds into world-space unit vectors. Local Y
 * is world-up when the bounds are unrotated (the editor is Y-up).
 *
 * @param bounds Oriented bounds.
 * @param axisX Receives local +X in world space.
 * @param axisY Receives local +Y in world space.
 * @param axisZ Receives local +Z in world space.
 */
export function extractBoundsAxes(
  bounds: DataOrientedBounds,
  axisX: THREE.Vector3,
  axisY: THREE.Vector3,
  axisZ: THREE.Vector3,
): void {
  axisX.set(1, 0, 0).applyQuaternion(bounds.quaternion).normalize();
  axisY.set(0, 1, 0).applyQuaternion(bounds.quaternion).normalize();
  axisZ.set(0, 0, 1).applyQuaternion(bounds.quaternion).normalize();
}

/**
 * Builds a classic CAD dimension. Extension legs start on the mesh edge when
 * gap is zero, forming a U/Π shape rather than a disconnected H.
 *
 * @param start Measured start point on the object edge.
 * @param end Measured end point on the object edge.
 * @param outwardDirection Unit direction pushing the dimension outside.
 * @param placement Screen-stable offset metrics.
 * @param lineColor Dimension line color.
 * @param extensionColor Extension leg color.
 * @param labelId Stable label id.
 * @param labelText Label text.
 * @param labelColorCss Label CSS color.
 * @param segments Output segments.
 * @param labels Output labels.
 */
export function appendCadDimension(
  start: THREE.Vector3,
  end: THREE.Vector3,
  outwardDirection: THREE.Vector3,
  placement: CadPlacementContext,
  lineColor: THREE.Color,
  extensionColor: THREE.Color,
  labelId: string,
  labelText: string,
  labelColorCss: string,
  segments: CadLineSegment[],
  labels: CadLabelSpec[],
): void {
  const offsetDistance = placement.offsetWorld;
  const gap = placement.gapWorld;
  const overshoot = placement.overshootWorld;
  scratchOutward.copy(outwardDirection).normalize();
  appendExtensionLeg(start, scratchOutward, gap, offsetDistance + overshoot, extensionColor, segments);
  appendExtensionLeg(end, scratchOutward, gap, offsetDistance + overshoot, extensionColor, segments);
  scratchDimA.copy(start).addScaledVector(scratchOutward, offsetDistance);
  scratchDimB.copy(end).addScaledVector(scratchOutward, offsetDistance);
  pushSegment(segments, scratchDimA, scratchDimB, lineColor, lineColor, true);
  labels.push({
    id: labelId,
    worldPosition: scratchMid.copy(scratchDimA).lerp(scratchDimB, 0.5).clone(),
    text: labelText,
    colorCss: labelColorCss,
  });
}

/**
 * Builds the twelve edges of an oriented box wireframe.
 *
 * @param bounds Oriented bounds to outline.
 * @param color Vertex color for every edge.
 * @param segments Output segment list.
 */
export function appendGhostBoxSegments(
  bounds: DataOrientedBounds,
  color: THREE.Color,
  segments: CadLineSegment[],
): void {
  extractBoundsAxes(bounds, scratchAxisX, scratchAxisY, scratchAxisZ);
  const corners = buildBoxCorners(bounds.center, bounds.halfExtents, scratchAxisX, scratchAxisY, scratchAxisZ);
  const edges: Array<[number, number]> = [
    [0, 1],
    [1, 3],
    [3, 2],
    [2, 0],
    [4, 5],
    [5, 7],
    [7, 6],
    [6, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  edges.forEach(([a, b]) => appendBoxEdge(segments, corners, a, b, color));
}

/**
 * Appends one extension leg from the measured point outward. Kept solid (not
 * dashed): on dark viewports, dashing removes too many gray pixels and the legs
 * disappear into the clear color.
 *
 * @param point Measured corner or edge point.
 * @param outward Outward unit direction.
 * @param gap Start gap away from the object (0 connects to the mesh).
 * @param length Full outward length including overshoot.
 * @param color Extension color.
 * @param segments Output segments.
 */
export function appendExtensionLeg(
  point: THREE.Vector3,
  outward: THREE.Vector3,
  gap: number,
  length: number,
  color: THREE.Color,
  segments: CadLineSegment[],
): void {
  scratchWorkA.copy(point).addScaledVector(outward, gap);
  scratchWorkB.copy(point).addScaledVector(outward, length);
  const tip = color.clone().multiplyScalar(0.55);
  pushSegment(segments, scratchWorkA, scratchWorkB, color, tip, false);
}

/**
 * Builds the eight corners of an oriented box in fixed binary order.
 *
 * @param center Box center.
 * @param halfExtents Local half extents.
 * @param axisX World X axis.
 * @param axisY World Y axis.
 * @param axisZ World Z axis.
 * @returns Corner positions.
 */
export function buildBoxCorners(
  center: THREE.Vector3,
  halfExtents: THREE.Vector3,
  axisX: THREE.Vector3,
  axisY: THREE.Vector3,
  axisZ: THREE.Vector3,
): THREE.Vector3[] {
  const corners: THREE.Vector3[] = [];
  for (let ix = 0; ix < 2; ix += 1) {
    for (let iy = 0; iy < 2; iy += 1) {
      for (let iz = 0; iz < 2; iz += 1) {
        const sx = ix === 0 ? -1 : 1;
        const sy = iy === 0 ? -1 : 1;
        const sz = iz === 0 ? -1 : 1;
        corners.push(
          center
            .clone()
            .addScaledVector(axisX, sx * halfExtents.x)
            .addScaledVector(axisY, sy * halfExtents.y)
            .addScaledVector(axisZ, sz * halfExtents.z),
        );
      }
    }
  }
  return corners;
}

/**
 * Appends one box edge between two corner indices.
 *
 * @param segments Output segments.
 * @param corners Corner array.
 * @param indexA Start corner index.
 * @param indexB End corner index.
 * @param color Edge color.
 */
export function appendBoxEdge(
  segments: CadLineSegment[],
  corners: THREE.Vector3[],
  indexA: number,
  indexB: number,
  color: THREE.Color,
): void {
  const startCorner = corners[indexA];
  const endCorner = corners[indexB];
  if (!startCorner || !endCorner) return;
  pushSegment(segments, startCorner, endCorner, color, color);
}

/**
 * Pushes one colored segment from two points.
 *
 * @param segments Output list.
 * @param a Start point.
 * @param b End point.
 * @param colorA Start color.
 * @param colorB End color.
 * @param dashed When true, stroke uses screen-pixel dashing at draw time.
 */
export function pushSegment(
  segments: CadLineSegment[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  colorA: THREE.Color,
  colorB: THREE.Color,
  dashed: boolean = false,
): void {
  segments.push({
    ax: a.x,
    ay: a.y,
    az: a.z,
    bx: b.x,
    by: b.y,
    bz: b.z,
    colorA,
    colorB,
    dashed,
  });
}

/**
 * Returns the next local axis index (0→1→2→0).
 *
 * @param axis Current axis.
 * @returns Next axis.
 */
export function nextAxis(axis: LocalAxisIndex): LocalAxisIndex {
  if (axis === 0) return 1;
  if (axis === 1) return 2;
  return 0;
}

/**
 * Reads a half-extent component by local axis index.
 *
 * @param halfExtents Half extents vector.
 * @param axis Local axis.
 * @returns Component value.
 */
export function getHalfComponent(halfExtents: THREE.Vector3, axis: LocalAxisIndex): number {
  if (axis === 0) return halfExtents.x;
  if (axis === 1) return halfExtents.y;
  return halfExtents.z;
}
