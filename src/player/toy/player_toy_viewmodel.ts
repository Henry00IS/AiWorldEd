import * as THREE from 'three';
import type { PhysicsToyKind } from '@/physics/ball/physics_ball_constants.js';
import { playerToyMesh, playerToyMeshDispose } from './player_toy_models.js';
import {
  PLAYER_TOY_ARM_PLANE_CENTER,
  PLAYER_TOY_ARM_SKIN_COLOR,
  playerToyArmApply,
  playerToyArmBuild,
  playerToyArmGrip,
  playerToyArmLevel,
  type PlayerToyArmRig,
} from './player_toy_viewmodel_arm.js';
import {
  PLAYER_TOY_POSE_PLACE_RELEASE,
  PLAYER_TOY_POSE_REFILL,
  PLAYER_TOY_POSE_THROW_RELEASE,
  PLAYER_TOY_POSE_WINDUP,
  playerToyCharge,
  playerToyChargePower,
  playerToyPoseAt,
} from './player_toy_viewmodel_pose.js';

/**
 * Vertical field of view of the hand's own camera in degrees: fixed, so the
 * hand and toy keep their size whatever the play camera does.
 */
const PLAYER_TOY_VIEW_FOV = 70;
/** Near plane of the hand camera (the shoulder is just beside the eye). */
const PLAYER_TOY_VIEW_NEAR = 0.01;
/** Attitude of the held plane in view space: level, nose a little up. */
const PLAYER_TOY_VIEW_PLANE_ATTITUDE = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.06, 0, 'YXZ'));

/**
 * First-person right arm holding the toy at its true size, drawn by its own
 * camera in its own scene after the world (depth cleared), so it never clips
 * into walls, never changes size and is never part of the level. The arm is one
 * joint chain (see playerToyArmBuild); it sways while idle, bobs while walking,
 * and on a click winds back, swings forward from the shoulder and lets go (or
 * reaches down to put a soccer ball down). While the button is held after the
 * wind-up the arm keeps drawing back, charging the throw for up to a second.
 * The toy is thrown at the release, from where the hand is on screen.
 */
export class PlayerToyViewModel {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly root: THREE.Group;
  private readonly rig: PlayerToyArmRig;
  private readonly materials: THREE.Material[];
  private item: THREE.Mesh | null;
  private kind: PhysicsToyKind | null;
  private color: number;
  private actionAt: number;
  private actionKind: PhysicsToyKind | null;
  private released: boolean;
  private pressed: boolean;
  private charge: number;
  private bobPhase: number;

