import * as THREE from 'three';
import { PHYSICS_BALL_RADIUS_METERS } from '@/physics/ball/physics_ball_constants.js';
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

/** One ball to draw. */
export interface PlayerBallViewItem {
  readonly key: string;
  readonly color: number;
  readonly position: THREE.Vector3;
}

/**
 * Ball meshes as editor helpers: tinted in the member's color, ignored by
 * picking (empty raycast), flagged as helpers for every scene consumer, and
 * never part of the world, so they are not saved, snapshotted or undone.
 */
export class PlayerBallView {
  private readonly host: PlayerBallViewHost;
  private readonly geometry: THREE.SphereGeometry;
  private readonly materials: Map<number, THREE.MeshStandardMaterial>;
  private readonly meshes: Map<string, THREE.Mesh>;

  /**
   * Creates an empty view.
   *
   * @param host Helper root access.
   */
  constructor(host: PlayerBallViewHost) {
    this.host = host;
    this.geometry = new THREE.SphereGeometry(PHYSICS_BALL_RADIUS_METERS, 16, 12);
    this.materials = new Map();
    this.meshes = new Map();
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
      const mesh = this.meshes.get(item.key) ?? this.create(item.key, item.color);
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
    this.geometry.dispose();
    this.materials.forEach((material) => material.dispose());
    this.materials.clear();
  }

  /**
   * Creates and shows one mesh.
   *
   * @param key Ball key.
   * @param color Member color.
   * @returns New mesh.
   */
  private create(key: string, color: number): THREE.Mesh {
    const mesh = new THREE.Mesh(this.geometry, this.materialFor(color));
    mesh.name = 'Tennis ball';
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
  }

  /**
   * Returns the shared material of a color.
   *
   * @param color Hex color.
   * @returns Material.
   */
  private materialFor(color: number): THREE.MeshStandardMaterial {
    const material = this.materials.get(color) ?? new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
    this.materials.set(color, material);
    return material;
  }
}
