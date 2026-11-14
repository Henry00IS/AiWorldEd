import * as THREE from 'three';
import { PHYSICS_TOY_SHAPES, type PhysicsToyKind } from '@/physics/ball/physics_ball_constants.js';
import { PLAYER_TOY_LABELS, playerToyGeometry, playerToyMaterials } from '@/player/toy/player_toy_models.js';
import { PLAYER_BALL_USERDATA_KEY } from './player_ball_constants.js';

/** Where the view puts its meshes (the editor helpers, never the world). */
export interface PlayerBallViewHost {
  /**
   * Shows a helper object.
   *
   * @param object Object to show.
   */
  helperAdd(object: THREE.Object3D): void;
  /**
   * Removes a helper object.
   *
   * @param object Object to remove.
   */
  helperRemove(object: THREE.Object3D): void;
}

/** One toy to draw. */
export interface PlayerBallViewItem {
  readonly key: string;
  readonly color: number;
  readonly position: THREE.Vector3;
  /** Toy kind (a tennis ball when absent). */
  readonly kind?: PhysicsToyKind;
  /** Orientation of a paper plane. */
  readonly quaternion?: THREE.Quaternion | undefined;
}

const scratchMove = new THREE.Vector3();
const scratchAxis = new THREE.Vector3();
const scratchSpin = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Toy meshes as editor helpers: tinted in the member's color, ignored by
 * picking (empty raycast), flagged as helpers for every scene consumer, and
 * never part of the world, so they are not saved, snapshotted or undone. Balls
 * spin as they roll (drawing only); planes take their orientation.
 */
export class PlayerBallView {
  private readonly host: PlayerBallViewHost;
  private readonly materials: Map<string, THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[]>;
  private readonly meshes: Map<string, THREE.Mesh>;
  private readonly kinds: Map<string, PhysicsToyKind>;

  /**
   * Creates an empty view.
   *
   * @param host Helper root access.
   */
  constructor(host: PlayerBallViewHost) {
    this.host = host;
    this.materials = new Map();
    this.meshes = new Map();
    this.kinds = new Map();
  }

  /**
   * Shows exactly the given balls.
   *
   * @param items Balls to draw.
   */
  sync(items: readonly PlayerBallViewItem[]): void {
    const keys = new Set(items.map((item) => item.key));
    [...this.meshes.keys()].filter((key) => !keys.has(key)).forEach((key) => this.remove(key));
    items.forEach((item) => {
      const kind = item.kind ?? 'tennis';
      if (this.kinds.get(item.key) !== kind) this.remove(item.key);
      const existing = this.meshes.get(item.key);
      const mesh = existing ?? this.create(item.key, item.color, kind);
      if (kind === 'plane') mesh.quaternion.copy(item.quaternion ?? mesh.quaternion);
      else if (existing) playerBallViewRoll(mesh, item.position, PHYSICS_TOY_SHAPES[kind].radius);
      mesh.position.copy(item.position);
    });
  }

  /**
   * Returns the shown meshes.
   *
   * @returns Meshes keyed by ball key.
   */
  getMeshes(): ReadonlyMap<string, THREE.Mesh> {
    return this.meshes;
  }

  /** Removes every mesh and frees the shared resources. */
  dispose(): void {
    this.sync([]);
    this.materials.forEach((material) => [material].flat().forEach((each) => each.dispose()));
    this.materials.clear();
  }

  /**
   * Creates and shows one mesh.
   *
   * @param key Ball key.
   * @param color Member color.
   * @param kind Toy kind.
   * @returns New mesh.
   */
  private create(key: string, color: number, kind: PhysicsToyKind): THREE.Mesh {
    const mesh = new THREE.Mesh(playerToyGeometry(kind), this.materialFor(kind, color));
    mesh.name = PLAYER_TOY_LABELS[kind];
    this.kinds.set(key, kind);
    mesh.userData[PLAYER_BALL_USERDATA_KEY] = true;
    mesh.raycast = () => undefined;
    this.meshes.set(key, mesh);
    this.host.helperAdd(mesh);
    return mesh;
  }

  /**
   * Hides one mesh.
   *
   * @param key Ball key.
   */
  private remove(key: string): void {
    const mesh = this.meshes.get(key);
    if (!mesh) {
      return;
    }
    this.host.helperRemove(mesh);
    this.meshes.delete(key);
    this.kinds.delete(key);
  }

  /**
   * Returns the shared materials of a kind in a color.
   *
   * @param kind Toy kind.
   * @param color Hex color.
   * @returns Material or materials.
   */
  private materialFor(kind: PhysicsToyKind, color: number): THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[] {
    const key = `${kind}:${color}`;
    const material = this.materials.get(key) ?? playerToyMaterials(kind, color);
    this.materials.set(key, material);
    return material;
  }
}

/**
 * Turns a ball mesh as if it rolled from its drawn position to the next one
 * (about the horizontal axis across the motion, by distance over radius).
 *
 * @param mesh Ball mesh at its previous position.
 * @param next Next position.
 * @param radius Ball radius.
 */
function playerBallViewRoll(mesh: THREE.Mesh, next: THREE.Vector3, radius: number): void {
  scratchMove.subVectors(next, mesh.position).setY(0);
  const distance = scratchMove.length();
  if (distance < 1e-5 || distance > 1) return;
  scratchAxis.crossVectors(UP, scratchMove).divideScalar(distance);
  mesh.quaternion.premultiply(scratchSpin.setFromAxisAngle(scratchAxis, distance / radius));
}
