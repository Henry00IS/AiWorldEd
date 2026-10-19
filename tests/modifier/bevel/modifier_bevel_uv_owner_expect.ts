import * as THREE from 'three';
import { modifierBevelDeriveBrush, type ModifierBevelDerivedBrush } from '@/modifier/bevel/modifier_bevel_derived.js';
import { modifierBevelResolveDerivedSurface } from '@/modifier/bevel/modifier_bevel_stand_in.js';
import {
  modifierBevelProfileChain,
  modifierBevelProfileStrip,
} from '@/modifier/bevel/modifier_bevel_uv_layout_profile.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import {
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_CONTINUE,
  MODIFIER_VOLUME_BEVEL_UV_OWNER_SINGLE,
  MODIFIER_VOLUME_BEVEL_UV_OWNER_SPLIT,
  MODIFIER_VOLUME_BEVEL_UV_PIVOT_ANCHOR,
  MODIFIER_VOLUME_BEVEL_UV_SPACE_WORLD,
  MODIFIER_VOLUME_BEVEL_UV_POSITIVE_Y,
  MODIFIER_VOLUME_BEVEL_UV_WINDING,
  type ModifierBevelUvOwner,
  type ModifierBevelUvPivot,
  type ModifierBevelUvSpace,
} from '@/modifier/volume/modifier_volume_bevel_keys.js';
import { modifierBevelSharedEdge } from '@/modifier/bevel/modifier_bevel_face_graph.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import { applyUvRotateToMatrix } from '@/texture/interactive/math/uv_transform_rotate_math.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { boxInstance, deriveVolume } from './modifier_bevel_uv_owner_fixture.js';

/**
 * Returns whether every face in a curve uses one parent.
 *
 * @param derived Derived brush.
 * @param chain Face indices from the split derive.
 * @param parent Expected parent.
 * @returns True when the chain is non-empty and uniform.
 */
export function sharesParent(derived: ModifierBevelDerivedBrush, chain: readonly number[], parent: number): boolean {
  if (chain.length < 2) return false;
  return chain.every((face) => derived.faces[face]?.parentSurfaceIndex === parent);
}

/**
 * Derives a one-segment bevel with one owner and volume rotation.
 *
 * @param owner Curve owner.
 * @param rotation Volume rotation in degrees.
 * @returns Instance and derived brush.
 */
export function ownedTurn(
  owner: ModifierBevelUvOwner,
  rotation: number,
): { instance: SolidBrushInstance; derived: ModifierBevelDerivedBrush } {
  return deriveVolume(1, owner, MODIFIER_VOLUME_BEVEL_UV_WINDING, 1, rotation, MODIFIER_VOLUME_BEVEL_UV_PIVOT_ANCHOR);
}

/**
 * Derives a one-segment bevel after rotating the top face.
 *
 * @param owner Curve owner.
 * @returns Instance and derived brush.
 */
export function turnedParent(owner: ModifierBevelUvOwner): {
  instance: SolidBrushInstance;
  derived: ModifierBevelDerivedBrush;
} {
  const instance = boxInstance();
  rotateTopFace(instance, 40);
  return deriveInstance(instance, owner, 1, 0);
}

/**
 * Rotates the top face UV about its plane.
 *
 * @param instance Authored instance.
 * @param degrees Rotation in degrees.
 */
function rotateTopFace(instance: SolidBrushInstance, degrees: number): void {
  const index = instance.brush.planes.findIndex((plane) => plane.normal.y > 0.9);
  const plane = instance.brush.planes[index];
  if (!plane || index < 0) return;
  const surface = instance.getFaceSurface(index);
  const pivot = new THREE.Vector3(0, plane.offset, 0);
  surface.uv = applyUvRotateToMatrix(surface.uv, pivot, plane.normal.clone(), degrees);
  instance.setFaceSurface(index, surface);
}

