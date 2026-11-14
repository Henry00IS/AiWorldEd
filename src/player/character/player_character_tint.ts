import * as THREE from 'three';

/** How strongly the member room color replaces the character colors. */
export const PLAYER_CHARACTER_ROOM_TINT = 0.6;

/**
 * Replaces every material under a root with a copy tinted toward a color.
 *
 * @param root Clone root.
 * @param color Member color.
 * @param include Meshes to tint; all meshes when omitted.
 * @returns The new materials, owned by the caller.
 */
export function playerCharacterApplyRoomTint(
  root: THREE.Object3D,
  color: number,
  include: (mesh: THREE.Mesh) => boolean = () => true,
): THREE.Material[] {
  const tint = new THREE.Color(color);
  const created: THREE.Material[] = [];
  const copy = (material: THREE.Material): THREE.Material => {
    const tinted = material.clone();
    const colored = tinted as THREE.Material & { color?: THREE.Color };
    if (colored.color instanceof THREE.Color) colored.color.lerp(tint, PLAYER_CHARACTER_ROOM_TINT);
    created.push(tinted);
    return tinted;
  };
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !include(child)) return;
    child.material = Array.isArray(child.material) ? child.material.map(copy) : copy(child.material);
  });
  return created;
}
