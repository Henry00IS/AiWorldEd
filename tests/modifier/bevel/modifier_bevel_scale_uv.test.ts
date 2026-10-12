import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { modifierBevelDeriveBrush } from '@/modifier/bevel/modifier_bevel_derived.js';
import { modifierBevelResolveDerivedSurface } from '@/modifier/bevel/modifier_bevel_stand_in.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { applyUvRotateToMatrix } from '@/texture/interactive/math/uv_transform_rotate_math.js';
import type { FaceSurfaceDescription } from '@/texture/uv_matrix/face_surface_description.js';

describe('bevel UVs after object scale', () => {
  it('keeps a rotated face continuous across a multi-segment bevel when the object is scaled', () => {
    const { world, model, volume } = buildBeveledBox(4);
    const brush = model.getBrushes()[0]!;
    rotateUpFace(brush, 37);
    scaleBrush(model, brush, new THREE.Vector3(2.4, 1, 0.55), { positionLock: true, stretchLock: false });
    modifierBevelRefreshScene(world);
    const derived = modifierBevelDeriveBrush(brush, [volume]);
    expect(derived).not.toBeNull();
    expect(worstEdgeGap(brush, derived!)).toBeLessThan(1e-3);
    expect(worstAcrossMismatch(brush, derived!)).toBeLessThan(0.05);
  });

  it('keeps a rotated face continuous when scale stretches the texture with the brush', () => {
    const { world, model, volume } = buildBeveledBox(4);
    const brush = model.getBrushes()[0]!;
    rotateUpFace(brush, 37);
    scaleBrush(model, brush, new THREE.Vector3(0.4, 1, 1.8), { positionLock: true, stretchLock: true });
    modifierBevelRefreshScene(world);
    const derived = modifierBevelDeriveBrush(brush, [volume]);
    expect(derived).not.toBeNull();
    expect(worstEdgeGap(brush, derived!)).toBeLessThan(1e-3);
    expect(worstAcrossMismatch(brush, derived!)).toBeLessThan(0.05);
  });
});

/**
 * Builds a unit box covered by a bevel volume.
 *
 * @param segments Profile segment count.
 * @returns World, model, and volume.
 */
function buildBeveledBox(segments: number): { world: THREE.Group; model: SolidModel; volume: THREE.Mesh } {
  const world = new THREE.Group();
  const model = new SolidModel(`BevelScale${segments}`);
  world.add(model.root);
  model.addBoxBrush(1, SolidOperation.Additive);
  const volume = ModifierVolumeBevel.create();
  volume.scale.set(6, 6, 6);
  ModifierVolumeBevel.writeSegments(volume, segments);
  world.add(volume);
  world.updateMatrixWorld(true);
  modifierBevelRefreshScene(world);
  return { world, model, volume };
}

/**
 * Rotates the local up face UV about its plane.
 *
 * @param brush Brush to edit.
 * @param degrees Rotation degrees.
 */
function rotateUpFace(brush: SolidBrushInstance, degrees: number): void {
  const surfaceIndex = upSurfaceIndex(brush);
  const surface = brush.getFaceSurface(surfaceIndex);
  const normal = brush.brush.planes[surfaceIndex]!.normal.clone();
  const pivot = new THREE.Vector3(0, brush.brush.planes[surfaceIndex]!.offset, 0);
  surface.uv = applyUvRotateToMatrix(surface.uv, pivot, normal, degrees);
  brush.setFaceSurface(surfaceIndex, surface);
}

/**
 * Returns the local plane that points up.
 *
 * @param brush Brush.
 * @returns Surface index.
 */
function upSurfaceIndex(brush: SolidBrushInstance): number {
  const index = brush.brush.planes.findIndex((plane) => plane.normal.y > 0.9);
  if (index < 0) throw new Error('missing up face');
  return index;
}

/**
 * Scales the brush object with world-fixed UVs, matching stretch lock off.
 *
 * @param model Solid model.
 * @param brush Brush to scale.
 * @param scale New object scale.
 * @param locks Position and stretch lock flags.
 */
function scaleBrush(
  model: SolidModel,
  brush: SolidBrushInstance,
  scale: THREE.Vector3,
  locks: { positionLock: boolean; stretchLock: boolean },
): void {
  const mesh = brush.mesh;
  if (!mesh) throw new Error('missing brush mesh');
  mesh.scale.copy(scale);
  mesh.updateMatrixWorld(true);
  model.prepareLiveBrushEdit([mesh], locks);
}

/**
 * Largest UV gap between a chamfer and the face it continues, at either edge
 * point.
 *
 * @param brush Authored brush.
 * @param derived Chamfered brush.
 * @returns Largest gap.
 */
function worstEdgeGap(
  brush: SolidBrushInstance,
  derived: NonNullable<ReturnType<typeof modifierBevelDeriveBrush>>,
): number {
  let worst = 0;
  const memo = new Map<number, FaceSurfaceDescription>();
  derived.faces.forEach((record, faceIndex) => {
    if (!record.chamferEdge || record.smearFromDerivedIndex < 0) return;
    worst = Math.max(worst, edgeGap(brush, derived, faceIndex, record.smearFromDerivedIndex, memo));
  });
  return worst;
}

/**
 * UV distance between two surfaces at both ends of a chamfer edge.
 *
 * @param brush Authored brush.
 * @param derived Chamfered brush.
 * @param faceIndex Destination face.
 * @param fromIndex Source face.
 * @param memo Resolved surfaces.
 * @returns Larger endpoint gap.
 */
