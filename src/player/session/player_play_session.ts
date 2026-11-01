import * as THREE from 'three';
import type { ManagerInput } from '@/input/manager_input.js';
import { audioViewportFocus } from '@/audio/spatial/audio_viewport_focus.js';
import { isPerspectiveViewport } from '@/viewports/core/viewport_editor.js';
import type { Viewport3D } from '@/viewports/core/viewport_3d.js';
import { PlayerBodyState } from '@/player/movement/player_body_state.js';
import { PlayerLookState } from '@/player/look/player_look_state.js';
import { PlayerCameraPoseApplier } from '@/player/camera/player_camera_pose.js';
import {
  playerCameraCapturePose,
  playerCameraRestorePose,
  type PlayerCameraPoseSnapshot,
} from '@/player/camera/player_camera_snapshot.js';
import { PlayerCollisionWorld } from '@/player/collision/player_collision_world.js';
import { playerViewModeToggle, type PlayerViewMode } from '@/player/player_mode.js';
import type { PlayerSpawnState } from '@/player/player_spawn_state.js';
import type { PlayerFigurineMarker } from '@/player/figurine/player_figurine_marker.js';
import { PlayerCharacterAvatar } from '@/player/character/player_character_avatar.js';
import { playerMovementResolveSimulationDeltaSeconds } from '@/player/movement/player_movement_input.js';
import { playerSpawnResolveFeetUnderCamera } from '@/player/spawn/player_spawn_ground.js';

/** Host callbacks required by the play session. */
export interface PlayerPlaySessionHost {
  inputManager: ManagerInput;
  worldRoot: THREE.Object3D;
  spawnState: PlayerSpawnState;
  figurineMarker: PlayerFigurineMarker;
  collisionWorld: PlayerCollisionWorld;
  getPerspectiveViewports: () => readonly Viewport3D[];
  showStatusMessage: (message: string) => void;
}

/** Play-mode pose shared with collaborators. */
export interface PlayerPresencePose {
  /** Feet position in world space. */
  feet: THREE.Vector3;
  /** Body facing yaw in radians around +Y. */
  yawRadians: number;
  /** Look (camera) yaw in radians around +Y. */
  lookYawRadians: number;
  /** Look (camera) pitch in radians, positive up. */
  pitchRadians: number;
  /** True while standing on the ground. */
  grounded: boolean;
  /** True while pushing against a wall. */
  wallPushing: boolean;
  /** True while running. */
  running: boolean;
  /** Camera driven by play mode. */
  camera: THREE.PerspectiveCamera | null;
}

/** Orchestrates enter/exit/update for first- and third-person play mode. */
export class PlayerPlaySession {
  private readonly host: PlayerPlaySessionHost;
  private readonly body: PlayerBodyState;
  private readonly look: PlayerLookState;
  private readonly cameraApplier: PlayerCameraPoseApplier;
  private readonly avatar: PlayerCharacterAvatar;
  private isActive: boolean;
  private viewMode: PlayerViewMode;
  private activeViewport: Viewport3D | null;
  private activeCamera: THREE.PerspectiveCamera | null;
  private cameraSnapshot: PlayerCameraPoseSnapshot | null;
  private lastFrameTimeMs: number;
  private readonly scratchSpawn: THREE.Vector3;
  private readonly presenceWallNormal: THREE.Vector3;

  /**
   * Creates a play session bound to a host.
   *
   * @param host Layout host dependencies.
   */
  constructor(host: PlayerPlaySessionHost) {
    this.host = host;
    this.body = new PlayerBodyState();
    this.look = new PlayerLookState();
    this.cameraApplier = new PlayerCameraPoseApplier();
    this.avatar = new PlayerCharacterAvatar(host.worldRoot);
    this.isActive = false;
    this.viewMode = 'first_person';
    this.activeViewport = null;
    this.activeCamera = null;
    this.cameraSnapshot = null;
    this.lastFrameTimeMs = 0;
    this.scratchSpawn = new THREE.Vector3();
    this.presenceWallNormal = new THREE.Vector3();
  }

  /**
   * Returns whether play mode is currently active.
   *
   * @returns True while playing.
   */
  getIsActive(): boolean {
    return this.isActive;
  }

  /**
   * Returns the viewport currently used for play mode.
   *
   * @returns Active viewport, or null.
   */
  getActiveViewport(): Viewport3D | null {
    return this.activeViewport;
  }

  /**
   * Returns the body pose shared with collaborators. While pushing a wall the
   * body faces it, so the hands land on it for the others too (in first person
   * the facing otherwise follows the look).
   *
   * @returns Pose, or null outside play mode.
   */
  getPresencePose(): PlayerPresencePose | null {
    if (!this.isActive) return null;
    const wallPushing = this.body.getIsWallPushing();
    const wall = wallPushing ? this.body.copyWallNormalTo(this.presenceWallNormal) : null;
    const facesWall = wall !== null && wall.x * wall.x + wall.z * wall.z > 1e-6;
    return {
      feet: this.body.getFeetPosition(),
      yawRadians: facesWall ? Math.atan2(-wall.x, -wall.z) : this.body.getFacingYawRadians(),
      lookYawRadians: this.look.getYawRadians(),
      pitchRadians: this.look.getPitchRadians(),
      grounded: this.body.getIsGrounded(),
      wallPushing,
      running: this.body.getWantsRun(),
      camera: this.activeCamera,
    };
  }

