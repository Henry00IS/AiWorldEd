import * as THREE from 'three';
import type { PlayerBodyState } from '@/player/movement/player_body_state.js';
import type { PlayerViewMode } from '@/player/player_mode.js';
import { playerCharacterApplyRoomTint } from './player_character_tint.js';
import { playerCharacterEnsureModelLoaded } from './player_character_model_loader.js';
import {
  playerCharacterBuildRig,
  playerCharacterCopyRightHand,
  playerCharacterDisposeRig,
  type PlayerCharacterRig,
} from './player_character_rig.js';
import { PlayerCharacterAnimator } from './player_character_animator.js';
import type { PlayerCharacterHandTargets } from './player_character_hand_targets.js';
import type { PhysicsToyKind } from '@/physics/ball/physics_ball_constants.js';
import { PlayerToyHeld } from '@/player/toy/player_toy_held.js';
import { playerCharacterTagHelperTree } from './player_character_model_prepare.js';
import type { PlayerHelperLayer } from '@/player/player_helper_layer.js';

/**
 * Play-mode avatar: exclusive-state gait and footstep audio in first and third
 * person, plus third-person skeletal IK.
 */
export class PlayerCharacterAvatar {
  private readonly layer: PlayerHelperLayer;
  private rig: PlayerCharacterRig | null;
  private readonly animator: PlayerCharacterAnimator;
  /** Pose root for gait/footsteps when the mesh rig is not ready. */
  private readonly locomotionRoot: THREE.Object3D;
  private readonly held: PlayerToyHeld;
  private heldColor: number;
  private isAttached: boolean;
  private isDisposed: boolean;
  private loadPromise: Promise<void> | null;
  private roomColor: number | null;
  private originalMaterials: Map<THREE.Mesh, THREE.Material | THREE.Material[]> | null;
  private tintedMaterials: THREE.Material[];

  /**
   * Creates an avatar that can be attached to the editor overlay layer.
   *
   * @param layer Overlay layer for the character mesh, outside the level.
   */
  constructor(layer: PlayerHelperLayer) {
    this.layer = layer;
    this.rig = null;
    this.animator = new PlayerCharacterAnimator();
    this.locomotionRoot = new THREE.Object3D();
    this.locomotionRoot.name = 'PlayerLocomotionRoot';
    this.held = new PlayerToyHeld(playerCharacterTagHelperTree);
    this.heldColor = 0;
    this.isAttached = false;
    this.isDisposed = false;
    this.loadPromise = null;
    this.roomColor = null;
    this.originalMaterials = null;
    this.tintedMaterials = [];
    this.beginModelLoad();
  }

  /** Shows the avatar on the overlay layer if not already attached. */
  attach(): void {
    if (this.isDisposed || this.isAttached) {
      return;
    }
    this.isAttached = true;
    this.animator.reset();
    this.beginModelLoad();
    if (this.rig) {
      this.layer.helperAdd(this.rig.root);
    }
  }

  /** Removes the avatar from the overlay layer without disposing resources. */
  detach(): void {
    if (!this.isAttached) {
      return;
    }
    if (this.rig) {
      this.layer.helperRemove(this.rig.root);
    }
    this.isAttached = false;
  }

  /**
   * Advances exclusive locomotion and, in third person, torso pose plus IK.
   *
   * @param body Player body state.
   * @param viewMode First or third person.
   * @param deltaSeconds Frame delta.
   */
  update(body: PlayerBodyState, viewMode: PlayerViewMode, deltaSeconds: number): void {
    if (!this.isAttached) {
      return;
    }
    const locomotionRoot = this.resolveLocomotionRoot(body, viewMode);
    this.animator.update(locomotionRoot, body, deltaSeconds);
    if (viewMode === 'third_person' && this.rig) {
      this.animator.pose(this.rig, body);
      this.held.update(this.rig);
    }
  }

  /**
   * Tints the local third-person character toward the member's room color, or
   * restores the default colors outside a room.
   *
   * @param color Member color, or null when not in a room.
   */
  setRoomColor(color: number | null): void {
    if (this.isDisposed) {
      return;
    }
    if (this.roomColor === color) {
      return;
    }
    this.roomColor = color;
    this.applyRoomColor();
  }

