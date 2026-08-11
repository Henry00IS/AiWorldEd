import * as THREE from 'three';
import { PLAYER_CHARACTER_TARGET_HEIGHT_METERS, PLAYER_FIGURINE_USERDATA_KEY } from '@/player/player_constants.js';

/**
 * Scales a loaded character scene so feet sit near y=0 at the target height.
 *
 * @param scene Loaded glTF scene root.
 * @returns Prepared holder group ready for cloning.
 */
export function playerCharacterPrepareModelScene(scene: THREE.Object3D): THREE.Group {
  const holder = new THREE.Group();
  holder.name = 'PlayerCharacterModelTemplate';
  holder.add(scene);
  holder.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(holder);
  const height = Math.max(1e-4, bounds.max.y - bounds.min.y);
  const scale = PLAYER_CHARACTER_TARGET_HEIGHT_METERS / height;
  holder.scale.setScalar(scale);
  holder.position.y = -bounds.min.y * scale;
  holder.updateMatrixWorld(true);
  playerCharacterApplyDefaultMaterials(holder);
  playerCharacterTagHelperTree(holder);
  return holder;
}

/**
 * Applies readable body and face materials to the police mesh materials.
 *
 * @param root Character model root.
 */
function playerCharacterApplyDefaultMaterials(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    applyMaterialsOnMesh(child);
  });
}

/**
 * Marks the model tree as a player helper for edge-sync exclusion.
 *
 * @param root Character model root.
 */
export function playerCharacterTagHelperTree(root: THREE.Object3D): void {
  root.userData[PLAYER_FIGURINE_USERDATA_KEY] = true;
  root.traverse((child) => {
    child.userData[PLAYER_FIGURINE_USERDATA_KEY] = true;
  });
}

/**
 * Retints one mesh material set for body or face.
 *
 * @param mesh Skinned or static mesh under the character.
 */
function applyMaterialsOnMesh(mesh: THREE.Mesh): void {
  if (Array.isArray(mesh.material)) {
    for (let index = 0; index < mesh.material.length; index++) {
      const entry = mesh.material[index];
      if (entry) {
        mesh.material[index] = retintMaterial(entry);
      }
    }
    return;
  }
  mesh.material = retintMaterial(mesh.material);
}

/**
 * Clones and retints a material based on its police mesh name.
 *
 * @param material Source material from the glTF file.
 * @returns Cloned standard material with readable colors.
 */
function retintMaterial(material: THREE.Material): THREE.Material {
  const name = material.name.toLowerCase();
  if (name.includes('face')) {
    return createFaceMaterial(material.name);
  }
  return createBodyMaterial(material.name);
}

/**
 * Creates the uniform body material for the police officer mesh.
 *
 * @param name Material name to preserve.
 * @returns Body material.
 */
function createBodyMaterial(name: string): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: 0x2a3f66,
    roughness: 0.62,
    metalness: 0.08,
    emissive: 0x0a1220,
    emissiveIntensity: 0.05,
  });
  material.name = name;
  material.side = THREE.DoubleSide;
  return material;
}

/**
 * Creates the face material for the police officer mesh.
 *
 * @param name Material name to preserve.
 * @returns Face material.
 */
function createFaceMaterial(name: string): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: 0xe8b896,
    roughness: 0.55,
    metalness: 0.02,
  });
  material.name = name;
  material.side = THREE.DoubleSide;
  return material;
}
