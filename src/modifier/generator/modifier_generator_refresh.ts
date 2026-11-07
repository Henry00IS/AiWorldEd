import type * as THREE from 'three';
import { SolidModelRegistry } from '@/solid/model/solid_model_registry.js';
import { generatorVolumes } from './modifier_generator_volume.js';

const remembered = new WeakMap<THREE.Object3D, string>();
/**
 * Rebuilds generators after selector changes or removal. @param root Scene
 * root.
 */
export function generatorRefreshScene(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const volumes = generatorVolumes(root);
  const key = volumes
    .map(
      (volume) =>
        `${volume.uuid}:${volume.matrixWorld.elements}:${JSON.stringify(volume.userData['modifierGenerator'])}`,
    )
    .join('|');
  const previous = remembered.get(root);
  remembered.set(root, key);
  if (!volumes.length && !previous) return;
  root.updateMatrixWorld(true);
  for (const model of SolidModelRegistry.collectUnder(root)) {
    model.markDirty();
    model.rebuild();
  }
}
