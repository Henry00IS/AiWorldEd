import * as THREE from 'three';
import type { PlayerBodyState } from '@/player/movement/player_body_state.js';
import type { PlayerViewMode } from '@/player/player_mode.js';
import { playerCharacterEnsureModelLoaded } from './player_character_model_loader.js';
import { playerCharacterBuildRig, playerCharacterDisposeRig, type PlayerCharacterRig } from './player_character_rig.js';
import { PlayerCharacterAnimator } from './player_character_animator.js';
import type { PhysicsToyKind } from '@/physics/ball/physics_ball_constants.js';
import { PlayerToyHeld } from '@/player/toy/player_toy_held.js';
import { playerCharacterTagHelperTree } from './player_character_model_prepare.js';

/**
 * Play-mode avatar: exclusive-state gait and footstep audio in first and third
 * person, plus third-person skeletal IK.
 */
export class PlayerCharacterAvatar {
  private readonly worldRoot: THREE.Object3D;
  private rig: PlayerCharacterRig | null;
  private readonly animator: PlayerCharacterAnimator;
  /** Pose root for gait/footsteps when the mesh rig is not ready. */
  private readonly locomotionRoot: THREE.Object3D;
  private readonly held: PlayerToyHeld;
  private heldColor: number;
  private isAttached: boolean;
  private isDisposed: boolean;
  private loadPromise: Promise<void> | null;

  /**
   * Creates an avatar that can be attached to the editor world root.
   *
   * @param worldRoot Scene root for the character mesh.
   */
  constructor(worldRoot: THREE.Object3D) {
    this.worldRoot = worldRoot;
    this.rig = null;
    this.animator = new PlayerCharacterAnimator();
    this.locomotionRoot = new THREE.Object3D();
    this.locomotionRoot.name = 'PlayerLocomotionRoot';
    this.held = new PlayerToyHeld(playerCharacterTagHelperTree);
    this.heldColor = 0;
    this.isAttached = false;
    this.isDisposed = false;
    this.loadPromise = null;
    this.beginModelLoad();
  }

  /** Adds the avatar to the world if not already attached. */
  attach(): void {
    if (this.isDisposed || this.isAttached) {
      return;
    }
    this.isAttached = true;
    this.animator.reset();
    this.beginModelLoad();
    if (this.rig) {
      this.worldRoot.add(this.rig.root);
    }
  }

  /** Removes the avatar from the world without disposing resources. */
  detach(): void {
    if (!this.isAttached) {
      return;
    }
    if (this.rig) {
      this.worldRoot.remove(this.rig.root);
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
    this.detach();
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
    this.held.set(this.rig, this.held.getKind(), this.heldColor);
    if (this.isAttached) {
      this.worldRoot.add(this.rig.root);
    }
  }
}
