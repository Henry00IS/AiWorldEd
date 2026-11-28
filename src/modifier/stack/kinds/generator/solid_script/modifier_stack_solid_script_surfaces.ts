import * as THREE from 'three';
import type { SolidTreeBrush } from '@/solid/commands/tree/solid_tree_node.js';
import type { ModifierStackPieceSurfaces } from '@/modifier/stack/kinds/generator/modifier_stack_kind_generator.js';
import { textureUvProjectAxis } from '@/texture/uv_project/texture_uv_project_view.js';
import type { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { modifierStackPrimitivePlanarUv } from '@/modifier/stack/kinds/generator/primitive/modifier_stack_primitive_planar.js';

/**
 * Builds frame-space face surfaces for a script brush. A face the script mapped
 * keeps that mapping, worked out in the brush's own centred space so a move,
 * turn or scale in the script keeps it on the shape. Every other face gets the
 * planar mapping of the built-in generators, measured from the point the script
 * carried for the solid, or else one shared anchor, so neighbouring solids
 * built in place continue one texture.
 *
 * @param node Centred script brush and its placement.
 * @param anchor Point in frame coordinates unmapped faces measure their texture
 *   from when the script carried none, such as the box minimum.
 * @returns One surface per face, in frame coordinates.
 */
export function modifierStackSolidScriptSurfaces(
  node: SolidTreeBrush,
  anchor: THREE.Vector3,
): ModifierStackPieceSurfaces {
  const fromCentered = new THREE.Matrix4().makeTranslation(-node.center.x, -node.center.y, -node.center.z);
  return node.brush.faces.map((_, index) => {
    const textureId = node.faceTextures?.[index] ?? node.texture ?? DEFAULT_CHECKER_TEXTURE_ID;
    const mapped = modifierStackSolidScriptFaceMapped(node, index);
    if (mapped) return { textureId, uv: mapped.multiplyMatrix4(fromCentered) };
    return {
      textureId,
      uv: modifierStackPrimitivePlanarUv(modifierStackSolidScriptFaceNormal(node, index), node.uvAnchor ?? anchor),
    };
  });
}

/**
 * Returns the mapping the script gave one face, in the centred brush's space: a
 * stored mapping, or a box projection when the script asked for one.
 *
 * @param node Centred script brush.
 * @param index Face index.
 * @returns UV matrix, or null when the script left the face unmapped.
 */
function modifierStackSolidScriptFaceMapped(node: SolidTreeBrush, index: number): SurfaceUvMatrix | null {
  const stored = node.faceUvs?.[index];
  if (stored) return stored;
  const size = node.boxUvSize;
  if (size !== undefined && size > 0)
    return modifierStackSolidScriptBoxUv(modifierStackSolidScriptFaceNormal(node, index), size);
  return null;
}

/**
 * Returns the unit normal of one face of a script brush.
 *
 * @param node Script brush.
 * @param index Face index.
 * @returns Unit normal; up when the face has no plane.
 */
function modifierStackSolidScriptFaceNormal(node: SolidTreeBrush, index: number): THREE.Vector3 {
  return node.brush.planes[index]?.normal.clone().normalize() ?? new THREE.Vector3(0, 1, 0);
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