/**
 * Derives one instance with a bevel volume.
 *
 * @param instance Authored instance.
 * @param owner Curve owner.
 * @param segments Profile segment count.
 * @param rotation Volume rotation in degrees.
 * @returns Instance and derived brush.
 */
function deriveInstance(
  instance: SolidBrushInstance,
  owner: ModifierBevelUvOwner,
  segments: number,
  rotation: number,
): { instance: SolidBrushInstance; derived: ModifierBevelDerivedBrush } {
  const volume = ModifierVolumeBevel.create();
  volume.scale.set(6, 6, 6);
  const settings = ModifierVolumeBevel.readSettings(volume);
  ModifierVolumeBevel.writeSettings(volume, {
    ...settings,
    segments,
    uvOwner: owner,
    uvRotation: rotation,
    uvLayout: MODIFIER_VOLUME_BEVEL_UV_LAYOUT_CONTINUE,
  });
  volume.updateMatrixWorld(true);
  const derived = modifierBevelDeriveBrush(instance, [volume]);
  if (!derived) throw new Error('expected a derived bevel');
  return { instance, derived };
}

/**
 * Derives a two-segment single-owned curve.
 *
 * @param rotation Volume rotation in degrees.
 * @returns Instance, derived brush, and curve faces.
 */
export function ownedSegments(rotation: number): {
  instance: SolidBrushInstance;
  derived: ModifierBevelDerivedBrush;
  chain: number[];
} {
  const placed = deriveVolume(
    2,
    MODIFIER_VOLUME_BEVEL_UV_OWNER_SINGLE,
    MODIFIER_VOLUME_BEVEL_UV_WINDING,
    1,
    rotation,
    MODIFIER_VOLUME_BEVEL_UV_PIVOT_ANCHOR,
  );
  return { ...placed, chain: modifierBevelProfileChain(placed.derived, firstStrip(placed.derived)) };
}

/**
 * Returns whether two derives use the same UV on the first strip.
 *
 * @param left First derive.
 * @param right Second derive.
 * @returns True when the edge and a third vertex agree.
 */
export function stripAgrees(
  left: { instance: SolidBrushInstance; derived: ModifierBevelDerivedBrush },
  right: { instance: SolidBrushInstance; derived: ModifierBevelDerivedBrush },
): boolean {
  return faceAgrees(left, right, firstStrip(left.derived));
}

/**
 * Returns the strip whose parent is the top face.
 *
 * @param derived Derived brush.
 * @returns Face index, or -1.
 */
export function stripOwnedByTop(derived: ModifierBevelDerivedBrush): number {
  return stripOwnedByParent(derived, 1);
}

/**
 * Returns a strip owned by one authored face.
 *
 * @param derived Derived brush.
 * @param parent Authored parent.
 * @returns Face index, or -1.
 */
function stripOwnedByParent(derived: ModifierBevelDerivedBrush, parent: number): number {
  return derived.faces.findIndex(
    (face, index) => modifierBevelProfileStrip(derived, index) && face.parentSurfaceIndex === parent,
  );
}

/**
 * Derives a brush rolled 90 degrees with one UV space.
 *
 * @param space Map axes or brush axes.
 * @returns Instance and derived brush.
 */
export function rolledFlow(space: ModifierBevelUvSpace): {
  instance: SolidBrushInstance;
  derived: ModifierBevelDerivedBrush;
} {
  const instance = boxInstance();
  instance.mesh?.rotation.set(0, 0, Math.PI / 2);
  instance.mesh?.updateMatrixWorld(true);
  const volume = ModifierVolumeBevel.create();
  volume.scale.set(6, 6, 6);
  const settings = ModifierVolumeBevel.readSettings(volume);
  ModifierVolumeBevel.writeSettings(volume, {
    ...settings,
    uvFlow: MODIFIER_VOLUME_BEVEL_UV_POSITIVE_Y,
    uvSpace: space,
  });
  volume.updateMatrixWorld(true);
  const derived = modifierBevelDeriveBrush(instance, [volume]);
  if (!derived) throw new Error('expected a derived bevel');
  return { instance, derived };
}

