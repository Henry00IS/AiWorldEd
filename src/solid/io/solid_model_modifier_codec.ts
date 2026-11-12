import {
  preservedFieldsCapture,
  preservedFieldsApply,
  preservedFieldsSave,
} from '@/io/extensions/preserved_json_fields.js';
import * as THREE from 'three';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';

/** An authored modifier/generator operand within a solid model hierarchy. */
export interface SerializedSolidTreeModifierNode {
  kind: 'modifier';
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  visible: boolean;
  settings: ReturnType<typeof ModifierVolume.read>;
}

/**
 * Captures an authored modifier without its derived geometry or editor helpers.
 *
 * @param object Modifier or generator node.
 * @returns A compact hierarchy operand.
 */
export function solidModelModifierEncode(object: THREE.Object3D): SerializedSolidTreeModifierNode {
  const node: SerializedSolidTreeModifierNode = {
    kind: 'modifier',
    id: object.uuid,
    name: object.name,
    position: { x: object.position.x, y: object.position.y, z: object.position.z },
    rotation: { x: object.rotation.x, y: object.rotation.y, z: object.rotation.z },
    scale: { x: object.scale.x, y: object.scale.y, z: object.scale.z },
    visible: object.visible,
    settings: ModifierVolume.read(object),
  };
  return preservedFieldsSave(object, preservedFieldsApply(object, 'modifier', node));
}

/**
 * Restores an authored modifier with its standard translucent editor material.
 *
 * @param node Saved hierarchy operand.
 * @returns The restored node, ready to insert in CSG order.
 */
export function solidModelModifierDecode(node: SerializedSolidTreeModifierNode): THREE.Mesh {
  const object = ModifierVolume.create(node.settings);
  object.uuid = node.id;
  object.name = node.name;
  object.position.set(node.position.x, node.position.y, node.position.z);
  object.rotation.set(node.rotation.x, node.rotation.y, node.rotation.z, 'XYZ');
  object.scale.set(node.scale.x, node.scale.y, node.scale.z);
  object.visible = node.visible;
  preservedFieldsCapture(object, 'modifier', node);
  return object;
}
