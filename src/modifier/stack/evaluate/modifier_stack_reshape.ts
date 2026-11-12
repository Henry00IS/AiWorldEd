import { modifierSmoothTagCopy } from '@/modifier/smooth/modifier_smooth_shading.js';
import * as THREE from 'three';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidBrushPlaneClip } from '@/solid/brush/solid_brush_plane_clip.js';
import { transferSurfacesByPlaneMatch } from '@/solid/brush/solid_brush_surface_transfer.js';
import { deserializeFaceSurface, type FaceSurfaceDescription } from '@/texture/uv_matrix/face_surface_description.js';
import type { ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackReverseWinding } from './modifier_stack_copy.js';

/** Stand-in that stays hidden even when it reads its pose from the shared mesh. */
class ModifierStackHiddenBrush extends SolidBrushInstance {
  /** Reads the pose from the mesh and stays hidden. */
  override pullTransformFromMesh(): void {
    super.pullTransformFromMesh();
    this.visible = false;
  }
}

/** Hidden stand-in per authored instance, so an unchanged hide is not dirty. */
const modifierStackHiddenStandIns = new WeakMap<SolidBrushInstance, SolidBrushInstance>();

/** Replacement instance per authored id, per solid, from the last compile. */
const modifierStackReplacedByScope = new Map<string, ReadonlyMap<string, SolidBrushInstance>>();

/**
 * Builds a compile-only instance with new geometry that keeps the source's id,
 * mesh, pose and visibility, so picking and scene order stay with the source.
 *
 * @param source Brush being reshaped.
 * @param brush New geometry in the source's local space.
 * @param surfaces Face surfaces aligned with the new faces.
 * @returns Stand-in.
 */
export function modifierStackReshapeStandIn(
  source: SolidBrushInstance,
  brush: SolidBrush,
  surfaces: (FaceSurfaceDescription | undefined)[],
): SolidBrushInstance {
  const standIn = new SolidBrushInstance(source.id, source.name, brush, source.operation);
  standIn.mesh = source.mesh;
  standIn.position.copy(source.position);
  standIn.rotation.copy(source.rotation);
  standIn.scale.copy(source.scale);
  standIn.visible = source.visible;
  standIn.restoreFaceSurfaces(source.serializeDefaultSurface(), surfaces);
  return standIn;
}

/**
 * Applies an affine model-space operator to a brush in its own local space.
 * Affine maps keep convex brushes convex.
 *
 * @param source Brush to reshape.
 * @param modelTransform Operator acting on model coordinates.
 * @param uv 'copied' moves textures with the shape; 'world' keeps them fixed.
 * @returns Reshaped stand-in.
 */
export function modifierStackReshapeTransform(
  source: SolidBrushInstance,
  modelTransform: THREE.Matrix4,
  uv: string,
): SolidBrushInstance {
  const pose = source.getModelSpaceMatrix();
  const local = pose.clone().invert().multiply(modelTransform).multiply(pose);
  const brush = source.brush.clone();
  brush.transformVertices(local);
  if (local.determinant() < 0) modifierStackReverseWinding(brush);
  const inverse = local.clone().invert();
  const surfaces = source.brush.faces.map((_, index) => {
    const surface = source.getFaceSurface(index);
    if (uv !== 'world') surface.uv = surface.uv.multiplyMatrix4(inverse);
    return surface;
  });
  const standIn = modifierStackReshapeStandIn(source, brush, surfaces);
  modifierSmoothTagCopy(source, standIn);
  return standIn;
}

/**
 * Cuts a brush by a model-space plane and keeps its front half. Faces keep
 * their surfaces; the cut face gets the brush's default surface.
 *
 * @param source Brush to cut.
 * @param modelPlane Plane in model coordinates; its normal points at the kept
 *   side.
 * @returns Cut stand-in, the source itself when the plane misses it, or null
 *   when nothing is left.
 */
export function modifierStackReshapeClip(
  source: SolidBrushInstance,
  modelPlane: THREE.Plane,
): SolidBrushInstance | null {
  const local = modelPlane.clone().applyMatrix4(source.getModelSpaceMatrix().invert());
  const side = source.brush.vertices.map((vertex) => local.distanceToPoint(vertex));
  if (side.every((distance) => distance >= -1e-6)) return source;
  if (side.every((distance) => distance <= 1e-6)) return null;
  const brush = SolidBrushPlaneClip.clipKeepThreeHalfSpace(source.brush, local, true);
  if (!brush) return null;
  const faces = source.brush.faces.map((_, index) => source.getFaceSurface(index));
  const fallback = deserializeFaceSurface(source.serializeDefaultSurface());
  const transferred = transferSurfacesByPlaneMatch(source.brush, fallback, faces, brush);
  return modifierStackReshapeStandIn(source, brush, transferred.faceSurfaces);
}

/**
 * Returns a stand-in that keeps an authored brush out of the CSG, reused while
 * the authored instance lives.
 *
 * @param source Authored brush.
 * @returns Hidden stand-in.
 */
export function modifierStackHiddenStandIn(source: SolidBrushInstance): SolidBrushInstance {
  const known = modifierStackHiddenStandIns.get(source);
  if (known) return known;
  const hidden = new ModifierStackHiddenBrush(source.id, source.name, source.brush.clone(), source.operation);
  hidden.mesh = source.mesh;
  hidden.pullTransformFromMesh();
  hidden.restoreFaceSurfaces(source.serializeDefaultSurface(), source.serializeFaceSurfaces());
  modifierStackHiddenStandIns.set(source, hidden);
  return hidden;
}

/**
 * Collects the reshaped authored brushes of a final working set.
 *
 * @param units Final working set of one volume.
 * @returns Stand-in per authored id.
 */
export function modifierStackReshapedOf(units: readonly ModifierStackUnit[]): Map<string, SolidBrushInstance> {
  const reshaped = new Map<string, SolidBrushInstance>();
  for (const unit of units) {
    if (!unit.authored || !unit.reshaped) continue;
    for (const brush of unit.brushes) reshaped.set(brush.id, brush);
  }
  return reshaped;
}

/**
 * Remembers this compile's replacements of a solid and returns the authored ids
 * whose replacement appeared, changed or went away.
 *
 * @param scopeId Solid identity.
 * @param replaced Replacement per authored id.
 * @returns Ids whose prepared geometry must refresh.
 */
export function modifierStackReshapeChanged(
  scopeId: string,
  replaced: ReadonlyMap<string, SolidBrushInstance>,
): string[] {
  const previous = modifierStackReplacedByScope.get(scopeId) ?? new Map<string, SolidBrushInstance>();
  modifierStackReplacedByScope.set(scopeId, replaced);
  const ids = new Set([...previous.keys(), ...replaced.keys()]);
  return [...ids].filter((id) => previous.get(id) !== replaced.get(id));
}
