import * as THREE from 'three';
import { clone as cloneSkinnedHierarchy } from 'three/addons/utils/SkeletonUtils.js';
import { PLAYER_FIGURINE_USERDATA_KEY } from '@/player/player_constants.js';
import { playerCharacterBoneIdFromGlbName } from './player_character_bone_names.js';
import type { PlayerCharacterBoneId } from './player_character_bone_ids.js';
import { playerCharacterGetPreparedTemplate, playerCharacterIsModelReady } from './player_character_model_loader.js';
import { playerCharacterTagHelperTree } from './player_character_model_prepare.js';

/** Built character rig with bone map, rest pose, and root group. */
export interface PlayerCharacterRig {
  root: THREE.Group;
  bones: Map<PlayerCharacterBoneId, THREE.Bone>;
  restLocalQuaternions: Map<PlayerCharacterBoneId, THREE.Quaternion>;
}

/**
 * Builds a skinned character rig by cloning the prepared GLB template.
 *
 * @returns Rig root, bone lookup, and rest local quaternions.
 */
export function playerCharacterBuildRig(): PlayerCharacterRig {
  const template = playerCharacterGetPreparedTemplate();
  if (!template || !playerCharacterIsModelReady()) {
    throw new Error('Player character model is not loaded');
  }
  const root = new THREE.Group();
  root.name = 'PlayerCharacterAvatar';
  root.userData[PLAYER_FIGURINE_USERDATA_KEY] = true;
  const clone = cloneSkinnedHierarchy(template) as THREE.Object3D;
  root.add(clone);
  playerCharacterTagHelperTree(root);
  const bones = collectMappedBones(root);
  const restLocalQuaternions = captureRestLocalQuaternions(bones);
  return { root, bones, restLocalQuaternions };
}

/**
 * Disposes geometries and materials under a character root.
 *
 * @param root Character root group.
 */
export function playerCharacterDisposeRig(root: THREE.Object3D): void {
  const disposedMaterials = new Set<THREE.Material>();
  const disposedGeometries = new Set<THREE.BufferGeometry>();
  root.traverse((child) => {
    disposeChildResources(child, disposedMaterials, disposedGeometries);
  });
}

/**
 * Collects mapped bones from a cloned character hierarchy.
 *
 * @param root Character root.
 * @returns Bone map keyed by stable play-mode ids.
 */
function collectMappedBones(root: THREE.Object3D): Map<PlayerCharacterBoneId, THREE.Bone> {
  const bones = new Map<PlayerCharacterBoneId, THREE.Bone>();
  root.traverse((child) => {
    if (!(child instanceof THREE.Bone)) {
      return;
    }
    const boneId = playerCharacterBoneIdFromGlbName(child.name);
    if (boneId) {
      bones.set(boneId, child);
    }
  });
  return bones;
}

/**
 * Captures rest-pose local quaternions for every mapped bone.
 *
 * @param bones Mapped bone collection.
 * @returns Rest local quaternion map.
 */
function captureRestLocalQuaternions(
  bones: Map<PlayerCharacterBoneId, THREE.Bone>,
): Map<PlayerCharacterBoneId, THREE.Quaternion> {
  const rest = new Map<PlayerCharacterBoneId, THREE.Quaternion>();
  bones.forEach((bone, boneId) => {
    rest.set(boneId, bone.quaternion.clone());
  });
  return rest;
}

/**
 * Disposes mesh geometry and materials for one hierarchy child.
 *
 * @param child Hierarchy node.
 * @param disposedMaterials Shared material disposal set.
 * @param disposedGeometries Shared geometry disposal set.
 */
function disposeChildResources(
  child: THREE.Object3D,
  disposedMaterials: Set<THREE.Material>,
  disposedGeometries: Set<THREE.BufferGeometry>,
): void {
  if (!(child instanceof THREE.Mesh)) {
    return;
  }
  if (child.geometry && !disposedGeometries.has(child.geometry)) {
    disposedGeometries.add(child.geometry);
    child.geometry.dispose();
  }
  disposeMaterialValue(child.material, disposedMaterials);
}

/**
 * Disposes one material or material array once.
 *
 * @param material Material or array.
 * @param disposed Already disposed materials.
 */
function disposeMaterialValue(material: THREE.Material | THREE.Material[], disposed: Set<THREE.Material>): void {
  if (Array.isArray(material)) {
    for (let index = 0; index < material.length; index++) {
      const entry = material[index];
      if (entry && !disposed.has(entry)) {
        disposed.add(entry);
        entry.dispose();
      }
    }
    return;
  }
  if (!disposed.has(material)) {
    disposed.add(material);
    material.dispose();
  }
}
