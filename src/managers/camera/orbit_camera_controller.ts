import * as THREE from 'three';
import type { MouseChordBinding } from '../../settings/settings_types.js';
import { blurActiveFormField } from '../../utils/dom_focus.js';

/** Minimum angular distance retained from either turntable pole. */
const ORBIT_POLE_MARGIN = 0.01;

/** Converts the persisted sensitivity scale into radians per pointer pixel. */
const ORBIT_SENSITIVITY_SCALE = 0.00004;

/** Settings consumed by the turntable orbit controller. */
export interface OrbitCameraPreferences {
  sensitivity: number;
  invertYAxis: boolean;
  binding: MouseChordBinding;
}

/** Blender-style world-up turntable orbit controller for a perspective camera. */
export class OrbitCameraController {
  private readonly canvas: HTMLElement;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly focus: THREE.Vector3;
  private preferences: OrbitCameraPreferences;
  private active = false;
  private pointerId: number | null = null;
  private disposed = false;
  private readonly pointerDownListener: (event: PointerEvent) => void;
  private readonly pointerMoveListener: (event: PointerEvent) => void;
  private readonly pointerUpListener: (event: PointerEvent) => void;
  private readonly keyUpListener: (event: KeyboardEvent) => void;
  private readonly blurListener: () => void;
  private readonly pointerLockChangeListener: () => void;

  /**
   * Creates an orbit controller.
   *
   * @param canvas Viewport pointer event target.
   * @param camera Perspective camera to rotate.
   * @param focus Shared navigation focus point.
   * @param preferences Initial orbit preferences.
   */
  constructor(
    canvas: HTMLElement,
    camera: THREE.PerspectiveCamera,
    focus: THREE.Vector3,
    preferences: OrbitCameraPreferences,
  ) {
    this.canvas = canvas;
    this.camera = camera;
    this.focus = focus;
    this.preferences = clonePreferences(preferences);
    this.pointerDownListener = (event) => this.onPointerDown(event);
    this.pointerMoveListener = (event) => this.onPointerMove(event);
    this.pointerUpListener = (event) => this.onPointerUp(event);
    this.keyUpListener = (event) => this.endWhenModifiersReleased(event);
    this.blurListener = () => this.endOrbit();
    this.pointerLockChangeListener = () => this.onPointerLockChange();
    this.addListeners();
  }

  /** Registers pointer, keyboard, focus, and pointer-lock listeners. */
  private addListeners(): void {
    this.canvas.addEventListener('pointerdown', this.pointerDownListener);
    this.canvas.addEventListener('pointermove', this.pointerMoveListener);
    this.canvas.addEventListener('pointerup', this.pointerUpListener);
    this.canvas.addEventListener('pointercancel', this.pointerUpListener);
    const ownerWindow = this.getOwnerWindow();
    ownerWindow.addEventListener('pointerup', this.pointerUpListener);
    ownerWindow.addEventListener('keyup', this.keyUpListener);
    ownerWindow.addEventListener('blur', this.blurListener);
    this.getOwnerDocument().addEventListener('pointerlockchange', this.pointerLockChangeListener);
  }

  /**
   * Applies live orbit preferences.
   *
   * @param preferences Updated sensitivity, inversion, and binding.
   */
  setPreferences(preferences: OrbitCameraPreferences): void {
    this.preferences = clonePreferences(preferences);
    if (this.active) this.endOrbit();
  }

  /**
   * Returns whether a pointer event exactly matches the configured chord.
   *
   * @param event Pointer event to inspect.
   * @returns True when button and modifiers match.
   */
  matchesBinding(event: MouseEvent): boolean {
    const binding = this.preferences.binding;
    return (
      event.button === binding.button &&
      event.ctrlKey === binding.ctrl &&
      event.shiftKey === binding.shift &&
      event.altKey === binding.alt &&
      event.metaKey === binding.meta
    );
  }

