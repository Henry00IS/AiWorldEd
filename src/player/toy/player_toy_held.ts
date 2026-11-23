import * as THREE from 'three';
import type { PhysicsToyKind } from '@/physics/ball/physics_ball_constants.js';
import { PLAYER_CHARACTER_BONE } from '@/player/character/player_character_bone_ids.js';
import type { PlayerCharacterRig } from '@/player/character/player_character_rig.js';
import { playerGrappleGun, playerGrappleGunMuzzle } from '@/player/grapple/player_grapple_gun.js';
import { PLAYER_TOY_GRAPPLE } from './player_toy_kind.js';
import { playerToyMesh, playerToyMeshDispose } from './player_toy_models.js';

/** What a character can hold: a physics toy or the grapple gun. */
export type PlayerToyHeldKind = PhysicsToyKind | typeof PLAYER_TOY_GRAPPLE;

/**
 * Where a held toy sits relative to the right wrist, in the character's frame
 * (+Z forward, +X to its left): in the palm, a little forward and inward.
 */
const PLAYER_TOY_HELD_OFFSETS: Readonly<Record<PlayerToyHeldKind, readonly [number, number, number]>> = {
  tennis: [0.02, -0.09, 0.03],
  soccer: [0.08, -0.185, 0.07],
  plane: [0.03, -0.07, 0.08],
  grapple: [0.01, -0.07, 0.03],
};

/**
 * Orientation of a held toy in the character's frame (the plane and the gun
 * point ahead, the plane's nose up a little).
 */
const PLAYER_TOY_HELD_TURNS: Readonly<Record<PlayerToyHeldKind, THREE.Quaternion>> = {
  tennis: new THREE.Quaternion(),
  soccer: new THREE.Quaternion(),
  plane: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, Math.PI, 0, 'YXZ')),
  grapple: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0)),
};

const AHEAD = new THREE.Vector3(0, 0, -1);
const scratchWrist = new THREE.Vector3();
const scratchAim = new THREE.Vector3();

/**
 * The toy a character holds, Minecraft style: the item follows the right hand
 * as the walk cycle swings it, and keeps facing the way the body faces, so it
 * never twists with the arm (the grapple gun points at its beam's anchor while
 * hooked). It is a child of the rig root with a raycast that never hits and the
 * rig's helper flags, and it changes no bone, so the animation is untouched.
 */
export class PlayerToyHeld {
  private mesh: THREE.Object3D | null;
  private kind: PlayerToyHeldKind | null;
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
  set(rig: PlayerCharacterRig | null, kind: PlayerToyHeldKind | null, color: number): void {
    if (kind !== this.kind || color !== this.color) this.clear();
    this.kind = kind;
    this.color = color;
    if (rig === null || kind === null) return;
    if (this.mesh === null) {
      this.mesh = kind === PLAYER_TOY_GRAPPLE ? playerGrappleGun() : playerToyMesh(kind, color);
      this.mesh.traverse((child) => (child.frustumCulled = false));
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
  getKind(): PlayerToyHeldKind | null {
    return this.kind;
  }

  /**
   * Returns the held item.
   *
   * @returns Item, or null.
   */
  getMesh(): THREE.Object3D | null {
    return this.mesh;
  }

  /**
   * Copies where the held grapple gun's muzzle is (as last updated).
   *
   * @param target Destination.
   * @returns False unless the gun is held and shown.
   */
  copyMuzzleTo(target: THREE.Vector3): boolean {
    if (this.kind !== PLAYER_TOY_GRAPPLE || !this.mesh?.parent) return false;
    return playerGrappleGunMuzzle(this.mesh, target) !== null;
  }

  /**
   * Moves the item to the posed right hand (call after posing the rig); the gun
   * points at an aim point when given.
   *
   * @param rig Posed character rig.
   * @param aim Point the gun points at (its beam's anchor), or null.
   */
  update(rig: PlayerCharacterRig, aim: THREE.Vector3 | null = null): void {
    const mesh = this.mesh;
    const kind = this.kind;
    const hand = rig.bones.get(PLAYER_CHARACTER_BONE.handRight);
    if (mesh === null || kind === null || hand === undefined) return;
    rig.root.updateMatrixWorld(true);
    rig.root.worldToLocal(hand.getWorldPosition(scratchWrist));
    const [x, y, z] = PLAYER_TOY_HELD_OFFSETS[kind];
    mesh.position.set(scratchWrist.x + x, scratchWrist.y + y, scratchWrist.z + z);
    if (kind === PLAYER_TOY_GRAPPLE && aim) {
      rig.root.worldToLocal(scratchAim.copy(aim)).sub(mesh.position).normalize();
      mesh.quaternion.setFromUnitVectors(AHEAD, scratchAim);
    } else mesh.quaternion.copy(PLAYER_TOY_HELD_TURNS[kind]);
    mesh.updateMatrixWorld(true);
  }

  /** Removes the item. */
  clear(): void {
    if (this.mesh === null) return;
    this.mesh.removeFromParent();
    if (this.mesh instanceof THREE.Mesh) playerToyMeshDispose(this.mesh);
    this.mesh = null;
  }
}