  /**
   * Attempts to enter play mode on the last interacted perspective viewport.
   *
   * @returns True when play mode started.
   */
  tryEnter(): boolean {
    if (this.isActive) {
      return false;
    }
    const viewport = this.resolvePlayViewport();
    if (!viewport) {
      this.host.showStatusMessage('Play mode needs a perspective viewport');
      return false;
    }
    const camera = viewport.getCamera();
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      return false;
    }
    this.activeViewport = viewport;
    this.activeCamera = camera;
    this.cameraSnapshot = playerCameraCapturePose(camera);
    audioViewportFocus.record(viewport);
    this.host.collisionWorld.setWorldRoot(this.host.worldRoot);
    this.prepareSpawn(camera);
    this.viewMode = 'first_person';
    this.lastFrameTimeMs = performance.now();
    this.isActive = true;
    viewport.setFlyingCameraEnabled(false);
    this.host.figurineMarker.hide();
    this.avatar.attach();
    this.host.showStatusMessage('Play mode — ESC exit, RMB third-person, Ctrl slow-mo');
    return true;
  }

  /** Exits play mode and restores the editor camera. */
  exit(): void {
    if (!this.isActive) {
      return;
    }
    if (this.activeCamera && this.cameraSnapshot) {
      playerCameraRestorePose(this.activeCamera, this.cameraSnapshot);
      this.activeViewport?.syncFlyingCameraOrientation();
    }
    this.activeViewport?.setFlyingCameraEnabled(true);
    this.avatar.detach();
    this.host.figurineMarker.reveal();
    this.isActive = false;
    this.activeViewport = null;
    this.activeCamera = null;
    this.cameraSnapshot = null;
    this.host.showStatusMessage('Exited play mode');
  }

  /** Disposes the third-person avatar resources. */
  dispose(): void {
    this.avatar.dispose();
  }

  /** Advances the player simulation and camera for one tool render tick. */
  updateFromRender(): void {
    if (!this.isActive || !this.activeCamera) {
      return;
    }
    const now = performance.now();
    const rawDeltaSeconds = Math.min(0.05, Math.max(0, (now - this.lastFrameTimeMs) / 1000));
    this.lastFrameTimeMs = now;
    const deltaSeconds = playerMovementResolveSimulationDeltaSeconds(
      rawDeltaSeconds,
      this.host.inputManager.isCtrlDown(),
    );
    this.body.update(
      this.host.inputManager,
      this.look,
      this.host.collisionWorld,
      deltaSeconds,
      this.viewMode === 'first_person',
    );
    this.avatar.update(this.body, this.viewMode, deltaSeconds);
    this.cameraApplier.apply(
      this.activeCamera,
      this.body.getFeetPosition(),
      this.look,
      this.viewMode,
      this.host.collisionWorld,
    );
  }

  /**
   * Applies pointer-lock mouse look deltas.
   *
   * @param movementX Pointer movement X.
   * @param movementY Pointer movement Y.
   */
  applyLookDelta(movementX: number, movementY: number): void {
    if (!this.isActive) {
      return;
    }
    this.look.applyMouseDelta(movementX, movementY);
  }

  /** Toggles first-person and third-person camera modes. */
  toggleViewMode(): void {
    if (!this.isActive) {
      return;
    }
    this.viewMode = playerViewModeToggle(this.viewMode);
    const label = this.viewMode === 'first_person' ? 'First-person' : 'Third-person';
    this.host.showStatusMessage(`${label} camera`);
  }

  /**
   * Applies mouse-wheel zoom while in third-person mode.
   *
   * @param wheelDeltaY Wheel delta Y.
   */
  applyWheel(wheelDeltaY: number): void {
    if (!this.isActive || this.viewMode !== 'third_person') {
      return;
    }
    this.cameraApplier.applyWheelZoom(wheelDeltaY);
  }

  /**
   * Resolves the perspective viewport that should own play mode.
   *
   * @returns Perspective viewport, or null.
   */
  private resolvePlayViewport(): Viewport3D | null {
    const last = audioViewportFocus.getLastViewport();
    if (last && isPerspectiveViewport(last)) {
      return last as Viewport3D;
    }
    const viewports = this.host.getPerspectiveViewports();
    return viewports[0] ?? null;
  }

  /**
   * Places the body at the figurine spawn or on ground under the current
   * camera.
   *
   * @param camera Active perspective camera.
   */
  private prepareSpawn(camera: THREE.PerspectiveCamera): void {
    const jumpHeld = this.host.inputManager.isKeyDown('Space');
    if (this.host.spawnState.copySpawnFeetPositionTo(this.scratchSpawn)) {
      const spawnYaw = this.host.spawnState.getSpawnYawRadians();
      this.body.resetAt(this.scratchSpawn, this.host.collisionWorld, jumpHeld, spawnYaw);
      this.look.setAngles(spawnYaw, 0);
      return;
    }
    playerSpawnResolveFeetUnderCamera(camera, this.host.collisionWorld, this.scratchSpawn);
    this.look.syncFromCamera(camera);
    this.body.resetAt(this.scratchSpawn, this.host.collisionWorld, jumpHeld, this.look.getYawRadians());
  }
}
