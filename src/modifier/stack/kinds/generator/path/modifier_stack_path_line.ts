import * as THREE from 'three';
import type { PathAsset } from '@/path/model/path_asset.js';
import { pathAssetStretchWalks } from '@/path/model/path_asset_script.js';
import { MODIFIER_GENERATOR_COLOR } from '@/modifier/stack/modifier_volume.js';
import {
  MODIFIER_VOLUME_BEVEL_EDGE_KEY,
  MODIFIER_VOLUME_OUTLINE_KEY,
} from '@/modifier/volume/modifier_volume_bevel_keys.js';

/** UserData flag on the line a Path object draws its path with. */
export const MODIFIER_STACK_PATH_LINE_KEY = 'isPathObjectLine';

/**
 * Draws a Path object's path as a line inside it, replacing the line it drew
 * before. Like the box outline, the line is never picked, saved or exported.
 *
 * @param node Path object.
 * @param path Path in the object's own coordinates.
 * @param frame Matrix from the object's own coordinates to the world.
 */
export function modifierStackPathLineSync(node: THREE.Object3D, path: PathAsset, frame: THREE.Matrix4): void {
  for (const old of node.children.filter((child) => child.userData[MODIFIER_STACK_PATH_LINE_KEY] === true)) {
    node.remove(old);
    (old as THREE.Line).geometry.dispose();
    ((old as THREE.Line).material as THREE.Material).dispose();
  }
  const toLocal = node.matrixWorld.clone().invert().multiply(frame);
  const points = pathAssetStretchWalks(path)
    .flatMap((walk, index) => (index === 0 ? walk : walk.slice(1)))
    .map((point) => new THREE.Vector3(point[0], point[1], point[2]).applyMatrix4(toLocal));
  const material = new THREE.LineBasicMaterial({ color: MODIFIER_GENERATOR_COLOR });
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
  line.name = 'Path Line';
  line.userData[MODIFIER_STACK_PATH_LINE_KEY] = true;
  line.userData[MODIFIER_VOLUME_BEVEL_EDGE_KEY] = true;
  line.userData[MODIFIER_VOLUME_OUTLINE_KEY] = true;
  line.raycast = () => undefined;
  node.add(line);
}
