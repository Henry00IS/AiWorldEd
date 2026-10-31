import type * as THREE from 'three';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { SolidModelCodec } from '@/solid/io/solid_model_codec.js';
import { getSolidGroupOperation } from '@/solid/model/solid_group.js';
import { isObjectLocked } from '@/utils/object_lock.js';
import type {
  NodeCollaborationBrushData,
  NodeCollaborationEntryData,
  NodeCollaborationRef,
  NodeCollaborationSolidGroupData,
  NodeCollaborationState,
} from '@/collaboration/scene/node_collaboration_types.js';

/**
 * Encodes live scene nodes into deterministic wire states. Property order is
 * fixed so equal states always stringify to equal text.
 */
export class CodecCollaborationNodes {
  private readonly serializer: SceneSerializer;

  /** Creates a codec with its own scene serializer. */
  constructor() {
    this.serializer = new SceneSerializer();
  }

  /**
   * Encodes one node.
   *
   * @param ref Node reference.
   * @param parent Wire id of the parent node ('' for the world).
   * @param key Fractional order key among its siblings.
   * @returns Wire state, or null when the node cannot be encoded.
   */
  encode(ref: NodeCollaborationRef, parent: string, key: string): NodeCollaborationState | null {
    const data = this.encodeData(ref);
    if (data === null) return null;
    if (ref.kind === 'entry' || ref.model === null) return { id: ref.id, kind: ref.kind, parent, key, data };
    return { id: ref.id, kind: ref.kind, parent, key, model: ref.model.root.uuid, data };
  }

  /**
   * Encodes the kind-specific payload of a node.
   *
   * @param ref Node reference.
   * @returns Payload, or null when a brush has no instance.
   */
  private encodeData(
    ref: NodeCollaborationRef,
  ): NodeCollaborationEntryData | NodeCollaborationBrushData | NodeCollaborationSolidGroupData | null {
    if (ref.kind === 'entry') return this.encodeEntry(ref);
    if (ref.kind === 'solidGroup') return codecSolidGroupEncode(ref.object);
    const instance = ref.model?.findBrushByMesh(ref.object);
    if (instance === undefined) return null;
    return { brush: SolidModelCodec.brushEncode(instance), locked: isObjectLocked(ref.object) };
  }

  /**
   * Encodes a world mesh, group or solid model root.
   *
   * @param ref Node reference.
   * @returns Entry payload.
   */
  private encodeEntry(ref: NodeCollaborationRef): NodeCollaborationEntryData {
    const entry = this.serializer.entryBuildShallow(ref.object, '');
    entry.parentId = null;
    const solid = ref.model === null ? null : { invertedWorld: ref.model.isInvertedWorld() };
    return { entry, locked: isObjectLocked(ref.object), solid };
  }
}

/**
 * Encodes a CSG group of a solid model.
 *
 * @param group CSG group.
 * @returns Group payload.
 */
export function codecSolidGroupEncode(group: THREE.Object3D): NodeCollaborationSolidGroupData {
  return {
    name: group.name,
    operation: getSolidGroupOperation(group),
    position: [group.position.x, group.position.y, group.position.z],
    rotation: [group.rotation.x, group.rotation.y, group.rotation.z],
    scale: [group.scale.x, group.scale.y, group.scale.z],
    visible: group.visible,
    locked: isObjectLocked(group),
  };
}

/**
 * Serializes a wire state to its canonical comparison text.
 *
 * @param state Node state.
 * @returns JSON text.
 */
export function codecStateText(state: NodeCollaborationState): string {
  return JSON.stringify(state);
}
