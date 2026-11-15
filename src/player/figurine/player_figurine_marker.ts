import * as THREE from 'three';
import {
  playerFigurineBuildMesh,
  playerFigurineBuildMeshAsync,
  playerFigurineCanBuildSync,
  playerFigurineDispose,
} from './player_figurine_builder.js';
import type { PlayerHelperLayer } from '@/player/player_helper_layer.js';

/**
 * Owns the world-space figurine marker mesh while a spawn is placed. The mesh
 * lives on the editor overlay layer, never in the level.
 */
export class PlayerFigurineMarker {
  private readonly layer: PlayerHelperLayer;
  private marker: THREE.Group | null;
  private pendingLoad: Promise<void> | null;
  private isDisposed: boolean;
  private readonly pendingFeet: THREE.Vector3;
  private pendingYawRadians: number;
  private hasPendingPose: boolean;

  /**
   * Creates a marker manager bound to an overlay layer.
   *
   * @param layer Overlay layer that receives the figurine, outside the level.
   */
  constructor(layer: PlayerHelperLayer) {
    this.layer = layer;
    this.marker = null;
    this.pendingLoad = null;
    this.isDisposed = false;
    this.pendingFeet = new THREE.Vector3();
    this.pendingYawRadians = 0;
    this.hasPendingPose = false;
  }

  /**
   * Shows or moves the figurine to a feet position and yaw.
   *
   * @param feetPosition World feet position.
   * @param yawRadians Facing yaw in radians.
   */
  showAt(feetPosition: THREE.Vector3, yawRadians: number): void {
    if (this.isDisposed) {
      return;
    }
    this.pendingFeet.copy(feetPosition);
    this.pendingYawRadians = yawRadians;
    this.hasPendingPose = true;
    if (this.marker) {
      this.applyPendingPoseToMarker();
      this.marker.visible = true;
      return;
    }
    if (playerFigurineCanBuildSync()) {
      this.createMarkerSync();
      return;
    }
    this.beginAsyncMarkerCreate();
  }

  /** Hides the figurine without clearing spawn state. */
  hide(): void {
    if (this.marker) {
      this.marker.visible = false;
    }
  }

  /** Shows the figurine again when it exists. */
  reveal(): void {
    if (this.marker) {
      this.marker.visible = true;
    }
  }

  /** Removes the figurine from the overlay layer and disposes resources. */
  clear(): void {
    if (!this.marker) {
      this.hasPendingPose = false;
      return;
    }
    this.layer.helperRemove(this.marker);
    playerFigurineDispose(this.marker);
    this.marker = null;
    this.hasPendingPose = false;
  }

  /**
   * Returns whether a marker instance currently exists.
   *
   * @returns True when a mesh is allocated.
   */
  hasMarker(): boolean {
    return this.marker !== null;
  }

  /** Disposes the marker if present. */
  dispose(): void {
    this.isDisposed = true;
    this.clear();
  }

  /** Creates the marker immediately when the model is already loaded. */
  private createMarkerSync(): void {
    this.marker = playerFigurineBuildMesh();
    this.layer.helperAdd(this.marker);
    this.applyPendingPoseToMarker();
    this.marker.visible = true;
  }

  /** Starts an async model load and marker create when needed. */
  private beginAsyncMarkerCreate(): void {
    if (this.pendingLoad) {
      return;
    }
    this.pendingLoad = playerFigurineBuildMeshAsync()
      .then((mesh) => {
        this.onAsyncMarkerReady(mesh);
      })
      .catch(() => {
        this.pendingLoad = null;
      });
  }

  /**
   * Attaches an async-built mesh when the marker is still needed.
   *
   * @param mesh Built figurine root.
   */
  private onAsyncMarkerReady(mesh: THREE.Group): void {
    this.pendingLoad = null;
    if (this.isDisposed || this.marker) {
      playerFigurineDispose(mesh);
      return;
    }
    this.marker = mesh;
    this.layer.helperAdd(this.marker);
    if (this.hasPendingPose) {
      this.applyPendingPoseToMarker();
      this.marker.visible = true;
    }
  }

  /** Writes the last requested feet pose onto the live marker. */
  private applyPendingPoseToMarker(): void {
    if (!this.marker || !this.hasPendingPose) {
      return;
    }
    this.marker.position.copy(this.pendingFeet);
    this.marker.rotation.set(0, this.pendingYawRadians, 0);
  }
}
