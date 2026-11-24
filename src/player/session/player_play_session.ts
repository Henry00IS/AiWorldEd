import type { PlayerBallMotion } from '@/player/ball/player_ball_players.js';
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
import type { PlayerHelperLayer } from '@/player/player_helper_layer.js';
import { playerSpawnResolveFeetUnderCamera } from '@/player/spawn/player_spawn_ground.js';
import type { PlayerBallSystem } from '@/player/ball/player_ball_system.js';
import { playerEyePositionFromFeet } from '@/player/collision/player_capsule_collider.js';
import type { PhysicsToyKind } from '@/physics/ball/physics_ball_constants.js';
import { PlayerToyViewModel } from '@/player/toy/player_toy_viewmodel.js';
import { PlayerBallCarry } from '@/player/ball/player_ball_carry.js';
import { playerToyCharge, playerToyChargePower } from '@/player/toy/player_toy_viewmodel_pose.js';
import { PlayerToyPicker, playerToyPickerStep } from '@/player/ui/player_toy_picker.js';
import { PLAYER_KEYBOARD_INSTRUMENTS } from '@/player/keyboard/player_keyboard_instruments.js';
import { playerPlayHint } from '@/player/session/player_play_hint.js';
import { PlayerKeyboardPlay } from '@/player/keyboard/player_keyboard_play.js';
import { PLAYER_TOY_GRAPPLE, PLAYER_TOY_KEYBOARD, type PlayerToyKind } from '@/player/toy/player_toy_kind.js';
import { PlayerGrapple, playerGrappleHand } from '@/player/grapple/player_grapple.js';
import { PlayerGrappleCrosshair } from '@/player/grapple/player_grapple_crosshair.js';

/** Wheel travel that moves the toy picker by one slot (one mouse notch). */
const PLAYER_PLAY_WHEEL_STEP = 100;

/** Host callbacks required by the play session. */
export interface PlayerPlaySessionHost {
  inputManager: ManagerInput;
  worldRoot: THREE.Object3D;
  /** Overlay layer for the play-mode character, outside the level. */
  helperLayer: PlayerHelperLayer;
  spawnState: PlayerSpawnState;
  figurineMarker: PlayerFigurineMarker;
  collisionWorld: PlayerCollisionWorld;
  ballSystem: PlayerBallSystem;
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
  private readonly body = new PlayerBodyState();
  private readonly look: PlayerLookState;
  private readonly cameraApplier: PlayerCameraPoseApplier;
  private readonly avatar: PlayerCharacterAvatar;
  private viewModel: PlayerToyViewModel | null;
  private pressedAt: number | null;
  private readonly carry: PlayerBallCarry;
  private readonly carried: THREE.Vector3;
  private picker: PlayerToyPicker | null;
  private selected: PlayerToyKind | null = null;
  private hint: string | null = null;
  private readonly keyboard: PlayerKeyboardPlay;
  private readonly grapple: PlayerGrapple;
  private crosshair: PlayerGrappleCrosshair | null = null;
  private readonly scratchHand = new THREE.Vector3();
  private wheelTravel: number;
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
    this.look = new PlayerLookState();
    this.cameraApplier = new PlayerCameraPoseApplier();
    this.avatar = new PlayerCharacterAvatar(host.helperLayer);
    this.keyboard = new PlayerKeyboardPlay(host.ballSystem, this.body);
    this.grapple = new PlayerGrapple(host.collisionWorld, this.look, host.helperLayer, (anchor, missEnd) =>
      missEnd ? host.ballSystem.grappleMiss(missEnd) : host.ballSystem.setGrapple(anchor),
    );
    this.body.setPull(this.grapple);
    this.viewModel = null;
    this.pressedAt = null;
    this.carry = new PlayerBallCarry();
    this.carried = new THREE.Vector3();
    this.picker = null;
    this.wheelTravel = 0;
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
   * Returns where the body stands and how fast it moves (for the balls).
   *
   * @returns Feet and velocity, or null outside play mode.
   */
  getBodyMotion(): PlayerBallMotion | null {
    if (!this.isActive) return null;
    return { feet: this.body.getFeetPosition().clone(), velocity: this.bodyVelocity() };
  }

