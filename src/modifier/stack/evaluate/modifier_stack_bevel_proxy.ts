import * as THREE from 'three';
import { modifierVolumeRecordLink } from '@/modifier/volume/modifier_volume_record.js';
import {
  modifierStackOwnerBevelGeometry,
  modifierStackOwnerCandidate,
} from '@/modifier/stack/owner/modifier_stack_owner.js';
import type { ModifierStackEntry } from '@/modifier/stack/modifier_stack_types.js';

const modifierStackBevelProxies = new WeakMap<THREE.Object3D, Map<string, THREE.Mesh>>();

/**
 * Returns the stand-in volume a bevel step is evaluated with. It shares the
 * owner's box and world pose and reads its settings from the step, so the
 * chamfer engine sees an ordinary bevel volume. The proxy and its uuid are
 * reused across compiles, keeping chamfer caches warm. A brush or CSG group
 * that owns its stack bevels its whole working set.
 *
 * @param volume Scene modifier volume.
 * @param step Bevel step.
 * @returns Detached proxy mesh with a current world matrix.
 */
export function modifierStackBevelProxy(volume: THREE.Object3D, step: ModifierStackEntry): THREE.Mesh {
  const proxy = modifierStackBevelProxyFind(volume, step.id);
  proxy.geometry = modifierStackOwnerCandidate(volume)
    ? modifierStackOwnerBevelGeometry()
    : ((volume as THREE.Mesh).geometry ?? proxy.geometry);
  proxy.matrix.copy(volume.matrixWorld);
  proxy.updateMatrixWorld(true);
  return proxy;
}

/**
 * Finds or creates the proxy of one step.
 *
 * @param volume Scene modifier volume.
 * @param stepId Bevel step id.
 * @returns Proxy mesh.
 */
function modifierStackBevelProxyFind(volume: THREE.Object3D, stepId: string): THREE.Mesh {
  const proxies = modifierStackBevelProxies.get(volume) ?? new Map<string, THREE.Mesh>();
  modifierStackBevelProxies.set(volume, proxies);
  const existing = proxies.get(stepId);
  if (existing) return existing;
  const proxy = new THREE.Mesh();
  proxy.uuid = `${volume.uuid}:${stepId}`;
  proxy.name = volume.name;
  proxy.matrixAutoUpdate = false;
  modifierVolumeRecordLink(proxy, volume, stepId);
  proxies.set(stepId, proxy);
  return proxy;
}
