import * as THREE from 'three';
import { playerCharacterBuildRig, playerCharacterDisposeRig } from '@/player/character/player_character_rig.js';
import {
  playerCharacterEnsureModelLoaded,
  playerCharacterIsModelReady,
} from '@/player/character/player_character_model_loader.js';

/**
 * Builds a skeletal character mesh used as the spawn marker and drag ghost.
 * Requires the character model to be loaded first.
 *
 * @returns Root group with helper userData flag set.
 */
export function playerFigurineBuildMesh(): THREE.Group {
  return playerCharacterBuildRig().root;
}

/**
 * Ensures the character model is loaded then builds a figurine mesh.
 *
 * @returns Promise resolving to the figurine root group.
 */
export async function playerFigurineBuildMeshAsync(): Promise<THREE.Group> {
  await playerCharacterEnsureModelLoaded();
  return playerFigurineBuildMesh();
}

/**
 * Returns whether a figurine mesh can be built synchronously.
 *
 * @returns True when the model template is ready.
 */
export function playerFigurineCanBuildSync(): boolean {
  return playerCharacterIsModelReady();
}

/**
 * Disposes geometries and materials under a figurine root.
 *
 * @param root Figurine root group.
 */
export function playerFigurineDispose(root: THREE.Object3D): void {
  playerCharacterDisposeRig(root);
}