function edgeGap(
  brush: SolidBrushInstance,
  derived: NonNullable<ReturnType<typeof modifierBevelDeriveBrush>>,
  faceIndex: number,
  fromIndex: number,
  memo: Map<number, FaceSurfaceDescription>,
): number {
  const record = derived.faces[faceIndex]!;
  const edge = record.chamferEdge;
  if (!edge) return 0;
  const surface = modifierBevelResolveDerivedSurface(brush, derived, faceIndex, memo);
  const from = modifierBevelResolveDerivedSurface(brush, derived, fromIndex, memo);
  const gapA = uvDistance(surface.uv.project(edge.pointA), from.uv.project(edge.pointA));
  const gapB = uvDistance(surface.uv.project(edge.pointB), from.uv.project(edge.pointB));
  return Math.max(gapA, gapB);
}

/**
 * Largest relative mismatch of the UV step that crosses a chamfer edge.
 *
 * @param brush Authored brush.
 * @param derived Chamfered brush.
 * @returns Largest mismatch, 0 when every strip continues.
 */
function worstAcrossMismatch(
  brush: SolidBrushInstance,
  derived: NonNullable<ReturnType<typeof modifierBevelDeriveBrush>>,
): number {
  let worst = 0;
  const memo = new Map<number, FaceSurfaceDescription>();
  derived.faces.forEach((record, faceIndex) => {
    if (!record.chamferEdge || record.smearFromDerivedIndex < 0) return;
    worst = Math.max(worst, acrossMismatch(brush, derived, faceIndex, record.smearFromDerivedIndex, memo));
  });
  return worst;
}

/**
 * Compares the UV change stepping off an edge with the change stepping onto it.
 *
 * @param brush Authored brush.
 * @param derived Chamfered brush.
 * @param faceIndex Destination face.
 * @param fromIndex Source face.
 * @param memo Resolved surfaces.
 * @returns Relative length error, or 1 when the step folds backward.
 */
function acrossMismatch(
  brush: SolidBrushInstance,
  derived: NonNullable<ReturnType<typeof modifierBevelDeriveBrush>>,
  faceIndex: number,
  fromIndex: number,
  memo: Map<number, FaceSurfaceDescription>,
): number {
  const edge = derived.faces[faceIndex]?.chamferEdge;
  if (!edge) return 0;
  const surface = modifierBevelResolveDerivedSurface(brush, derived, faceIndex, memo);
  const from = modifierBevelResolveDerivedSurface(brush, derived, fromIndex, memo);
  const fromNormal = derived.localBrush.planes[fromIndex]!.normal;
  const steps = acrossSteps(from, surface, edge, fromNormal);
  if (steps.sourceU * steps.destU + steps.sourceV * steps.destV >= 0) return 1;
  const sourceLength = Math.hypot(steps.sourceU, steps.sourceV);
  const destLength = Math.hypot(steps.destU, steps.destV);
  if (sourceLength < 1e-8) return 0;
  return Math.abs(destLength - sourceLength) / sourceLength;
}

/**
 * UV deltas for a short step away from a shared edge on each face.
 *
 * @param from Source surface.
 * @param surface Destination surface.
 * @param edge Shared edge.
 * @param fromNormal Source face normal.
 * @returns Source and destination UV deltas.
 */
function acrossSteps(
  from: FaceSurfaceDescription,
  surface: FaceSurfaceDescription,
  edge: { pointA: THREE.Vector3; pointB: THREE.Vector3; destNormal: THREE.Vector3 },
  fromNormal: THREE.Vector3,
): { sourceU: number; sourceV: number; destU: number; destV: number } {
  const intoDest = stepAwayFrom(edge.destNormal, fromNormal, edge.pointA, edge.pointB);
  const intoSource = stepAwayFrom(fromNormal, edge.destNormal, edge.pointA, edge.pointB);
  const mid = edge.pointA.clone().lerp(edge.pointB, 0.5);
  const sourceMid = from.uv.project(mid);
  const sourceStep = from.uv.project(mid.clone().addScaledVector(intoSource, 0.02));
  const destMid = surface.uv.project(mid);
  const destStep = surface.uv.project(mid.clone().addScaledVector(intoDest, 0.02));
  return {
    sourceU: sourceStep.u - sourceMid.u,
    sourceV: sourceStep.v - sourceMid.v,
    destU: destStep.u - destMid.u,
    destV: destStep.v - destMid.v,
  };
}

/**
 * Returns a unit step on one face, away from the other face.
 *
 * @param faceNormal Normal of the face to step on.
 * @param otherNormal Normal of the neighboring face.
 * @param pointA First edge point.
 * @param pointB Second edge point.
 * @returns Unit direction.
 */
function stepAwayFrom(
  faceNormal: THREE.Vector3,
  otherNormal: THREE.Vector3,
  pointA: THREE.Vector3,
  pointB: THREE.Vector3,
): THREE.Vector3 {
  const edgeDirection = new THREE.Vector3().subVectors(pointB, pointA).normalize();
  const across = new THREE.Vector3().crossVectors(faceNormal, edgeDirection);
  if (across.dot(otherNormal) > 0) across.negate();
  if (across.lengthSq() < 1e-12) return new THREE.Vector3();
  return across.normalize();
}

/**
 * Distance between two UV pairs.
 *
 * @param left First UV.
 * @param right Second UV.
 * @returns Euclidean distance.
 */
function uvDistance(left: { u: number; v: number }, right: { u: number; v: number }): number {
  return Math.hypot(left.u - right.u, left.v - right.v);
}
