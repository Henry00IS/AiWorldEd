import * as THREE from 'three';
import type { PhysicsToyKind } from '@/physics/ball/physics_ball_constants.js';
import { playerToyMesh, playerToyMeshDispose } from './player_toy_models.js';

/**
 * Size of the view model relative to the world. Half size at half the distance
 * looks the same through the camera, but stays closer than any wall can get
 * (the player collider keeps walls 0.35 m away), so it never clips into one.
 */
const PLAYER_TOY_VIEW_SCALE = 0.5;
/** Hand position in front of the camera at full size (+X right, -Z ahead). */
const PLAYER_TOY_VIEW_HAND = new THREE.Vector3(0.2, -0.21, -0.42);
/** Length of a throw or put-down animation in seconds. */
const PLAYER_TOY_VIEW_THROW_SECONDS = 0.45;
/** When the next toy appears in the hand again, in seconds after a throw. */
const PLAYER_TOY_VIEW_REFILL_SECONDS = 0.3;
/** Skin and sleeve colors. */
const PLAYER_TOY_VIEW_SKIN = 0xe0ac86;
/** Where each toy sits on the palm, at full size. */
const PLAYER_TOY_VIEW_ITEM: Readonly<Record<PhysicsToyKind, THREE.Vector3>> = {
  tennis: new THREE.Vector3(0, 0.08, -0.01),
  soccer: new THREE.Vector3(-0.02, 0.125, -0.03),
  plane: new THREE.Vector3(-0.01, 0.06, -0.06),
};
/** Turn of each toy on the palm (the plane points ahead). */
const PLAYER_TOY_VIEW_ITEM_TURN: Readonly<Record<PhysicsToyKind, THREE.Euler>> = {
  tennis: new THREE.Euler(),
  soccer: new THREE.Euler(),
  plane: new THREE.Euler(0.1, -0.08, 0, 'YXZ'),
};

/**
 * First-person hand with the held toy, drawn in front of the camera: a sleeve
 * in the member color and a hand holding the toy on its palm. It bobs while
 * walking, swings forward on a throw (dips down when putting a ball down) and
 * gets the next toy shortly after. A helper object (never saved, picked or
 * collided with), shown only in first person.
 */
export class PlayerToyViewModel {
  readonly root: THREE.Group;
  private readonly arm: THREE.Group;
  private readonly materials: THREE.Material[];
  private item: THREE.Mesh | null;
  private kind: PhysicsToyKind | null;
  private color: number;
  private actionAt: number;
  private actionDown: boolean;
  private bobPhase: number;

  /**
   * Builds the hand.
   *
   * @param color Sleeve color (the member color).
   */
  constructor(color: number) {
    this.root = new THREE.Group();
    this.root.name = 'Player view model';
    this.root.scale.setScalar(PLAYER_TOY_VIEW_SCALE);
    this.arm = new THREE.Group();
    this.materials = [];
    this.item = null;
    this.kind = null;
    this.color = color;
    this.actionAt = Number.NEGATIVE_INFINITY;
    this.actionDown = false;
    this.bobPhase = 0;
    this.buildArm(color);
    this.root.add(this.arm);
    this.root.traverse((child) => {
      child.frustumCulled = false;
      child.raycast = () => undefined;
    });
  }

  /**
   * Shows a toy on the palm.
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
    item.position.copy(PLAYER_TOY_VIEW_ITEM[kind]);
    item.quaternion.setFromEuler(PLAYER_TOY_VIEW_ITEM_TURN[kind]);
    this.item = item;
    this.arm.add(item);
  }

  /**
   * Plays the throw (or put-down) animation from now.
   *
   * @param now Time in seconds.
   * @param down True to put the toy down instead of throwing it.
   */
  act(now: number, down: boolean): void {
    this.actionAt = now;
    this.actionDown = down;
  }

  /**
   * Follows the camera and animates.
   *
   * @param camera Play camera (its world pose).
   * @param now Time in seconds.
   * @param deltaSeconds Frame time.
   * @param planarSpeed Walking speed in meters per second.
   */
  update(camera: THREE.Camera, now: number, deltaSeconds: number, planarSpeed: number): void {
    camera.updateMatrixWorld();
    camera.matrixWorld.decompose(this.root.position, this.root.quaternion, new THREE.Vector3());
    const walk = Math.min(1, planarSpeed / 5);
    this.bobPhase += deltaSeconds * (4 + 5 * walk);
    const bobX = Math.cos(this.bobPhase) * 0.012 * walk;
    const bobY = -Math.abs(Math.sin(this.bobPhase)) * 0.014 * walk;
    this.armPose(now - this.actionAt, bobX, bobY);
  }