  /**
   * Starts orbit for a matching pointer chord.
   *
   * @param event Pointer-down event.
   */
  private onPointerDown(event: PointerEvent): void {
    if (!this.matchesBinding(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    blurActiveFormField();
    this.active = true;
    this.pointerId = event.pointerId;
    this.capturePointer(event.pointerId);
    this.requestPointerLock();
  }

  /**
   * Applies turntable rotation while orbit is active.
   *
   * @param event Pointer movement event.
   */
  private onPointerMove(event: PointerEvent): void {
    if (!this.active) return;
    if (!this.matchesModifiers(event)) {
      this.endOrbit();
      return;
    }
    const sensitivity = this.preferences.sensitivity * ORBIT_SENSITIVITY_SCALE;
    const verticalSign = this.preferences.invertYAxis ? -1 : 1;
    orbitCameraAroundFocus(
      this.camera,
      this.focus,
      -event.movementX * sensitivity,
      -event.movementY * sensitivity * verticalSign,
    );
  }

  /**
   * Ends orbit when its configured button is released.
   *
   * @param event Pointer release or cancellation event.
   */
  private onPointerUp(event: PointerEvent): void {
    if (!this.active || event.button !== this.preferences.binding.button) return;
    this.endOrbit();
  }

  /** Ends orbit after a required modifier is released. */
  private endWhenModifiersReleased(event: KeyboardEvent): void {
    if (this.active && !this.matchesModifiers(event)) this.endOrbit();
  }

  /**
   * Tests current modifier state against the configured chord.
   *
   * @returns True when all modifiers still match exactly.
   */
  private matchesModifiers(event: MouseEvent | KeyboardEvent): boolean {
    const binding = this.preferences.binding;
    return (
      event.ctrlKey === binding.ctrl &&
      event.shiftKey === binding.shift &&
      event.altKey === binding.alt &&
      event.metaKey === binding.meta
    );
  }

  /** Ends the active gesture and releases pointer navigation resources. */
  private endOrbit(): void {
    if (!this.active) return;
    this.active = false;
    this.releasePointer();
    this.pointerId = null;
    if (this.getOwnerDocument().pointerLockElement === this.canvas) this.getOwnerDocument().exitPointerLock?.();
  }

  /** Clears the gesture if pointer lock is lost. */
  private onPointerLockChange(): void {
    if (this.active && this.getOwnerDocument().pointerLockElement !== this.canvas) this.endOrbit();
  }

  /**
   * Returns whether turntable orbit currently owns navigation.
   *
   * @returns True during an orbit drag.
   */
  isNavigating(): boolean {
    return this.active;
  }

  /**
   * Replaces the shared orbit focus.
   *
   * @param focus New world-space focus point.
   */
  setFocus(focus: THREE.Vector3): void {
    this.focus.copy(focus);
  }

  /** Removes listeners and ends active navigation. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.endOrbit();
    this.canvas.removeEventListener('pointerdown', this.pointerDownListener);
    this.canvas.removeEventListener('pointermove', this.pointerMoveListener);
    this.canvas.removeEventListener('pointerup', this.pointerUpListener);
    this.canvas.removeEventListener('pointercancel', this.pointerUpListener);
    const ownerWindow = this.getOwnerWindow();
    ownerWindow.removeEventListener('pointerup', this.pointerUpListener);
    ownerWindow.removeEventListener('keyup', this.keyUpListener);
    ownerWindow.removeEventListener('blur', this.blurListener);
    this.getOwnerDocument().removeEventListener('pointerlockchange', this.pointerLockChangeListener);
  }

  /** Requests pointer capture when supported. */
  private capturePointer(pointerId: number): void {
    try {
      this.canvas.setPointerCapture?.(pointerId);
    } catch {
      return;
    }
  }

  /** Releases pointer capture when supported. */
  private releasePointer(): void {
    if (this.pointerId === null) return;
    try {
      this.canvas.releasePointerCapture?.(this.pointerId);
    } catch {
      return;
    }
  }

  /** Requests pointer lock when supported. */
  private requestPointerLock(): void {
    this.canvas.requestPointerLock?.();
  }

  /**
   * Returns the canvas owner document.
   *
   * @returns Owning document.
   */
  private getOwnerDocument(): Document {
    return this.canvas.ownerDocument ?? document;
  }

  /**
   * Returns the canvas owner window.
   *
   * @returns Owning window.
   */
  private getOwnerWindow(): Window {
    return this.getOwnerDocument().defaultView ?? window;
  }
}

/**
 * Applies one world-up turntable orbit step.
 *
 * @param camera Camera to reposition and orient.
 * @param focus Stable world-space orbit center.
 * @param yawDelta Horizontal rotation in radians.
 * @param pitchDelta Vertical rotation in radians.
 */
export function orbitCameraAroundFocus(
  camera: THREE.PerspectiveCamera,
  focus: THREE.Vector3,
  yawDelta: number,
  pitchDelta: number,
): void {
  const offset = camera.position.clone().sub(focus);
  const radius = Math.max(offset.length(), Number.EPSILON);
  const yaw = Math.atan2(offset.x, offset.z) + yawDelta;
  const pitch = THREE.MathUtils.clamp(
    Math.asin(offset.y / radius) + pitchDelta,
    -Math.PI / 2 + ORBIT_POLE_MARGIN,
    Math.PI / 2 - ORBIT_POLE_MARGIN,
  );
  const horizontalRadius = radius * Math.cos(pitch);
  camera.position.set(
    focus.x + horizontalRadius * Math.sin(yaw),
    focus.y + radius * Math.sin(pitch),
    focus.z + horizontalRadius * Math.cos(yaw),
  );
  camera.lookAt(focus);
}

/**
 * Clones orbit preferences so persisted settings cannot mutate controller
 * state.
 *
 * @param preferences Preferences to clone.
 * @returns Independent preference object.
 */
function clonePreferences(preferences: OrbitCameraPreferences): OrbitCameraPreferences {
  return { ...preferences, binding: { ...preferences.binding } };
}
