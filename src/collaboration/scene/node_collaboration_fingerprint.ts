import * as THREE from 'three';
import { isObjectLocked } from '@/utils/object_lock.js';
import { getSolidGroupOperation } from '@/solid/model/solid_group.js';
import { SOLID_BRUSH_OPERATION_USERDATA_KEY } from '@/solid/model/solid_brush_visual.js';
import { FACE_TEXTURE_MAPS_USERDATA_KEY } from '@/texture/uv/face_texture_mapping.js';
import { currentSharedContentMaterialList } from '@/viewports/shared/shared_content_material_store.js';
import type { NodeCollaborationRef } from '@/collaboration/scene/node_collaboration_types.js';

/**
 * Builds a cheap change fingerprint of a node: transform, name, visibility,
 * lock flag, parent and identity of geometry, materials, textures and face
 * texture maps. Used to detect edits on nodes the local user does not hold
 * without encoding them.
 *
 * @param ref Node reference.
 * @param parentId Wire id of the current parent.
 * @returns Fingerprint string.
 */
export function nodeFingerprint(ref: NodeCollaborationRef, parentId: string): string {
  const object = ref.object;
  const common = `${parentId}|${object.name}|${object.visible ? 1 : 0}|${isObjectLocked(object) ? 1 : 0}|${nodeFingerprintPose(object)}`;
  if (ref.kind === 'solidGroup') return `${common}|${getSolidGroupOperation(object)}`;
  if (ref.kind === 'brush') {
    const geometry = object instanceof THREE.Mesh ? object.geometry.uuid : '';
    return `${common}|${String(object.userData[SOLID_BRUSH_OPERATION_USERDATA_KEY])}|${geometry}`;
  }
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
 * Formats geometry and content material identity of a mesh. Temporary shading
 * override materials (wireframe, flat) are ignored, so switching the view mode
 * is not mistaken for an edit.
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
  const materialIds = currentSharedContentMaterialList(mesh)
    .map((material) => `${material.uuid}:${nodeFingerprintColor(material)}:${nodeFingerprintMap(material)}`)
    .join(',');
  const faceMaps = nodeFingerprintIdentity(mesh.userData[FACE_TEXTURE_MAPS_USERDATA_KEY]);
  return `${geometry.uuid}|${versions}|${index}|${materialIds}|${faceMaps}`;
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

/**
 * Returns the uuid of the colour texture of a material, or an empty string.
 *
 * @param material Mesh material.
 * @returns Texture uuid.
 */
function nodeFingerprintMap(material: THREE.Material): string {
  const map: unknown = (material as THREE.Material & { map?: unknown }).map;
  return map instanceof THREE.Texture ? map.uuid : '';
}

/**
 * Identity numbers handed to userData tables; tables are replaced, never edited
 * in place.
 */
const NODE_FINGERPRINT_IDENTITIES = new WeakMap<object, number>();

/** Next identity number. */
let nodeFingerprintIdentityNext = 1;

/**
 * Returns a stable identity number for a userData table such as the face
 * texture maps, which editor code always replaces as a whole.
 *
 * @param value Table, or anything else.
 * @returns Identity number, or 0 when the value is not an object.
 */
function nodeFingerprintIdentity(value: unknown): number {
  if (typeof value !== 'object' || value === null) return 0;
  const known = NODE_FINGERPRINT_IDENTITIES.get(value);
  if (known !== undefined) return known;
  const identity = nodeFingerprintIdentityNext++;
  NODE_FINGERPRINT_IDENTITIES.set(value, identity);
  return identity;
}
