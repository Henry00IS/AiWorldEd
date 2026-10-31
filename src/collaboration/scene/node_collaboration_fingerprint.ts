import * as THREE from 'three';
import { isObjectLocked } from '@/utils/object_lock.js';
import { getSolidGroupOperation } from '@/solid/model/solid_group.js';
import { SOLID_BRUSH_OPERATION_USERDATA_KEY } from '@/solid/model/solid_brush_visual.js';
import type { NodeCollaborationRef } from '@/collaboration/scene/node_collaboration_types.js';

/**
 * Builds a cheap change fingerprint of a node: transform, name, visibility,
 * lock flag, parent and identity of geometry and materials. Used to detect
 * edits on nodes the local user does not hold without encoding them.
 *
 * @param ref Node reference.
 * @param parentId Wire id of the current parent.
 * @returns Fingerprint string.
 */
export function nodeFingerprint(ref: NodeCollaborationRef, parentId: string): string {
  const object = ref.object;
  const common = `${parentId}|${object.name}|${object.visible ? 1 : 0}|${isObjectLocked(object) ? 1 : 0}|${nodeFingerprintPose(object)}`;
  if (ref.kind === 'solidGroup') return `${common}|${getSolidGroupOperation(object)}`;
  if (ref.kind === 'brush') return `${common}|${String(object.userData[SOLID_BRUSH_OPERATION_USERDATA_KEY])}`;
  if (ref.model !== null) return `${common}|${ref.model.isInvertedWorld() ? 1 : 0}`;
  return object instanceof THREE.Mesh ? `${common}|${nodeFingerprintMesh(object)}` : common;
}

/**
 * Formats the local transform of an object.
 *
 * @param object Scene object.
 * @returns Transform signature.
 */
export function nodeFingerprintPose(object: THREE.Object3D): string {
  const p = object.position;
  const q = object.quaternion;
  const s = object.scale;
  return `${p.x},${p.y},${p.z},${q.x},${q.y},${q.z},${q.w},${s.x},${s.y},${s.z}`;
}

/**
 * Formats geometry and material identity of a mesh.
 *
 * @param mesh World mesh.
 * @returns Mesh signature.
 */
function nodeFingerprintMesh(mesh: THREE.Mesh): string {
  const geometry = mesh.geometry;
  const versions = ['position', 'uv', 'normal']
    .map((name) => {
      const attribute = geometry.getAttribute(name);
      return attribute instanceof THREE.BufferAttribute ? attribute.version : -1;
    })
    .join(',');
  const index = geometry.getIndex()?.version ?? -1;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const materialIds = materials.map((material) => `${material.uuid}:${nodeFingerprintColor(material)}`).join(',');
  return `${geometry.uuid}|${versions}|${index}|${materialIds}`;
}

/**
 * Returns the base colour of a material as a hex number when it has one.
 *
 * @param material Mesh material.
 * @returns Colour value, or -1 without a colour.
 */
function nodeFingerprintColor(material: THREE.Material): number {
  const color: unknown = (material as THREE.Material & { color?: unknown }).color;
  return color instanceof THREE.Color ? color.getHex() : -1;
}