  /**
   * Returns the body velocity.
   *
   * @returns Velocity in meters per second.
   */
  private bodyVelocity(): THREE.Vector3 {
    return this.body.copyHorizontalVelocityTo(new THREE.Vector3()).setY(this.body.getVerticalVelocity());
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
   * Tints the local third-person character toward the member's room color, or
   * restores the default colors outside a room.
   *
   * @param color Member color, or null when not in a room.
   */
  setRoomColor(color: number | null): void {
    this.avatar.setRoomColor(color);
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
    this.host.collisionWorld.activate();
    this.prepareSpawn(camera);
    this.viewMode = 'first_person';
    this.lastFrameTimeMs = performance.now();
    this.isActive = true;
    viewport.setFlyingCameraEnabled(false);
    this.host.figurineMarker.hide();
    this.avatar.attach();
    this.showToys(viewport);
    this.hint = null;
    this.hintUpdate();
    return true;
  }

  /**
   * Shows the toy picker and the grapple crosshair over the play viewport and
   * the hand in front of the camera, starting with empty hands, and tells the
   * others.
   *
   * @param viewport Play viewport.
   */
  private showToys(viewport: Viewport3D): void {
    this.host.ballSystem.setHeld(null);
    this.host.ballSystem.setGrappling(false);
    this.selected = null;
    const element = viewport.getContentElement();
    this.picker = new PlayerToyPicker(element.ownerDocument, null);
    this.picker.mount(element);
    this.crosshair = new PlayerGrappleCrosshair(element.ownerDocument);
    this.crosshair.mount(element);
    const view = (this.viewModel ??= new PlayerToyViewModel(this.host.ballSystem.getRoomColor()));
    view.setItem(null, this.host.ballSystem.getOwnColor());
    viewport.setOverlayRender((renderer, aspect) => view.render(renderer, aspect));
    this.host.ballSystem.announceHeld();
  }

  /** Hides the toy picker, the crosshair and the hand. */
  private hideToys(): void {
    this.grapple.reset(this.activeCamera);
    this.viewModel?.reset();
    this.pressedAt = null;
    this.carry.reset();
    this.picker?.unmount();
    this.picker = null;
    this.crosshair?.unmount();
    this.crosshair = null;
    this.activeViewport?.setOverlayRender(null);
  }

  /**
   * Picks the toy to throw (or the keyboard to put down, or the grapple beam to
   * fire); a placed keyboard is put away and a hooked beam lets go when another
   * toy is picked.
   *
   * @param kind Toy kind, or null for empty hands.
   */
  selectToy(kind: PlayerToyKind | null): void {
    if (!this.isActive) return;
    if (kind !== PLAYER_TOY_KEYBOARD) this.keyboard.putAway();
    if (kind !== PLAYER_TOY_GRAPPLE) this.grapple.release(performance.now() / 1000);
    this.selected = kind;
    this.host.ballSystem.setHeld(kind === PLAYER_TOY_KEYBOARD || kind === PLAYER_TOY_GRAPPLE ? null : kind);
    this.host.ballSystem.setGrappling(kind === PLAYER_TOY_GRAPPLE);
    this.picker?.select(kind);
  }

  /**
   * Returns the picked toy.
   *
   * @returns Toy kind, or null for empty hands.
   */
  getSelectedToy(): PlayerToyKind | null {
    return this.selected;
  }

  /**
   * Switches the placed keyboard's instrument and names it in the hint.
   *
   * @param step +1 or -1.
   */
  stepKeyboardInstrument(step: number): void {
    if (this.keyboard.instrumentStep(step) !== null) this.hintUpdate();
  }

  /**
   * Shifts the placed keyboard an octave up or down and shows it in the hint.
   *
   * @param step +1 or -1.
   */
  stepKeyboardOctave(step: number): void {
    if (this.keyboard.octaveStep(step)) this.hintUpdate();
  }

  /**
   * Returns the keyboard the player plays.
   *
   * @returns Keyboard controller.
   */
  getKeyboard(): PlayerKeyboardPlay {
    return this.keyboard;
  }

  /**
   * Returns the toy picker shown in play mode.
   *
   * @returns Picker, or null.
   */
  getToyPicker(): PlayerToyPicker | null {
    return this.picker;
  }

  /**
   * Returns the first-person hand.
   *
   * @returns View model, or null before play mode was entered.
   */
  getToyViewModel(): PlayerToyViewModel | null {
    return this.viewModel;
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
    this.keyboard.putAway();
    this.hideToys();
    this.avatar.detach();
    this.host.figurineMarker.reveal();
    this.host.collisionWorld.release();
    this.isActive = false;
    this.activeViewport = null;
    this.activeCamera = null;
    this.cameraSnapshot = null;
    this.host.showStatusMessage('Exited play mode');
  }

  /** Disposes the third-person avatar resources. */
  dispose(): void {
    this.hideToys();
    this.viewModel?.dispose();
    this.viewModel = null;
    this.grapple.dispose();
    this.avatar.dispose();
  }

  /** Advances the player simulation and camera for one tool render tick. */
  updateFromRender(): void {
    if (!this.isActive || !this.activeCamera) {
      return;
    }
    const now = performance.now();
    const deltaSeconds = Math.min(0.05, Math.max(0, (now - this.lastFrameTimeMs) / 1000));
    this.lastFrameTimeMs = now;
    this.host.collisionWorld.setFocus('player', [this.body.getFeetPosition()]);
    this.bodyUpdate(deltaSeconds);
    this.carry.record(this.body.copyHorizontalVelocityTo(new THREE.Vector3()), now / 1000);
    const gun = this.selected === PLAYER_TOY_GRAPPLE;
    this.avatar.setHeld(gun ? PLAYER_TOY_GRAPPLE : this.host.ballSystem.getHeld(), this.host.ballSystem.getOwnColor());
    this.avatar.setHandTargets(this.keyboard.getHands());
    this.avatar.setReach(this.grapple.getAnchor());
    this.avatar.update(this.body, this.viewMode, deltaSeconds);
    this.cameraApplier.apply(
      this.activeCamera,
      this.body.getFeetPosition(),
      this.look,
      this.viewMode,
      this.host.collisionWorld,
      deltaSeconds,
      this.selected === PLAYER_TOY_GRAPPLE,
    );
    this.viewModelUpdate(this.activeCamera, now, deltaSeconds);
    this.grappleUpdate(this.activeCamera, deltaSeconds);
  }

  /**
   * Draws the beam from the hand, and the crosshair while the beam is picked
   * (lit when something is in reach).
   *
   * @param camera Play camera.
   * @param deltaSeconds Frame time.
   */
  private grappleUpdate(camera: THREE.PerspectiveCamera, deltaSeconds: number): void {
    let hand: THREE.Vector3 | null = this.viewModel?.getMuzzleWorld(camera, this.scratchHand) ?? null;
    if (this.viewMode === 'third_person') {
      hand = this.scratchHand;
      if (!this.avatar.copyMuzzleTo(hand) && !this.avatar.copyRightHandTo(hand))
        playerGrappleHand(this.body.getFeetPosition(), this.body.getFacingYawRadians(), hand);
    }
    this.grapple.update(camera, hand, this.bodyVelocity().length(), deltaSeconds);
    const picked = this.selected === PLAYER_TOY_GRAPPLE;
    this.crosshair?.set(picked, picked && this.grapple.aims(...this.viewRay(camera)));
  }

  /**
   * Returns the ray through the middle of the view.
   *
   * @param camera Play camera.
   * @returns Origin and unit direction.
   */
  private viewRay(camera: THREE.PerspectiveCamera): [THREE.Vector3, THREE.Vector3] {
    return [camera.getWorldPosition(new THREE.Vector3()), camera.getWorldDirection(new THREE.Vector3())];
  }

  /**
   * Plays the held keyboard keys (the body stays on its spot while the keyboard
   * is placed), then moves the body.
   *
   * @param deltaSeconds Simulation step in seconds.
   */
  private bodyUpdate(deltaSeconds: number): void {
    const firstPerson = this.viewMode === 'first_person';
    this.keyboard.update(this.host.inputManager, this.look, firstPerson);
    this.hintUpdate();
    this.body.update(this.host.inputManager, this.look, this.host.collisionWorld, deltaSeconds, firstPerson);
  }

  /**
   * Shows the first-person hand with the held toy in first person only (none
   * with empty hands), tinted like the character the others see, and moves it
   * with the camera.
   *
   * @param camera Play camera.
   * @param now Current time in milliseconds.
   * @param deltaSeconds Real frame time in seconds.
   */
  private viewModelUpdate(camera: THREE.PerspectiveCamera, now: number, deltaSeconds: number): void {
    if (!this.viewModel) return;
    const held = this.host.ballSystem.getHeld();
    const gun = this.selected === PLAYER_TOY_GRAPPLE;
    this.viewModel.root.visible = this.viewMode === 'first_person' && (held !== null || gun);
    this.viewModel.setGun(gun ? this.host.ballSystem.getOwnColor() : null);
    this.viewModel.setItem(held, this.host.ballSystem.getOwnColor());
    this.viewModel.setTint(this.host.ballSystem.getRoomColor());
    this.viewModel.update(now / 1000, deltaSeconds, this.body.getPlanarSpeed(), this.body.getIsGrounded());
    const released = this.viewModel.takeRelease(now / 1000);
    const hand = released ? this.viewModel.getHandWorld(camera, new THREE.Vector3()) : undefined;
    if (released) this.throwToy(released, hand, this.viewModel.getPower());
  }

  /**
   * Starts a throw of the held toy on the button going down (a soccer ball is
   * put down at once): in first person the arm winds back and keeps drawing
   * back while the button is held, in third person the hold is timed. With the
   * keyboard picked, a click puts it down or away; with the grapple beam picked
   * it fires the beam.
   */
  pressToy(): void {
    if (this.isActive && this.selected === PLAYER_TOY_KEYBOARD) return this.keyboard.toggle(this.look);
    if (this.isActive && this.selected === PLAYER_TOY_GRAPPLE && this.activeCamera) {
      const [origin, forward] = this.viewRay(this.activeCamera);
      this.grapple.press(origin, forward, performance.now() / 1000);
      return;
    }
    const kind = this.host.ballSystem.getHeld();
    if (!this.isActive || kind === null) return;
    const now = performance.now() / 1000;
    this.carry.at(now, this.carried);
    if (this.viewMode === 'first_person' && this.viewModel) this.viewModel.act(now, kind);
    else if (kind === 'soccer') this.throwToy(kind);
    else this.pressedAt = now;
  }

  /**
   * Throws on the button coming up, harder the longer it was held: in first
   * person the arm swings forward and the toy leaves the hand at the release,
   * in third person it goes at once from in front of the eye. A hooked grapple
   * beam lets go.
   */
  releaseToy(): void {
    if (!this.isActive) return;
    const now = performance.now() / 1000;
    this.grapple.release(now);
    this.carry.at(now, this.carried);
    this.viewModel?.letGo(now);
    if (this.pressedAt === null) return;
    const power = playerToyChargePower(playerToyCharge(now - this.pressedAt));
    this.pressedAt = null;
    const kind = this.host.ballSystem.getHeld();
    if (kind) this.throwToy(kind, undefined, power);
  }

  /**
   * Throws a toy from the eye along the look direction, carrying the fastest
   * recent run when the button last went down or up, and the current climb or
   * fall.
   *
   * @param kind Toy kind.
   * @param from Where it leaves the hand, if shown (kept out of walls).
   * @param power Throw speed factor.
   */
  private throwToy(kind: PhysicsToyKind, from?: THREE.Vector3, power = 1): void {
    const eye = playerEyePositionFromFeet(this.body.getFeetPosition(), new THREE.Vector3());
    const forward = this.look.copyLookForwardTo(new THREE.Vector3());
    const carried = this.carried.clone();
    carried.y = this.body.getVerticalVelocity();
    this.host.ballSystem.throwFrom(eye, forward, kind, from, power, carried);
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
    this.hintUpdate();
  }

  /** Shows the controls hint whenever the view or the keyboard changes. */
  private hintUpdate(): void {
    const instrument = PLAYER_KEYBOARD_INSTRUMENTS[this.keyboard.instrument()]?.label ?? null;
    const hint = playerPlayHint(
      this.viewMode,
      this.keyboard.isPlaced() ? instrument : null,
      this.keyboard.octave(),
      this.selected === PLAYER_TOY_GRAPPLE,
    );
    if (hint === this.hint) return;
    this.hint = hint;
    this.host.showStatusMessage(hint);
  }

  /**
   * Applies the mouse wheel: in third person it zooms the camera, in first
   * person it steps through the toys (the number keys pick them in both).
   *
   * @param wheelDeltaY Wheel delta Y.
   */
  applyWheel(wheelDeltaY: number): void {
    if (!this.isActive) {
      return;
    }
    if (this.viewMode === 'third_person') {
      this.cameraApplier.applyWheelZoom(wheelDeltaY);
      return;
    }
    if (Math.sign(wheelDeltaY) !== Math.sign(this.wheelTravel)) this.wheelTravel = 0;
    this.wheelTravel += wheelDeltaY;
    if (Math.abs(this.wheelTravel) < PLAYER_PLAY_WHEEL_STEP && Math.abs(wheelDeltaY) < PLAYER_PLAY_WHEEL_STEP / 2)
      return;
    this.wheelTravel = 0;
    this.selectToy(playerToyPickerStep(this.selected, wheelDeltaY));
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