  /**
   * Places the arm for a throw or place swing and hides the thrown toy until
   * the hand refills.
   *
   * @param sinceAction Seconds since the last throw or place.
   * @param bobX Sideways walking bob.
   * @param bobY Vertical walking bob.
   */
  private armPose(sinceAction: number, bobX: number, bobY: number): void {
    const swing = playerToyViewSwing(sinceAction);
    const lift = this.actionDown ? -0.16 : 0.05;
    const reach = this.actionDown ? -0.06 : -0.2;
    this.arm.position.set(
      PLAYER_TOY_VIEW_HAND.x + bobX - swing * 0.05,
      PLAYER_TOY_VIEW_HAND.y + bobY + swing * lift,
      PLAYER_TOY_VIEW_HAND.z + swing * reach,
    );
    this.arm.rotation.set(swing * (this.actionDown ? 0.5 : -0.7), 0.25 * swing, 0, 'YXZ');
    if (!this.item) return;
    const refill = THREE.MathUtils.clamp((sinceAction - PLAYER_TOY_VIEW_REFILL_SECONDS) / 0.15, 0, 1);
    const shown = sinceAction < 0 || sinceAction >= PLAYER_TOY_VIEW_THROW_SECONDS ? 1 : refill;
    this.item.visible = shown > 0;
    this.item.scale.setScalar(Math.max(1e-3, shown));
  }

  /**
   * Returns the toy on the palm.
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

  /** Frees the materials (the toy geometry is shared). */
  dispose(): void {
    this.root.removeFromParent();
    this.removeItem();
    this.root.traverse((child) => {
      if (child instanceof THREE.Mesh) child.geometry.dispose();
    });
    this.materials.forEach((material) => material.dispose());
  }

  /**
   * Builds the sleeve, the palm, the curled fingers and the thumb. The hand
   * origin is the palm center, palm up and fingers ahead.
   *
   * @param color Sleeve color.
   */
  private buildArm(color: number): void {
    const skin = new THREE.MeshStandardMaterial({ color: PLAYER_TOY_VIEW_SKIN, roughness: 0.7 });
    const sleeve = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
    this.materials.push(skin, sleeve);
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), skin);
    palm.scale.set(1, 0.42, 1.15);
    const fingers = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.06, 4, 8), skin);
    fingers.rotation.z = Math.PI / 2;
    fingers.position.set(0, 0.022, -0.055);
    fingers.scale.set(1, 1.05, 1.3);
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.013, 0.035, 4, 8), skin);
    thumb.position.set(-0.05, 0.02, -0.01);
    thumb.rotation.set(0.5, 0, 0.9);
    const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.038, 0.06, 14), skin);
    wrist.rotation.x = Math.PI / 2;
    wrist.position.set(0, -0.005, 0.07);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.3, 16), sleeve);
    cuff.rotation.x = Math.PI / 2 - 0.25;
    cuff.position.set(0.02, -0.04, 0.24);
    this.arm.add(palm, fingers, thumb, wrist, cuff);
  }

  /** Removes the toy from the palm. */
  private removeItem(): void {
    if (this.item === null) return;
    this.item.removeFromParent();
    playerToyMeshDispose(this.item);
    this.item = null;
    this.kind = null;
  }
}

/**
 * Throw curve: a quick swing out to 1, then an eased return to rest.
 *
 * @param t Seconds since the throw (negative before any).
 * @returns Swing amount 0..1.
 */
export function playerToyViewSwing(t: number): number {
  if (t < 0 || t >= PLAYER_TOY_VIEW_THROW_SECONDS) return 0;
  const out = 0.1;
  if (t < out) return Math.sin(((t / out) * Math.PI) / 2);
  const back = (t - out) / (PLAYER_TOY_VIEW_THROW_SECONDS - out);
  return 0.5 + 0.5 * Math.cos(back * Math.PI);
}