/**
 * Returns whether two derives agree on one face.
 *
 * @param left First derive.
 * @param right Second derive.
 * @param face Face index.
 * @returns True when the edge and a third vertex agree.
 */
export function faceAgrees(
  left: { instance: SolidBrushInstance; derived: ModifierBevelDerivedBrush },
  right: { instance: SolidBrushInstance; derived: ModifierBevelDerivedBrush },
  face: number,
): boolean {
  const edge = left.derived.faces[face]?.chamferEdge;
  if (!edge) return false;
  const leftUv = modifierBevelResolveDerivedSurface(left.instance, left.derived, face).uv;
  const rightUv = modifierBevelResolveDerivedSurface(right.instance, right.derived, face).uv;
  const far = farVertex(left.derived, face, edge.pointA, edge.pointB);
  return (
    uvClose(leftUv, rightUv, edge.pointA) && uvClose(leftUv, rightUv, edge.pointB) && uvClose(leftUv, rightUv, far)
  );
}

/**
 * Returns a face vertex that is not an endpoint of the chamfer edge.
 *
 * @param derived Derived brush.
 * @param faceIndex Face index.
 * @param pointA First edge point.
 * @param pointB Second edge point.
 * @returns Another vertex, or the first edge point when the face is only that
 *   edge.
 */
function farVertex(
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  pointA: THREE.Vector3,
  pointB: THREE.Vector3,
): THREE.Vector3 {
  const face = derived.localBrush.faces[faceIndex];
  const points = face ? derived.localBrush.getFaceVertices(face) : [];
  for (const point of points) {
    if (point.distanceTo(pointA) > 1e-4 && point.distanceTo(pointB) > 1e-4) return point;
  }
  return pointA;
}

/**
 * Returns whether two matrices agree at a point.
 *
 * @param left First matrix.
 * @param right Second matrix.
 * @param point Local point.
 * @returns True when U and V agree.
 */
function uvClose(left: SurfaceUvMatrix, right: SurfaceUvMatrix, point: THREE.Vector3): boolean {
  const a = left.project(point);
  const b = right.project(point);
  return Math.abs(a.u - b.u) < 1e-3 && Math.abs(a.v - b.v) < 1e-3;
}

/**
 * Returns whether neighboring segments of a turned curve still share UVs.
 *
 * @param turned Rotated derive.
 * @param chain Curve faces.
 * @returns True when every shared vertex matches.
 */
export function curveStaysContinuous(
  turned: { instance: SolidBrushInstance; derived: ModifierBevelDerivedBrush },
  chain: readonly number[],
): boolean {
  for (let index = 1; index < chain.length; index += 1) {
    if (!seamAgrees(turned, chain[index - 1] ?? 0, chain[index] ?? 0)) return false;
  }
  return chain.length > 1;
}

/**
 * Returns whether every segment turns by the same angle in its plane.
 *
 * @param plain Unrotated derive.
 * @param turned Rotated derive.
 * @param chain Curve faces.
 * @returns True when the signed turns agree and are not zero.
 */
export function curveTurnsAsOne(
  plain: { instance: SolidBrushInstance; derived: ModifierBevelDerivedBrush },
  turned: { instance: SolidBrushInstance; derived: ModifierBevelDerivedBrush },
  chain: readonly number[],
): boolean {
  const angles = chain.map((face) => faceTurnAngle(plain, turned, face));
  const first = angles[0];
  if (first === undefined || Math.abs(first) < 0.2) return false;
  return angles.every((angle) => Math.abs(angle - first) < 0.05);
}

/**
 * Returns whether a turn keeps each face's texel lengths and shear.
 *
 * @param plain Unrotated derive.
 * @param turned Rotated derive.
 * @param chain Curve faces.
 * @returns True when the in-plane U and V metrics match as a pair.
 */
