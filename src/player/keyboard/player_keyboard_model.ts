import * as THREE from 'three';
import { PLAYER_BALL_USERDATA_KEY } from '@/player/ball/player_ball_constants.js';
import { PLAYER_KEYBOARD_KEY_COUNT, PLAYER_KEYBOARD_PLAY_HEIGHT_METERS } from './player_keyboard_constants.js';

/** White key width. */
const PLAYER_KEYBOARD_WHITE_WIDTH = 0.03;
/** White key depth. */
const PLAYER_KEYBOARD_WHITE_DEPTH = 0.14;
/** Distance a held key sinks. */
const PLAYER_KEYBOARD_KEY_TRAVEL = 0.008;
/** Decal-thin gap that keeps touching faces from being coplanar (no z-fighting). */
const PLAYER_KEYBOARD_FACE_GAP = 0.0003;
/** Black key depth. */
const PLAYER_KEYBOARD_BLACK_DEPTH = 0.085 - PLAYER_KEYBOARD_FACE_GAP;
/** Semitones within an octave that are white keys. */
const PLAYER_KEYBOARD_WHITE_STEPS = new Set([0, 2, 4, 5, 7, 9, 11]);
/** White key count across the keyboard. */
const PLAYER_KEYBOARD_WHITE_COUNT = Array.from({ length: PLAYER_KEYBOARD_KEY_COUNT }, (_, index) => index).filter(
  (index) => PLAYER_KEYBOARD_WHITE_STEPS.has(index % 12),
).length;
/** Width of the key bed. */
export const PLAYER_KEYBOARD_WIDTH_METERS = PLAYER_KEYBOARD_WHITE_COUNT * PLAYER_KEYBOARD_WHITE_WIDTH;

/**
 * Tells whether a key index is a white key.
 *
 * @param index Key index from the lowest key.
 * @returns True for white keys.
 */
export function playerKeyboardIsWhite(index: number): boolean {
  return PLAYER_KEYBOARD_WHITE_STEPS.has(((index % 12) + 12) % 12);
}

/**
 * Returns the local center of a key: +X is the player's left, +Z points away
 * from the player.
 *
 * @param index Key index from the lowest key.
 * @param target Destination.
 * @returns Key top center.
 */
export function playerKeyboardKeyLocal(index: number, target: THREE.Vector3): THREE.Vector3 {
  const whites = Array.from({ length: index }, (_, key) => key).filter(playerKeyboardIsWhite).length;
  const left = PLAYER_KEYBOARD_WIDTH_METERS / 2;
  if (playerKeyboardIsWhite(index))
    return target.set(left - (whites + 0.5) * PLAYER_KEYBOARD_WHITE_WIDTH, PLAYER_KEYBOARD_PLAY_HEIGHT_METERS, -0.035);
  return target.set(left - whites * PLAYER_KEYBOARD_WHITE_WIDTH, PLAYER_KEYBOARD_PLAY_HEIGHT_METERS + 0.012, 0.015);
}

/** Low-poly keyboard on an X stand whose keys sink while held. */
export class PlayerKeyboardModel {
  readonly root = new THREE.Group();
  private readonly keys: THREE.Mesh[] = [];
  private readonly materials: THREE.Material[];
  private readonly geometries: THREE.BufferGeometry[] = [];

  /**
   * Builds the model in a member color.
   *
   * @param color Member color for the case trim.
   */
  constructor(color: number) {
    this.root.name = 'Keyboard Toy';
    this.materials = [0xf4f1e8, 0x141414, 0x262626, color].map(
      (tone) => new THREE.MeshStandardMaterial({ color: tone, roughness: 0.55 }),
    );
    this.buildKeys();
    this.buildCase();
    this.buildStand();
    this.root.traverse((child) => this.markHelper(child));
  }

  /**
   * Places the model.
   *
   * @param position Stand center on the ground.
   * @param yaw Playing direction.
   */
  place(position: THREE.Vector3, yaw: number): void {
    this.root.position.copy(position);
    this.root.rotation.set(0, yaw, 0);
    this.root.updateMatrixWorld(true);
  }

  /**
   * Shows keys as held.
   *
   * @param held Held key indices.
   */
  setHeld(held: ReadonlySet<number>): void {
    this.keys.forEach((key, index) => {
      key.position.y =
        playerKeyboardKeyLocal(index, new THREE.Vector3()).y - (held.has(index) ? PLAYER_KEYBOARD_KEY_TRAVEL : 0);
    });
  }

