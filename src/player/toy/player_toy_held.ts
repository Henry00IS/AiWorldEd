import * as THREE from 'three';
import type { PhysicsToyKind } from '@/physics/ball/physics_ball_constants.js';
import { PLAYER_CHARACTER_BONE } from '@/player/character/player_character_bone_ids.js';
import type { PlayerCharacterRig } from '@/player/character/player_character_rig.js';
import { playerToyMesh, playerToyMeshDispose } from './player_toy_models.js';

/**
 * Where a held toy sits relative to the right wrist, in the character's frame
 * (+Z forward, +X to its left): in the palm, a little forward and inward.
 */
const PLAYER_TOY_HELD_OFFSETS: Readonly<Record<PhysicsToyKind, readonly [number, number, number]>> = {
  tennis: [0.02, -0.09, 0.03],
  soccer: [0.06, -0.13, 0.05],
  plane: [0.03, -0.07, 0.08],
};

/**
 * Orientation of a held toy in the character's frame (the plane points ahead,
 * nose up a little).
 */
const PLAYER_TOY_HELD_TURNS: Readonly<Record<PhysicsToyKind, THREE.Quaternion>> = {
  tennis: new THREE.Quaternion(),
  soccer: new THREE.Quaternion(),
  plane: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, Math.PI, 0, 'YXZ')),
};

const scratchWrist = new THREE.Vector3();

/**
 * The toy a character holds, Minecraft style: the item follows the right hand
 * as the walk cycle swings it, and keeps facing the way the body faces, so it
 * never twists with the arm. It is a child of the rig root with a raycast that
 * never hits and the rig's helper flags, and it changes no bone, so the
 * animation is untouched.
 */
export class PlayerToyHeld {
  private mesh: THREE.Mesh | null;
  private kind: PhysicsToyKind | null;
  private color: number;
  private readonly tag: (object: THREE.Object3D) => void;

  /**
   * Creates an empty hand.
   *
   * @param tag Flags a new item like the rest of the character (helper flags).
   */
  constructor(tag: (object: THREE.Object3D) => void) {
    this.mesh = null;
    this.kind = null;
    this.color = 0;
    this.tag = tag;
  }

  /**
   * Shows a toy in the hand, or none.
   *
   * @param rig Character rig, or null before it loaded (shown once it is
   *   given).
   * @param kind Toy kind, or null.
   * @param color Member color.
   */
  set(rig: PlayerCharacterRig | null, kind: PhysicsToyKind | null, color: number): void {
    if (kind !== this.kind || color !== this.color) this.clear();
    this.kind = kind;
    this.color = color;
    if (rig === null || kind === null) return;
    if (this.mesh === null) {
      this.mesh = playerToyMesh(kind, color);
      this.mesh.frustumCulled = false;
      this.tag(this.mesh);
    }
    if (this.mesh.parent !== rig.root) rig.root.add(this.mesh);
    this.update(rig);
  }

  /**
   * Returns the held kind.
   *
   * @returns Kind, or null.
   */
  getKind(): PhysicsToyKind | null {
    return this.kind;
  }

  /**
   * Returns the held mesh.
   *
   * @returns Mesh, or null.
   */
  getMesh(): THREE.Mesh | null {
    return this.mesh;
  }

  /**
   * Moves the item to the posed right hand (call after posing the rig).
   *
   * @param rig Posed character rig.
   */
  update(rig: PlayerCharacterRig): void {
    const mesh = this.mesh;
    const kind = this.kind;
    const hand = rig.bones.get(PLAYER_CHARACTER_BONE.handRight);
    if (mesh === null || kind === null || hand === undefined) return;
    rig.root.updateMatrixWorld(true);
    rig.root.worldToLocal(hand.getWorldPosition(scratchWrist));
    const [x, y, z] = PLAYER_TOY_HELD_OFFSETS[kind];
    mesh.position.set(scratchWrist.x + x, scratchWrist.y + y, scratchWrist.z + z);
    mesh.quaternion.copy(PLAYER_TOY_HELD_TURNS[kind]);
  }

  /** Removes the item. */
  clear(): void {
    if (this.mesh === null) return;
    this.mesh.removeFromParent();
    playerToyMeshDispose(this.mesh);
    this.mesh = null;
  }
}