export function curveKeepsMetric(
  plain: { instance: SolidBrushInstance; derived: ModifierBevelDerivedBrush },
  turned: { instance: SolidBrushInstance; derived: ModifierBevelDerivedBrush },
  chain: readonly number[],
): boolean {
  return chain.every((face) => metricHolds(plain, turned, face));
}

/**
 * Returns whether two derives print the same UV on a curve.
 *
 * @param left First derive.
 * @param right Second derive.
 * @param chain Curve faces.
 * @returns True when every vertex agrees.
 */
export function curveMatches(
  left: { instance: SolidBrushInstance; derived: ModifierBevelDerivedBrush },
  right: { instance: SolidBrushInstance; derived: ModifierBevelDerivedBrush },
  chain: readonly number[],
): boolean {
  return chain.every((face) => faceUvAgrees(left, right, face));
}

/** Derive pair used by the rotation checks. */
interface CurveDerive {
  /** Authored instance. */
  instance: SolidBrushInstance;
  /** Derived bevel. */
  derived: ModifierBevelDerivedBrush;
}

/**
 * Returns whether one shared edge still has one UV.
 *
 * @param turned Rotated derive.
 * @param left First segment.
 * @param right Next segment.
 * @returns True when both endpoints agree.
 */
function seamAgrees(turned: CurveDerive, left: number, right: number): boolean {
  const edge = modifierBevelSharedEdge(turned.derived.localBrush, left, right);
  if (!edge) return false;
  const leftUv = faceUv(turned, left);
  const rightUv = faceUv(turned, right);
  return uvClose(leftUv, rightUv, edge.pointA) && uvClose(leftUv, rightUv, edge.pointB);
}

/**
 * Returns the signed in-plane turn of increasing U.
 *
 * @param plain Unrotated derive.
 * @param turned Rotated derive.
 * @param faceIndex Segment index.
 * @returns Radians about the face normal.
 */
function faceTurnAngle(plain: CurveDerive, turned: CurveDerive, faceIndex: number): number {
  const normal = faceNormal(plain, faceIndex);
  const before = inPlane(gradient(faceUv(plain, faceIndex), 'u'), normal);
  const after = inPlane(gradient(faceUv(turned, faceIndex), 'u'), normal);
  return signedAngle(before, after, normal);
}

/**
 * Returns whether one face keeps its texel lengths and shear.
 *
 * @param plain Unrotated derive.
 * @param turned Rotated derive.
 * @param faceIndex Segment index.
 * @returns True when the metric pair matches.
 */
function metricHolds(plain: CurveDerive, turned: CurveDerive, faceIndex: number): boolean {
  const before = faceMetric(plain, faceIndex);
  const after = faceMetric(turned, faceIndex);
  return lengthsMatch(before, after) && Math.abs(Math.abs(before.dot) - Math.abs(after.dot)) < 1e-3;
}

/**
 * Returns whether every vertex of one face keeps its UV.
 *
 * @param left First derive.
 * @param right Second derive.
 * @param faceIndex Face index.
 * @returns True when the samples agree.
 */
function faceUvAgrees(left: CurveDerive, right: CurveDerive, faceIndex: number): boolean {
  const face = left.derived.localBrush.faces[faceIndex];
  const points = face ? left.derived.localBrush.getFaceVertices(face) : [];
  const before = faceUv(left, faceIndex);
  const after = faceUv(right, faceIndex);
  return points.every((point) => uvClose(before, after, point));
}

/**
 * Resolves one face UV.
 *
 * @param sample Derive.
 * @param faceIndex Face index.
 * @returns UV matrix.
 */
function faceUv(sample: CurveDerive, faceIndex: number): SurfaceUvMatrix {
  return modifierBevelResolveDerivedSurface(sample.instance, sample.derived, faceIndex).uv;
}

/**
 * Returns the outward normal of one face.
 *
 * @param sample Derive.
 * @param faceIndex Face index.
 * @returns Unit normal, or +Y when the plane is missing.
 */