  /**
   * Builds the arm.
   *
   * @param color Sleeve color (the member color).
   */
  constructor(color: number) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(PLAYER_TOY_VIEW_FOV, 1, PLAYER_TOY_VIEW_NEAR, 10);
    this.root = new THREE.Group();
    this.root.name = 'Player view model';
    const skin = new THREE.MeshStandardMaterial({ color: PLAYER_TOY_ARM_SKIN_COLOR, roughness: 0.7 });
    const sleeve = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
    this.materials = [skin, sleeve];
    this.rig = playerToyArmBuild(skin, sleeve);
    this.root.add(this.rig.shoulder);
    this.scene.add(this.root, ...playerToyViewLights());
    this.item = null;
    this.kind = null;
    this.color = color;
    this.actionAt = Number.NEGATIVE_INFINITY;
    this.actionKind = null;
    this.released = true;
    this.pressed = false;
    this.charge = 0;
    this.bobPhase = 0;
  }

  /**
   * Shows a toy in the hand.
   *
   * @param kind Toy kind.
   * @param color Member color.
   */
  setItem(kind: PhysicsToyKind, color: number): void {
    if (kind === this.kind && color === this.color && this.item) return;
    this.removeItem();
    this.kind = kind;
    this.color = color;
    const item = playerToyMesh(kind, color);
    item.frustumCulled = false;
    if (kind === 'plane') item.position.copy(PLAYER_TOY_ARM_PLANE_CENTER);
    playerToyArmGrip(this.rig, kind);
    this.item = item;
    this.rig.grip.add(item);
  }

  /**
   * Starts a throw (or a put-down for a soccer ball) unless one is under way
   * before its release. A throw pauses wound back until letGo.
   *
   * @param now Time in seconds.
   * @param kind Toy to throw.
   * @returns True when started.
   */
  act(now: number, kind: PhysicsToyKind): boolean {
    if (!this.released) return false;
    this.actionAt = now;
    this.actionKind = kind;
    this.released = false;
    this.pressed = kind !== 'soccer';
    this.charge = 0;
    return true;
  }

  /**
   * Lets go of the button: a throw held past the wind-up keeps its charge and
   * swings forward from there, an earlier one carries on as a quick click.
   *
   * @param now Time in seconds.
   */
  letGo(now: number): void {
    if (!this.pressed) return;
    this.pressed = false;
    const held = now - this.actionAt;
    if (held <= PLAYER_TOY_POSE_WINDUP) return;
    this.charge = playerToyCharge(held);
    this.actionAt = now - PLAYER_TOY_POSE_WINDUP;
  }

  /**
   * Returns the throw speed factor of the current throw.
   *
   * @returns 1 for a quick click, up to 2 for a full charge.
   */
  getPower(): number {
    return playerToyChargePower(this.charge);
  }

  /** Drops any throw under way and rests the arm. */
  reset(): void {
    this.actionAt = Number.NEGATIVE_INFINITY;
    this.released = true;
    this.pressed = false;
    this.charge = 0;
  }

  /**
   * Hands over the toy once the animation reaches its release.
   *
   * @param now Time in seconds.
   * @returns Toy to throw now, or null.
   */
  takeRelease(now: number): PhysicsToyKind | null {
    if (this.released || this.actionKind === null) return null;
    if (this.since(now) < this.releaseAt()) return null;
    this.released = true;
    return this.actionKind;
  }

  /**
   * Animates the arm: idle sway, walking bob and the throw.
   *
   * @param now Time in seconds.
   * @param deltaSeconds Frame time.
   * @param planarSpeed Walking speed in meters per second.
   */
  update(now: number, deltaSeconds: number, planarSpeed: number): void {
    const walk = Math.min(1, planarSpeed / 5);
    this.bobPhase += deltaSeconds * (4 + 5 * walk);
    const since = this.since(now);
    const charge = this.pressed ? playerToyCharge(now - this.actionAt) : this.charge;
    const pose = playerToyPoseAt(since, this.actionKind === 'soccer', charge);
    const breathe = Math.sin(now * 1.7) * 0.012;
    pose.pitch += breathe - Math.abs(Math.sin(this.bobPhase)) * 0.05 * walk;
    pose.yaw += Math.cos(this.bobPhase) * 0.035 * walk + Math.sin(now * 0.9) * 0.008;
    playerToyArmApply(this.rig, pose);
    if (this.kind === 'plane') playerToyArmLevel(this.rig, PLAYER_TOY_VIEW_PLANE_ATTITUDE);
    if (this.item) this.item.visible = playerToyViewHolds(since, this.releaseAt());
  }

  /**
   * Draws the arm over the world into the current viewport: depth cleared, its
   * own camera at the play camera's aspect.
   *
   * @param renderer Renderer, its viewport set to the play pane.
   * @param aspect Play camera aspect ratio.
   */
  render(renderer: THREE.WebGLRenderer, aspect: number): void {
    if (!this.root.visible) return;
    if (this.camera.aspect !== aspect) {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }

  /**
   * Returns where the toy in the hand is in the world: the point the play
   * camera shows at the same screen position and depth as the hand camera shows
   * the toy, so a thrown toy leaves the hand on screen.
   *
   * @param playCamera Play camera.
   * @param out Receives the position.
   * @returns The position.
   */
  getHandWorld(playCamera: THREE.PerspectiveCamera, out: THREE.Vector3): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    const local = this.rig.grip.getWorldPosition(new THREE.Vector3());
    const depth = -local.z;
    playCamera.updateMatrixWorld();
    this.camera.aspect = playCamera.aspect;
    this.camera.updateProjectionMatrix();
    const ndc = local.project(this.camera);
    const tan = Math.tan(THREE.MathUtils.degToRad(playCamera.fov) / 2);
    const view = new THREE.Vector3(ndc.x * tan * playCamera.aspect * depth, ndc.y * tan * depth, -depth);
    return out.copy(view).applyMatrix4(playCamera.matrixWorld);
  }

  /**
   * Returns the toy in the hand.
   *
   * @returns Kind, or null.
   */
  getKind(): PhysicsToyKind | null {
    return this.kind;
  }

  /**
   * Tells whether the toy is in the hand (not thrown and not yet refilled).
   *
   * @returns True when shown.
   */
  isItemShown(): boolean {
    return this.item?.visible === true;
  }

  /**
   * Returns the arm joints.
   *
   * @returns Joints.
   */
  getRig(): PlayerToyArmRig {
    return this.rig;
  }

  /** Frees the arm geometry and materials (the toy geometry is shared). */
  dispose(): void {
    this.removeItem();
    this.root.traverse((child) => {
      if (child instanceof THREE.Mesh) child.geometry.dispose();
    });
    this.materials.forEach((material) => material.dispose());
  }

  /**
   * Returns the animation time of the current action: held at the wind-up while
   * the button is down.
   *
   * @param now Time in seconds.
   * @returns Seconds into the animation.
   */
  private since(now: number): number {
    const since = now - this.actionAt;
    return this.pressed ? Math.min(since, PLAYER_TOY_POSE_WINDUP) : since;
  }

  /**
   * Returns when the current action lets go of the toy.
   *
   * @returns Seconds after the click.
   */
  private releaseAt(): number {
    return this.actionKind === 'soccer' ? PLAYER_TOY_POSE_PLACE_RELEASE : PLAYER_TOY_POSE_THROW_RELEASE;
  }

  /** Removes the toy from the hand. */
  private removeItem(): void {
    if (this.item === null) return;
    this.item.removeFromParent();
    playerToyMeshDispose(this.item);
    this.item = null;
    this.kind = null;
  }
}

/**
 * Tells whether the hand holds its toy at a time of the animation: from the
 * release until the refill it is empty.
 *
 * @param since Seconds since the click.
 * @param release Seconds after the click when the toy leaves the hand.
 * @returns True when held.
 */
function playerToyViewHolds(since: number, release: number): boolean {
  return since < release || since >= PLAYER_TOY_POSE_REFILL;
}

/**
 * Lights of the hand scene: sky and ground fill and a key light from above
 * left, close to the editor's default lighting.
 *
 * @returns Lights.
 */
function playerToyViewLights(): THREE.Light[] {
  const sky = new THREE.HemisphereLight(0xffffff, 0xb4ada4, 1.5);
  const key = new THREE.DirectionalLight(0xffffff, 1.3);
  key.position.set(-1, 2, 2);
  return [sky, key];
}
