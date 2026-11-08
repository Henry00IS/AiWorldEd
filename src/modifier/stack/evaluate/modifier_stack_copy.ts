import { modifierSmoothTagCopy } from '@/modifier/smooth/modifier_smooth_shading.js';
import * as THREE from 'three';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { FaceSurfaceDescription } from '@/texture/uv_matrix/face_surface_description.js';

/** UserData flag on meshes of brushes that a modifier produced. */
export const MODIFIER_STACK_DERIVED_KEY = 'modifierDerived';

/** UserData id of the authored brush a derived brush was copied from. */
export const MODIFIER_STACK_SOURCE_ID_KEY = 'modifierSourceId';

/** How copied faces keep their texture placement. */
export interface ModifierStackUvPolicy {
  /** 'copied' moves textures with the copy; 'world' keeps world alignment. */
  uv: string;
  /** True flips U on mirrored copies so text stays readable. */
  readable: boolean;
  /** Tiles added to U on every face of the copy. */
  shiftU: number;
  /** Tiles added to V on every face of the copy. */
  shiftV: number;
}

/**
 * Creates the hierarchy mesh of a derived brush. It is never added to the
 * authored scene.
 *
 * @param id Derived brush id.
 * @param sourceId Authored brush the result picks back to, or null.
 * @returns Derived mesh.
 */
export function modifierStackDerivedMesh(id: string, sourceId: string | null): THREE.Mesh {
  const mesh = new THREE.Mesh();
  mesh.userData[MODIFIER_STACK_DERIVED_KEY] = true;
  if (sourceId) mesh.userData[MODIFIER_STACK_SOURCE_ID_KEY] = sourceId;
  mesh.userData['isSolidBrush'] = true;
  SolidBrushVisual.setBrushId(mesh, id);
  return mesh;
}

/**
 * Returns whether a mesh belongs to a derived brush.
 *
 * @param mesh Candidate mesh, or null.
 * @returns True for meshes created by modifierStackDerivedMesh.
 */
export function modifierStackIsDerived(mesh: THREE.Object3D | null | undefined): boolean {
  return mesh?.userData[MODIFIER_STACK_DERIVED_KEY] === true;
}

/**
 * Returns the authored id a brush picks back to.
 *
 * @param brush Authored or derived brush.
 * @returns Authored source id, or null for generated brushes.
 */
export function modifierStackSourceIdOf(brush: SolidBrushInstance): string | null {
  if (!modifierStackIsDerived(brush.mesh)) return brush.id;
  const sourceId: unknown = brush.mesh?.userData[MODIFIER_STACK_SOURCE_ID_KEY];
  return typeof sourceId === 'string' ? sourceId : null;
}

/**
 * Bakes a rigid or reflected copy of a brush into model space.
 *
 * @param source Brush to copy.
 * @param matrix Source-local to model matrix of the copy.
 * @param id Derived id.
 * @param policy Texture placement policy.
 * @returns Derived brush with its own mesh.
 */
export function modifierStackCopyBrush(
  source: SolidBrushInstance,
  matrix: THREE.Matrix4,
  id: string,
  policy: ModifierStackUvPolicy,
): SolidBrushInstance {
  const brush = source.brush.clone();
  brush.transformVertices(matrix);
  if (matrix.determinant() < 0) modifierStackReverseWinding(brush);
  const copy = new SolidBrushInstance(id, source.name, brush, source.operation);
  const sourcePose = source.getModelSpaceMatrix();
  const uvPose = policy.uv === 'world' ? sourcePose.clone().invert() : matrix.clone().invert();
  const mirrored = matrix.determinant() * sourcePose.determinant() < 0;
  const surfaces = source.brush.faces.map((_, index) =>
    modifierStackCopySurface(source, index, uvPose, mirrored && policy.uv !== 'world' && policy.readable, policy),
  );
  copy.restoreFaceSurfaces(source.serializeDefaultSurface(), surfaces);
  copy.mesh = modifierStackDerivedMesh(id, modifierStackSourceIdOf(source));
  modifierSmoothTagCopy(source, copy);
  return copy;
}

/**
 * Moves one face mapping with the copy, optionally keeping text readable, then
 * applies the copy's UV shift.
 *
 * @param source Brush being copied.
 * @param index Face index.
 * @param pose Copy-to-source coordinate matrix.
 * @param reverseU True flips U inside the face's own chart.
 * @param shift Tiles added to U and V.
 * @returns Surface of the copied face.
 */
function modifierStackCopySurface(
  source: SolidBrushInstance,
  index: number,
  pose: THREE.Matrix4,
  reverseU: boolean,
  shift: Pick<ModifierStackUvPolicy, 'shiftU' | 'shiftV'>,
): FaceSurfaceDescription {
  const surface = source.getFaceSurface(index);
  const reflectionOffset = reverseU ? modifierStackMirrorUOffset(source, index) : 0;
  surface.uv = surface.uv.multiplyMatrix4(pose);
  if (reverseU) {
    surface.uv.u.multiplyScalar(-1);
    surface.uv.u.w += reflectionOffset;
  }
  surface.uv.u.w += shift.shiftU;
  surface.uv.v.w += shift.shiftV;
  return surface;
}

/**
 * Returns the U shift that mirrors a face inside its own chart.
 *
 * @param source Brush being copied.
 * @param index Face index.
 * @returns Sum of the face's smallest and largest U.
 */
function modifierStackMirrorUOffset(source: SolidBrushInstance, index: number): number {
  const mapping = source.getFaceSurface(index).uv;
  const face = source.brush.faces[index];
  if (!face) return 0;
  const values = source.brush.getFaceVertexIndices(face).map((vertex) => {
    const point = source.brush.vertices[vertex];
    return point ? mapping.project(point).u : 0;
  });
  return Math.min(...values) + Math.max(...values);
}

/**
 * Reverses face loops and relinks twins after a reflection.
 *
 * @param brush Reflected convex shell.
 */
export function modifierStackReverseWinding(brush: SolidBrush): void {
  for (const face of brush.faces) {
    const indices = brush.getFaceVertexIndices(face).reverse();
    indices.forEach((vertexIndex, offset) => {
      const edge = brush.wingEdges[face.firstEdge + offset];
      if (edge) edge.vertexIndex = vertexIndex;
    });
  }
  modifierStackRelinkTwins(brush);
  brush.recalculatePlanes();
}

/**
 * Reconstructs twin references from directed edges.
 *
 * @param brush Closed shell.
 */
function modifierStackRelinkTwins(brush: SolidBrush): void {
  const directed = new Map<string, number>();
  for (const face of brush.faces) {
    for (let offset = 0; offset < face.edgeCount; offset++) {
      const start = brush.wingEdges[face.firstEdge + offset];
      const end = brush.wingEdges[face.firstEdge + ((offset + 1) % face.edgeCount)];
      if (start && end) directed.set(`${start.vertexIndex}:${end.vertexIndex}`, face.firstEdge + offset);
    }
  }
  for (const [key, index] of directed) {
    const [start, end] = key.split(':');
    const edge = brush.wingEdges[index];
    if (edge) edge.twinIndex = directed.get(`${end}:${start}`) ?? -1;
  }
}