function faceNormal(sample: CurveDerive, faceIndex: number): THREE.Vector3 {
  return sample.derived.localBrush.planes[faceIndex]?.normal.clone() ?? new THREE.Vector3(0, 1, 0);
}

/**
 * Measures the in-plane U and V gradients.
 *
 * @param sample Derive.
 * @param faceIndex Face index.
 * @returns Lengths and their dot product.
 */
function faceMetric(sample: CurveDerive, faceIndex: number): { long: number; short: number; dot: number } {
  const normal = faceNormal(sample, faceIndex);
  const along = inPlane(gradient(faceUv(sample, faceIndex), 'u'), normal);
  const across = inPlane(gradient(faceUv(sample, faceIndex), 'v'), normal);
  const lengths = [along.length(), across.length()].sort((left, right) => left - right);
  return { long: lengths[1] ?? 0, short: lengths[0] ?? 0, dot: along.dot(across) };
}

/**
 * Returns whether two metric pairs agree.
 *
 * @param before Unrotated metric.
 * @param after Rotated metric.
 * @returns True when both lengths agree.
 */
function lengthsMatch(before: { long: number; short: number }, after: { long: number; short: number }): boolean {
  return Math.abs(before.long - after.long) < 1e-3 && Math.abs(before.short - after.short) < 1e-3;
}

/**
 * Projects a gradient into a face plane.
 *
 * @param direction Gradient.
 * @param normal Unit face normal.
 * @returns In-plane vector.
 */
function inPlane(direction: THREE.Vector3, normal: THREE.Vector3): THREE.Vector3 {
  return direction.clone().addScaledVector(normal, -direction.dot(normal));
}

/**
 * Returns one UV row as a direction.
 *
 * @param matrix UV matrix.
 * @param axis Row to read.
 * @returns Gradient.
 */
function gradient(matrix: SurfaceUvMatrix, axis: 'u' | 'v'): THREE.Vector3 {
  const row = axis === 'u' ? matrix.u : matrix.v;
  return new THREE.Vector3(row.x, row.y, row.z);
}

/**
 * Returns the signed angle from one direction to another.
 *
 * @param before Unrotated direction.
 * @param after Rotated direction.
 * @param normal Unit face normal.
 * @returns Radians.
 */
function signedAngle(before: THREE.Vector3, after: THREE.Vector3, normal: THREE.Vector3): number {
  if (before.lengthSq() < 1e-12 || after.lengthSq() < 1e-12) return 0;
  const from = before.clone().normalize();
  const to = after.clone().normalize();
  return Math.atan2(new THREE.Vector3().crossVectors(from, to).dot(normal), from.dot(to));
}

/**
 * Returns the first profile strip.
 *
 * @param derived Derived brush.
 * @returns Face index.
 */
function firstStrip(derived: ModifierBevelDerivedBrush): number {
  const index = derived.faces.findIndex((_, face) => modifierBevelProfileStrip(derived, face));
  return index < 0 ? 0 : index;
}

/**
 * Resolves one rotated curve.
 *
 * @param rotation Rotation in degrees.
 * @param pivot Rotation pivot.
 * @returns Matrix, derived brush, chain, and a point on the first segment.
 */
export function pivotedSurface(
  rotation: number,
  pivot: ModifierBevelUvPivot,
): {
  matrix: SurfaceUvMatrix;
  derived: ModifierBevelDerivedBrush;
  chain: number[];
  origin: THREE.Vector3;
} {
  const { instance, derived } = deriveVolume(
    4,
    MODIFIER_VOLUME_BEVEL_UV_OWNER_SINGLE,
    MODIFIER_VOLUME_BEVEL_UV_WINDING,
    1,
    rotation,
    pivot,
  );
  const chain = modifierBevelProfileChain(derived, firstStrip(derived));
  const face = chain[0] ?? 0;
  const origin = derived.faces[face]?.chamferEdge?.pointA.clone() ?? new THREE.Vector3();
  return { matrix: modifierBevelResolveDerivedSurface(instance, derived, face).uv, derived, chain, origin };
}