  /**
   * Puts the character's hands on targets (the keys of a placed keyboard), or
   * frees them.
   *
   * @param targets Hand targets, or null.
   */
  setHandTargets(targets: PlayerCharacterHandTargets | null): void {
    this.animator.setHandTargets(targets);
  }

  /**
   * Makes the right arm reach for a point (the grapple beam's anchor), or not.
   *
   * @param point Point, or null.
   */
  setReach(point: THREE.Vector3 | null): void {
    this.animator.setReach(point);
  }

  /**
   * Copies where the right hand is as last posed (third person).
   *
   * @param target Destination.
   * @returns False while the rig is not loaded.
   */
  copyRightHandTo(target: THREE.Vector3): boolean {
    return this.rig !== null && playerCharacterCopyRightHand(this.rig, target);
  }

  /**
   * Shows a toy in the character's right hand (seen in third person).
   *
   * @param kind Toy kind, or null.
   * @param color Member color.
   */
  setHeld(kind: PhysicsToyKind | null, color: number): void {
    const changed = kind !== this.held.getKind() || color !== this.heldColor;
    this.heldColor = color;
    if (changed || (this.rig !== null && kind !== null && this.held.getMesh() === null))
      this.held.set(this.rig, kind, color);
  }

  /**
   * Positions the active locomotion root from the body pose.
   *
   * @param body Player body.
   * @param viewMode First or third person.
   * @returns Root used for gait world conversion and footsteps.
   */
  private resolveLocomotionRoot(body: PlayerBodyState, viewMode: PlayerViewMode): THREE.Object3D {
    if (this.rig) {
      this.rig.root.position.copy(body.getFeetPosition());
      this.rig.root.rotation.set(0, body.getFacingYawRadians(), 0);
      this.rig.root.visible = viewMode === 'third_person';
      return this.rig.root;
    }
    this.locomotionRoot.position.copy(body.getFeetPosition());
    this.locomotionRoot.rotation.set(0, body.getFacingYawRadians(), 0);
    return this.locomotionRoot;
  }

  /** Detaches and disposes mesh resources. */
  dispose(): void {
    this.isDisposed = true;
    this.held.clear();
    this.animator.dispose();
    this.detach();
    this.restoreOriginalMaterials();
    this.disposeTintedMaterials();
    this.originalMaterials = null;
    if (this.rig) {
      playerCharacterDisposeRig(this.rig.root);
      this.rig = null;
    }
  }

  /** Starts asynchronous model load when the rig is not ready. */
  private beginModelLoad(): void {
    if (this.rig || this.loadPromise || this.isDisposed) {
      return;
    }
    this.loadPromise = playerCharacterEnsureModelLoaded()
      .then(() => {
        this.onModelLoaded();
      })
      .catch(() => {
        this.loadPromise = null;
      });
  }

  /** Builds the rig after the model template becomes available. */
  private onModelLoaded(): void {
    if (this.isDisposed || this.rig) {
      return;
    }
    this.rig = playerCharacterBuildRig();
    this.applyRoomColor();
    this.held.set(this.rig, this.held.getKind(), this.heldColor);
    if (this.isAttached) {
      this.layer.helperAdd(this.rig.root);
    }
  }

  /** Tints or restores the current mesh rig from the stored room color. */
  private applyRoomColor(): void {
    if (!this.rig) {
      return;
    }
    this.captureOriginalMaterials();
    this.restoreOriginalMaterials();
    this.disposeTintedMaterials();
    if (this.roomColor === null) {
      return;
    }
    this.tintedMaterials = playerCharacterApplyRoomTint(
      this.rig.root,
      this.roomColor,
      (mesh) => this.originalMaterials?.has(mesh) === true,
    );
  }

  /** Remembers the shared template materials once, before any local tint. */
  private captureOriginalMaterials(): void {
    if (!this.rig || this.originalMaterials) {
      return;
    }
    const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    this.rig.root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        originals.set(child, child.material);
      }
    });
    this.originalMaterials = originals;
  }

  /** Puts the shared template materials back on the mesh rig. */
  private restoreOriginalMaterials(): void {
    if (!this.originalMaterials) {
      return;
    }
    this.originalMaterials.forEach((material, mesh) => {
      mesh.material = material;
    });
  }

  /** Frees tinted material copies without touching the shared template. */
  private disposeTintedMaterials(): void {
    for (const material of this.tintedMaterials) {
      material.dispose();
    }
    this.tintedMaterials = [];
  }
}
