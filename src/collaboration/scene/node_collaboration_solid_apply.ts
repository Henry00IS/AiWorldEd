import * as THREE from 'three';
import { SolidModelCodec } from '@/solid/io/solid_model_codec.js';
import type { SolidModel } from '@/solid/model/solid_model.js';
import { SOLID_CSG_GROUP_USERDATA_KEY, SOLID_GROUP_OPERATION_USERDATA_KEY } from '@/solid/model/solid_group.js';
import { setObjectLocked } from '@/utils/object_lock.js';
import { placementAttach } from '@/collaboration/scene/node_collaboration_placement.js';
import type { BatchCollaborationApply } from '@/collaboration/scene/node_collaboration_batch.js';
import type {
  NodeCollaborationBrushData,
  NodeCollaborationRef,
  NodeCollaborationSolidGroupData,
} from '@/collaboration/scene/node_collaboration_types.js';

/**
 * Returns the brush payload without fields that can be patched in place.
 *
 * @param data Brush payload.
 * @returns Structure text used to decide between patching and replacing.
 */
export function solidBrushStructureText(data: NodeCollaborationBrushData): string {
  return JSON.stringify({ ...data.brush, name: '', position: 0, rotation: 0, scale: 0, visible: true });
}

/**
 * Patches transform, name, visibility and lock flag of an existing brush.
 *
 * @param ref Existing brush node.
 * @param data New payload.
 * @param parent Target parent object.
 * @param batch Batch collecting rebuild work.
 */
export function solidBrushPatch(
  ref: NodeCollaborationRef,
  data: NodeCollaborationBrushData,
  parent: THREE.Object3D,
  batch: BatchCollaborationApply,
): void {
  const mesh = ref.object;
  const brush = data.brush;
  if (mesh.visible !== brush.visible && ref.model !== null) batch.modelsFull.add(ref.model);
  mesh.name = brush.name;
  mesh.position.set(brush.position.x, brush.position.y, brush.position.z);
  mesh.rotation.set(brush.rotation.x, brush.rotation.y, brush.rotation.z);
  mesh.scale.set(brush.scale.x, brush.scale.y, brush.scale.z);
  mesh.visible = brush.visible;
  setObjectLocked(mesh, data.locked);
  if (mesh.parent !== parent && ref.model !== null) batch.modelsFull.add(ref.model);
  if (mesh.parent !== parent) batch.parents.add(parent);
  placementAttach(mesh, parent);
  ref.model?.findBrushByMesh(mesh)?.pullTransformFromMesh();
  if (ref.model !== null) batch.brushDirty(ref.model, ref.localId);
}

/**
 * Creates a brush from its payload under a parent of a model.
 *
 * @param id Wire id of the brush.
 * @param model Owning model.
 * @param data Brush payload.
 * @param parent Model root or CSG group.
 * @returns Node reference, or null when the brush could not be registered.
 */
export function solidBrushCreate(
  id: string,
  model: SolidModel,
  data: NodeCollaborationBrushData,
  parent: THREE.Object3D,
): NodeCollaborationRef | null {
  const instance = SolidModelCodec.brushDecode(data.brush);
  model.insertBrushInstance(instance, model.getBrushCount(), 2, { parent, siblingIndex: parent.children.length }, false);
  const mesh = instance.mesh;
  if (mesh === null || model.findBrushByMesh(mesh) !== instance) return null;
  instance.pushTransformToMesh();
  placementAttach(mesh, parent);
  setObjectLocked(mesh, data.locked);
  return { id, kind: 'brush', object: mesh, model, localId: instance.id };
}

/**
 * Writes a CSG group payload onto a group.
 *
 * @param group CSG group.
 * @param data Group payload.
 */
export function solidGroupWrite(group: THREE.Object3D, data: NodeCollaborationSolidGroupData): void {
  group.name = data.name;
  group.userData[SOLID_GROUP_OPERATION_USERDATA_KEY] = data.operation;
  group.position.set(data.position[0], data.position[1], data.position[2]);
  group.rotation.set(data.rotation[0], data.rotation[1], data.rotation[2]);
  group.scale.set(data.scale[0], data.scale[1], data.scale[2]);
  group.visible = data.visible;
  setObjectLocked(group, data.locked);
}

/**
 * Creates a CSG group with a fixed id.
 *
 * @param id Wire id used as uuid.
 * @param model Owning model.
 * @param data Group payload.
 * @returns Node reference of the new group.
 */
export function solidGroupCreate(id: string, model: SolidModel, data: NodeCollaborationSolidGroupData): NodeCollaborationRef {
  const group = new THREE.Group();
  group.uuid = id;
  group.userData[SOLID_CSG_GROUP_USERDATA_KEY] = true;
  solidGroupWrite(group, data);
  return { id, kind: 'solidGroup', object: group, model, localId: id };
}