/**
 * Returns the center of a curve's UV bounds.
 *
 * @param matrix UV matrix.
 * @param derived Derived brush.
 * @param chain Curve faces.
 * @returns Center UV.
 */
export function boundsCenter(
  matrix: SurfaceUvMatrix,
  derived: ModifierBevelDerivedBrush,
  chain: readonly number[],
): {
  u: number;
  v: number;
} {
  let minU = Number.POSITIVE_INFINITY;
  let minV = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;
  for (const face of chain)
    includeFaceBounds(matrix, derived, face, (u, v) => {
      minU = Math.min(minU, u);
      minV = Math.min(minV, v);
      maxU = Math.max(maxU, u);
      maxV = Math.max(maxV, v);
    });
  return { u: (minU + maxU) * 0.5, v: (minV + maxV) * 0.5 };
}

/**
 * Visits the UV of every vertex on one face.
 *
 * @param matrix UV matrix.
 * @param derived Derived brush.
 * @param faceIndex Face index.
 * @param visit Called with each UV.
 */
function includeFaceBounds(
  matrix: SurfaceUvMatrix,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  visit: (u: number, v: number) => void,
): void {
  const face = derived.localBrush.faces[faceIndex];
  const points = face ? derived.localBrush.getFaceVertices(face) : [];
  for (const point of points) {
    const sample = matrix.project(point);
    visit(sample.u, sample.v);
  }
}

/**
 * Finds a local point that projects to a target UV.
 *
 * @param matrix UV matrix.
 * @param origin Known local point.
 * @param target Target UV.
 * @returns Local point.
 */
export function pointForUv(
  matrix: SurfaceUvMatrix,
  origin: THREE.Vector3,
  target: { u: number; v: number },
): THREE.Vector3 {
  const uAxis = new THREE.Vector3(matrix.u.x, matrix.u.y, matrix.u.z);
  const vAxis = new THREE.Vector3(matrix.v.x, matrix.v.y, matrix.v.z);
  const at = matrix.project(origin);
  const solved = solvePlane(uAxis, vAxis, target.u - at.u, target.v - at.v);
  return origin.clone().addScaledVector(uAxis, solved.a).addScaledVector(vAxis, solved.b);
}

/**
 * Solves a 2D step along two gradients.
 *
 * @param uAxis U gradient.
 * @param vAxis V gradient.
 * @param du Desired U change.
 * @param dv Desired V change.
 * @returns Coefficients of the two gradients.
 */
function solvePlane(uAxis: THREE.Vector3, vAxis: THREE.Vector3, du: number, dv: number): { a: number; b: number } {
  const uu = uAxis.dot(uAxis);
  const vv = vAxis.dot(vAxis);
  const uv = uAxis.dot(vAxis);
  const det = uu * vv - uv * uv;
  if (Math.abs(det) < 1e-12) return { a: 0, b: 0 };
  return { a: (du * vv - dv * uv) / det, b: (dv * uu - du * uv) / det };
}

/**
 * Returns a neutral placement with one rotation.
 *
 * @param rotation Rotation in degrees.
 * @returns Placement.
 */
export function neutralPlacement(rotation: number): {
  uvScaleU: number;
  uvScaleV: number;
  uvOffsetU: number;
  uvOffsetV: number;
  uvRotation: number;
  uvOwner: ModifierBevelUvOwner;
  uvPivot: ModifierBevelUvPivot;
  uvSpace: ModifierBevelUvSpace;
} {
  return {
    uvScaleU: 1,
    uvScaleV: 1,
    uvOffsetU: 0,
    uvOffsetV: 0,
    uvRotation: rotation,
    uvOwner: MODIFIER_VOLUME_BEVEL_UV_OWNER_SPLIT,
    uvPivot: MODIFIER_VOLUME_BEVEL_UV_PIVOT_ANCHOR,
    uvSpace: MODIFIER_VOLUME_BEVEL_UV_SPACE_WORLD,
  };
}
