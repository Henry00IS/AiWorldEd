import * as THREE from 'three';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { FaceTextureMapping, cloneFaceTextureMapping } from '@/texture/uv/face_texture_mapping.js';

const scratchBrushLocal = new THREE.Matrix4();
const scratchWorldFromLocal = new THREE.Matrix4();

/**
 * Builds world matrix for a brush, including intermediate solid CSG group
 * parents: solidRoot.world * modelSpaceMatrix.
 *
 * @param brush Brush instance.
 * @param solidRoot Solid model root group.
 * @param out Matrix filled with brush world transform.
 * @param updateWorld Whether to refresh solidRoot.matrixWorld and its parents,
 *   but not its children (default true).
 */
export function composeBrushWorldFromLocal(
  brush: SolidBrushInstance,
  solidRoot: THREE.Object3D,
  out: THREE.Matrix4,
  updateWorld: boolean = true,
): void {
  if (updateWorld) solidRoot.updateWorldMatrix(true, false);
  brush.pullTransformFromMesh();
  scratchBrushLocal.copy(brush.getModelSpaceMatrix());
  out.multiplyMatrices(solidRoot.matrixWorld, scratchBrushLocal);
}

/**
 * Converts a face UV mapping using a precomputed right-multiply matrix: result
 * = mapping.uv * rightMatrix.
 *
 * @param mapping Source mapping.
 * @param rightMatrix Matrix multiplied on the right of the UV matrix.
 * @returns Converted mapping.
 */
export function multiplyFaceMappingUv(mapping: FaceTextureMapping, rightMatrix: THREE.Matrix4): FaceTextureMapping {
  const result = cloneFaceTextureMapping(mapping);
  result.uv = mapping.uv.multiplyMatrix4(rightMatrix);
  return result;
}

/**
 * Converts a face UV mapping authored in world space (UV editor / result bake)
 * into brush-local space for SolidBrushInstance storage. Brush-local bake uses
 * inv(brushModel) * modelVertex, so the stored matrix must absorb the brush and
 * solid-root world transform: M_local = M_world * rootWorld * brushLocal.
 *
 * @param mapping World-space face mapping.
 * @param brush Brush instance receiving the mapping.
 * @param solidRoot Solid model root group (provides root world matrix).
 * @returns Mapping whose UV matrix is brush-local.
 */
export function convertWorldFaceMappingToBrushLocal(
  mapping: FaceTextureMapping,
  brush: SolidBrushInstance,
  solidRoot: THREE.Object3D,
): FaceTextureMapping {
  composeBrushWorldFromLocal(brush, solidRoot, scratchWorldFromLocal);
  return multiplyFaceMappingUv(mapping, scratchWorldFromLocal);
}

/**
 * Converts a brush-local face UV mapping into world space for result-mesh face
 * maps and the UV editor. Inverse of convertWorldFaceMappingToBrushLocal:
 * M_world = M_local * inv(rootWorld * brushLocal).
 *
 * @param mapping Brush-local face mapping.
 * @param brush Owning brush instance.
 * @param solidRoot Solid model root group.
 * @returns Mapping whose UV matrix projects world positions.
 */
export function convertBrushLocalFaceMappingToWorld(
  mapping: FaceTextureMapping,
  brush: SolidBrushInstance,
  solidRoot: THREE.Object3D,
): FaceTextureMapping {
  composeBrushWorldFromLocal(brush, solidRoot, scratchWorldFromLocal);
  const inverse = scratchWorldFromLocal.clone().invert();
  return multiplyFaceMappingUv(mapping, inverse);
}

/**
 * Converts a brush-local mapping using a precomputed inv(root*brushLocal).
 * Prefer this when converting many faces of the same brush.
 *
 * @param mapping Brush-local face mapping.
 * @param invWorldFromLocal Inv(rootWorld * brushLocal).
 * @returns World-space mapping.
 */
export function convertBrushLocalFaceMappingToWorldWithMatrix(
  mapping: FaceTextureMapping,
  invWorldFromLocal: THREE.Matrix4,
): FaceTextureMapping {
  return multiplyFaceMappingUv(mapping, invWorldFromLocal);
}

/**
 * Converts a world-space VMF UV matrix into brush-local form after the solid
 * was centered at the origin and the former center became the instance
 * position. Equivalent to M_local = M_world * translation(worldCenter).
 *
 * @param mapping World-space mapping from Hammer axes.
 * @param worldCenter Former AABB center stored as brush position.
 * @returns Brush-local mapping for chunk UV bake.
 */
export function convertWorldFaceMappingForCenteredBrush(
  mapping: FaceTextureMapping,
  worldCenter: THREE.Vector3,
): FaceTextureMapping {
  scratchWorldFromLocal.makeTranslation(worldCenter.x, worldCenter.y, worldCenter.z);
  return multiplyFaceMappingUv(mapping, scratchWorldFromLocal);
}
