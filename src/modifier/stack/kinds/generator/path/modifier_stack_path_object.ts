import * as THREE from 'three';
import { pathAssetDecode, PATH_ASSET_DEFAULT, type PathAsset } from '@/path/model/path_asset.js';
import { modifierStackFrame, modifierStackVolumeBox } from '@/modifier/stack/evaluate/modifier_stack_frame.js';
import { MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY } from '../solid_script/modifier_stack_solid_script_keys.js';

/** Kind id of a Path object. */
export const MODIFIER_STACK_PATH_KIND = 'path';

/** Name of the input a Path object stores its path in. */
export const MODIFIER_STACK_PATH_INPUT = 'Path';

/**
 * Returns the path a Path object's step stores, or the default path.
 *
 * @param parameters Step parameters.
 * @returns Path in the object's own coordinates.
 */
export function modifierStackPathObjectAsset(parameters: Record<string, unknown>): PathAsset {
  const inputs = parameters[MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY] as Record<string, unknown> | undefined;
  const text = inputs?.[MODIFIER_STACK_PATH_INPUT];
  return (typeof text === 'string' ? pathAssetDecode(text) : null) ?? PATH_ASSET_DEFAULT;
}

/**
 * Returns the matrix from a Path object's own coordinates to the world: its
 * position and rotation, centred in its box like a script origin. Its scale
 * never stretches the path.
 *
 * @param node Path object.
 * @returns Matrix.
 */
export function modifierStackPathObjectFrame(node: THREE.Object3D): THREE.Matrix4 {
  const centre = modifierStackVolumeBox(node).getCenter(new THREE.Vector3());
  return modifierStackFrame(node, 'volume').multiply(new THREE.Matrix4().makeTranslation(centre.x, centre.y, centre.z));
}