  /**
   * Returns a key's sunk state for tests and diagnostics.
   *
   * @param index Key index.
   * @returns True if its mesh is lowered.
   */
  isKeyDown(index: number): boolean {
    const key = this.keys[index];
    return key !== undefined && key.position.y < playerKeyboardKeyLocal(index, new THREE.Vector3()).y - 1e-6;
  }

  /**
   * Converts a key top to world space.
   *
   * @param index Key index.
   * @param target Destination.
   * @returns World position.
   */
  keyWorld(index: number, target: THREE.Vector3): THREE.Vector3 {
    return this.root.localToWorld(playerKeyboardKeyLocal(index, target));
  }

  /** Frees every material and geometry owned by the model. */
  dispose(): void {
    this.root.removeFromParent();
    this.materials.forEach((material) => material.dispose());
    this.geometries.forEach((geometry) => geometry.dispose());
  }

  /** Builds white and black keys. */
  private buildKeys(): void {
    const white = this.geometry(PLAYER_KEYBOARD_WHITE_WIDTH * 0.94, 0.018, PLAYER_KEYBOARD_WHITE_DEPTH);
    const black = this.geometry(0.017, 0.018, PLAYER_KEYBOARD_BLACK_DEPTH);
    for (let index = 0; index < PLAYER_KEYBOARD_KEY_COUNT; index++) {
      const isWhite = playerKeyboardIsWhite(index);
      const key = new THREE.Mesh(isWhite ? white : black, this.materials[isWhite ? 0 : 1]);
      playerKeyboardKeyLocal(index, key.position);
      key.position.z = isWhite ? 0 : PLAYER_KEYBOARD_BLACK_DEPTH / 2 - 0.015;
      key.position.y -= 0.009;
      this.keys.push(key);
      this.root.add(key);
    }
  }

  /**
   * Builds the case body and the colored trim behind the keys (inset a sliver
   * from the body's sides and back so no faces are coplanar).
   */
  private buildCase(): void {
    this.box(
      PLAYER_KEYBOARD_WIDTH_METERS + 0.06,
      0.05,
      0.24,
      new THREE.Vector3(0, PLAYER_KEYBOARD_PLAY_HEIGHT_METERS - 0.043, 0.03),
      2,
    );
    this.box(
      PLAYER_KEYBOARD_WIDTH_METERS + 0.06 - PLAYER_KEYBOARD_FACE_GAP * 2,
      0.03,
      0.05 - PLAYER_KEYBOARD_FACE_GAP,
      new THREE.Vector3(0, PLAYER_KEYBOARD_PLAY_HEIGHT_METERS - 0.002, 0.125 - PLAYER_KEYBOARD_FACE_GAP / 2),
      3,
    );
  }

  /**
   * Builds two crossed leg pairs (the legs of a pair a sliver apart so their
   * faces do not overlap where they cross), feet and support arms.
   */
  private buildStand(): void {
    const top = PLAYER_KEYBOARD_PLAY_HEIGHT_METERS - 0.07;
    const span = 0.32;
    const length = Math.hypot(span * 2, top);
    [-0.07, 0.11].forEach((z) => {
      [1, -1].forEach((side) => {
        const bar = this.box(
          0.025,
          length,
          0.025,
          new THREE.Vector3(0, top / 2, z + (side * PLAYER_KEYBOARD_FACE_GAP) / 2),
          2,
        );
        bar.rotation.z = side * Math.atan2(span * 2, top);
      });
    });
    [span, -span].forEach((x) => this.box(0.03, 0.025, 0.32, new THREE.Vector3(x, 0.0125, 0.02), 2));
    [span, -span].forEach((x) => this.box(0.025, 0.025, 0.3, new THREE.Vector3(x, top, 0.02), 2));
  }

  /**
   * Adds one box mesh.
   *
   * @param width Width.
   * @param height Height.
   * @param depth Depth.
   * @param position Local center.
   * @param material Material index.
   * @returns Mesh.
   */
  private box(width: number, height: number, depth: number, position: THREE.Vector3, material: number): THREE.Mesh {
    const mesh = new THREE.Mesh(this.geometry(width, height, depth), this.materials[material]);
    mesh.position.copy(position);
    this.root.add(mesh);
    return mesh;
  }

  /**
   * Creates an owned box geometry.
   *
   * @param width Width.
   * @param height Height.
   * @param depth Depth.
   * @returns Geometry.
   */
  private geometry(width: number, height: number, depth: number): THREE.BoxGeometry {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    this.geometries.push(geometry);
    return geometry;
  }

  /**
   * Excludes an object from picking and editor scene consumers.
   *
   * @param object Model object.
   */
  private markHelper(object: THREE.Object3D): void {
    object.userData[PLAYER_BALL_USERDATA_KEY] = true;
    object.raycast = () => undefined;
  }
}
