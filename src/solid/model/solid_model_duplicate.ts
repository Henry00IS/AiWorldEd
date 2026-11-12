import * as THREE from 'three';
import {
  SolidModelCodec,
  type SerializedSolidModel,
  type SerializedSolidTreeNode,
} from '@/solid/io/solid_model_codec.js';
import { SolidModel } from './solid_model.js';
import { allocateCopiedHierarchyNames } from '@/outliner/hierarchy/hierarchy_copy_names.js';

/**
 * Creates an independent solid model that deep-copies the source hierarchy,
 * brushes, inverted-world flag, and root transform. Brush ids are remapped so
 * the copy never shares identity with the original.
 *
 * @param source Solid model to copy.
 * @param offset Local position offset applied to the cloned root.
 * @returns New solid model not yet parented into the scene.
 */
export function createIndependentSolidModelDuplicate(
  source: SolidModel,
  offset: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
): SolidModel {
  const payload = SolidModelCodec.encode(source);
  remapSerializedSolidBrushIdentities(payload);
  const clone = SolidModelCodec.decode(payload, source.root.name);
  applyRootTransformFromSource(source.root, clone.root, offset);
  allocateCopiedHierarchyNames(clone.root);
  return clone;
}

/**
 * Remaps every brush id in a serialized solid so the decode target owns unique
 * identities.
 *
 * @param payload Encoded solid model payload mutated in place.
 */
function remapSerializedSolidBrushIdentities(payload: SerializedSolidModel): void {
  const identityMap = buildBrushIdentityMap(payload);
  applyBrushIdentityMapToBrushes(payload, identityMap);
  if (payload.hierarchy) {
    applyBrushIdentityMapToHierarchy(payload.hierarchy, identityMap);
  }
}

/**
 * Builds old-id to new-id mappings for every serialized brush.
 *
 * @param payload Encoded solid model payload.
 * @returns Map from source brush id to fresh brush id.
 */
function buildBrushIdentityMap(payload: SerializedSolidModel): Map<string, string> {
  const identityMap = new Map<string, string>();
  for (const brush of payload.brushes) {
    identityMap.set(brush.id, createFreshBrushIdentity());
  }
  return identityMap;
}

/**
 * Writes remapped brush ids onto the flat brush list.
 *
 * @param payload Encoded solid model payload.
 * @param identityMap Old brush id to new brush id.
 */
function applyBrushIdentityMapToBrushes(payload: SerializedSolidModel, identityMap: Map<string, string>): void {
  for (const brush of payload.brushes) {
    const remappedId = identityMap.get(brush.id);
    if (remappedId) {
      brush.id = remappedId;
    }
  }
}

/**
 * Writes remapped brush ids onto hierarchy leaf nodes.
 *
 * @param nodes Hierarchy nodes to walk.
 * @param identityMap Old brush id to new brush id.
 */
function applyBrushIdentityMapToHierarchy(nodes: SerializedSolidTreeNode[], identityMap: Map<string, string>): void {
  for (const node of nodes) {
    remapHierarchyNodeBrushIdentity(node, identityMap);
  }
}

/**
 * Remaps one hierarchy node and its descendants.
 *
 * @param node Hierarchy node.
 * @param identityMap Old brush id to new brush id.
 */
function remapHierarchyNodeBrushIdentity(node: SerializedSolidTreeNode, identityMap: Map<string, string>): void {
  if (node.kind === 'brush') {
    const remappedId = identityMap.get(node.brushId);
    if (remappedId) {
      node.brushId = remappedId;
    }
    return;
  }
  if (node.kind === 'modifier') {
    node.id = THREE.MathUtils.generateUUID();
    return;
  }
  for (const child of node.children) {
    remapHierarchyNodeBrushIdentity(child, identityMap);
  }
}

/**
 * Allocates a fresh brush id string unrelated to any existing model.
 *
 * @returns Unique brush identity.
 */
function createFreshBrushIdentity(): string {
  return `dup-brush-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Copies root transform from source and applies a local position offset.
 *
 * @param sourceRoot Source solid model root.
 * @param cloneRoot Destination solid model root.
 * @param offset Local position offset.
 */
function applyRootTransformFromSource(
  sourceRoot: THREE.Object3D,
  cloneRoot: THREE.Object3D,
  offset: THREE.Vector3,
): void {
  cloneRoot.position.copy(sourceRoot.position).add(offset);
  cloneRoot.quaternion.copy(sourceRoot.quaternion);
  cloneRoot.scale.copy(sourceRoot.scale);
  cloneRoot.visible = sourceRoot.visible;
}
