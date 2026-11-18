import * as THREE from 'three';
import type { SolidTreeBrush } from '@/solid/commands/tree/solid_tree_node.js';
import type { ModifierStackPieceSurfaces } from '@/modifier/stack/kinds/generator/modifier_stack_kind_generator.js';
import {
  createDefaultFaceSurface,
  orientDefaultFaceSurface,
  type FaceSurfaceDescription,
} from '@/texture/uv_matrix/face_surface_description.js';
import { textureUvProjectAxis } from '@/texture/uv_project/texture_uv_project_view.js';
import type { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';

/**
 * Builds frame-space face surfaces for a script brush, with UVs worked out in
 * the brush's own centred space so a move, turn or scale keeps the mapping on
 * the shape. Pass the same frame-to-model matrix pieceUnit applies, so after
 * that invert the stored UVs stay in frame space and a volume move stays world
 * aligned.
 *
 * @param node Centred script brush and its placement.
 * @param toModel Optional frame-to-model matrix, cancelled by pieceUnit.
 * @returns One surface per face, ready for pieceUnit.
 */
export function modifierStackSolidScriptSurfaces(
  node: SolidTreeBrush,
  toModel?: THREE.Matrix4,
): ModifierStackPieceSurfaces {
  const fromCentered = new THREE.Matrix4().makeTranslation(-node.center.x, -node.center.y, -node.center.z);
  if (toModel) fromCentered.multiply(toModel);
  return node.brush.faces.map((_, index) => {
    const surface = modifierStackSolidScriptFaceSurface(node, index);
    return { ...surface, uv: surface.uv.multiplyMatrix4(fromCentered) };
  });
}

/**
 * Builds the local-space surface of one face: a box projection when the script
 * asked for one, otherwise the default mapping aimed at the face.
 *
 * @param node Centred script brush.
 * @param index Face index.
 * @returns Surface in the centred brush's space.
 */
function modifierStackSolidScriptFaceSurface(node: SolidTreeBrush, index: number): FaceSurfaceDescription {
  const textureId = node.faceTextures?.[index] ?? node.texture ?? DEFAULT_CHECKER_TEXTURE_ID;
  const stored = node.faceUvs?.[index];
  if (stored) return { textureId, uv: stored };
  const normal = node.brush.planes[index]?.normal.clone().normalize() ?? new THREE.Vector3(0, 1, 0);
  const size = node.boxUvSize;
  if (size !== undefined && size > 0) return { textureId, uv: modifierStackSolidScriptBoxUv(normal, size) };
  return orientDefaultFaceSurface(createDefaultFaceSurface(textureId), normal);
}

/**
 * Box-projects texture coordinates from the axis the face points along most,
 * with the given metres per repeat.
 *
 * @param normal Unit face normal in the centred brush's space.
 * @param size Metres covered by one texture repeat.
 * @returns UV matrix in that space.
 */
export function modifierStackSolidScriptBoxUv(normal: THREE.Vector3, size: number): SurfaceUvMatrix {
  return textureUvProjectAxis(normal, size);
}
