import * as THREE from 'three';
import { InputManager } from './input_manager.js';
import { blurActiveFormField } from '../utils/dom_focus.js';

/**
 * First-person flying camera for the 3D viewport.
 * Look and WASD/QE movement only apply while the right mouse button is held
 * (or middle mouse for pan). This prevents camera drift and tool-key conflicts.
 */
export class FlyingCamera {
  private canvas: HTMLElement;
  private camera: THREE.PerspectiveCamera;
  private inputManager: InputManager;
  private isRotating: boolean;
  private isPanning: boolean;
  private isPointerLocked: boolean;
  private activeButtons: Set<number>;
  private yaw: number;
  private pitch: number;
  private moveSpeed: number;
  private mouseSensitivity: number;
  private panTarget: THREE.Vector3;
  private panDistance: number;

  /**
   * Creates a flying camera controller for a canvas and perspective camera.
   * @param canvas The DOM element that receives pointer events.
   * @param camera The perspective camera to drive.
   * @param inputManager Shared input state for keyboard queries.
   * @param initialYaw Starting yaw angle in radians.
   * @param initialPitch Starting pitch angle in radians.
   */
  constructor(
    canvas: HTMLElement,
    camera: THREE.PerspectiveCamera,
    inputManager: InputManager,
    initialYaw: number,
    initialPitch: number
  ) {
    this.canvas = canvas;
    this.camera = camera;
    this.inputManager = inputManager;
    this.isRotating = false;
    this.isPanning = false;
    this.isPointerLocked = false;
    this.activeButtons = new Set();
    this.yaw = initialYaw;
    this.pitch = initialPitch;
    this.moveSpeed = 10;
    this.mouseSensitivity = 0.002;
    this.panTarget = new THREE.Vector3();
    this.panDistance = 1;
    this.setupEventListeners();
  }

  /**
   * Wires pointer, wheel, and pointer-lock listeners on the canvas.
   */
  private setupEventListeners(): void {
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    this.canvas.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    this.canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
    this.canvas.addEventListener('pointerup', (event) => this.onPointerUp(event));
    this.canvas.addEventListener('pointercancel', (event) => this.onPointerUp(event));
    this.canvas.addEventListener('wheel', (event) => this.onWheel(event));
    document.addEventListener('pointerlockchange', () => this.onPointerLockChange());
    document.addEventListener('pointerlockerror', () => this.onPointerLockError());
  }

  /**
   * Starts rotate (RMB) or pan (MMB) navigation and requests pointer lock.
   * @param event The pointer down event.
   */
  private onPointerDown(event: PointerEvent): void {
    event.preventDefault();
    if (event.button === 1) {
      blurActiveFormField();
      this.beginPan();
      this.activeButtons.add(event.button);
      this.ensurePointerLock();
    }
    if (event.button === 2) {
      blurActiveFormField();
      this.syncOrientationFromCamera();
      this.isRotating = true;
      this.activeButtons.add(event.button);
      this.ensurePointerLock();
    }
  }

  /**
   * Begins middle-mouse pan by capturing the look target distance.
   */
  private beginPan(): void {
    this.syncOrientationFromCamera();
    this.isPanning = true;
    this.panTarget.copy(this.camera.position).add(this.getForward());
    this.panDistance = this.camera.position.distanceTo(this.panTarget);
  }

  /**
   * Updates yaw and pitch from the camera's current world look direction.
   * Call after external camera moves such as fit-to-selection.
   */
  syncOrientationFromCamera(): void {
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    this.yaw = Math.atan2(forward.x, forward.z);
    this.pitch = Math.asin(THREE.MathUtils.clamp(forward.y, -1, 1));
  }

  /**
   * Requests pointer lock when not already locked.
   */
  private ensurePointerLock(): void {
    if (!this.isPointerLocked) {
      this.tryRequestPointerLock();
    }
  }

  /**
   * Applies rotation or pan from pointer movement while navigating.
   * @param event The pointer move event.
   */
  private onPointerMove(event: PointerEvent): void {
    if (this.isRotating) {
      this.handleRotation(event.movementX, event.movementY);
    }
    if (this.isPanning) {
      this.handlePan(event.movementX, event.movementY);
    }
  }

  /**
   * Ends rotate or pan when a mouse button is released.
   * @param event The pointer up or cancel event.
   */
  private onPointerUp(event: PointerEvent): void {
    if (event.button === 1) {
      this.isPanning = false;
      this.activeButtons.delete(event.button);
    }
    if (event.button === 2) {
      this.isRotating = false;
      this.activeButtons.delete(event.button);
    }
    if (this.activeButtons.size === 0 && this.isPointerLocked) {
      this.tryExitPointerLock();
    }
  }

  /**
   * Zooms the camera along its look direction.
   * @param event The wheel event.
   */
  private onWheel(event: WheelEvent): void {
    event.preventDefault();
    const forward = this.getForward();
    const zoomAmount = event.deltaY > 0 ? -1 : 1;
    this.camera.position.addScaledVector(forward, zoomAmount * 0.5);
  }

  /**
   * Updates yaw and pitch from mouse deltas.
   * @param deltaX Horizontal mouse movement.
   * @param deltaY Vertical mouse movement.
   */
  private handleRotation(deltaX: number, deltaY: number): void {
    this.yaw -= deltaX * this.mouseSensitivity;
    this.pitch -= deltaY * this.mouseSensitivity;
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
  }

  /**
   * Pans the camera in the view plane.
   * @param deltaX Horizontal mouse movement.
   * @param deltaY Vertical mouse movement.
   */
  private handlePan(deltaX: number, deltaY: number): void {
    const right = this.getRight();
    const up = this.getCameraUp();
    const scale = this.panDistance * 0.002;
    this.camera.position.addScaledVector(right, -deltaX * scale);
    this.camera.position.addScaledVector(up, deltaY * scale);
  }

  /**
   * Builds the current forward direction from yaw and pitch.
   * @returns A unit forward vector.
   */
  private getForward(): THREE.Vector3 {
    return new THREE.Vector3(
      Math.cos(this.pitch) * Math.sin(this.yaw),
      Math.sin(this.pitch),
      Math.cos(this.pitch) * Math.cos(this.yaw)
    );
  }

  /**
   * Builds the camera right vector from forward and world up.
   * @returns A unit right vector.
   */
  private getRight(): THREE.Vector3 {
    const forward = this.getForward();
    const worldUp = new THREE.Vector3(0, 1, 0);
    return new THREE.Vector3().crossVectors(forward, worldUp).normalize();
  }

  /**
   * Builds the camera up vector from right and forward.
   * @returns A unit up vector.
   */
  private getCameraUp(): THREE.Vector3 {
    const forward = this.getForward();
    const right = this.getRight();
    return new THREE.Vector3().crossVectors(right, forward).normalize();
  }

  /**
   * Advances fly movement and applies yaw/pitch orientation while navigating.
   * When idle, the camera transform is left alone so fit animations stick.
   * @param deltaTime Frame delta in seconds.
   */
  update(deltaTime: number): void {
    if (!this.isNavigating()) return;
    const forward = this.getForward();
    if (this.shouldApplyFlyMovement()) {
      this.applyFlyMovement(deltaTime, forward);
    }
    const lookTarget = this.camera.position.clone().add(forward);
    this.camera.lookAt(lookTarget);
  }

  /**
   * Returns true only while right-mouse fly mode is held.
   * @returns Whether fly translation keys should move the camera.
   */
  private shouldApplyFlyMovement(): boolean {
    return this.isRotating;
  }

  /**
   * Applies WASD/QE translation relative to the current view.
   * @param deltaTime Frame delta in seconds.
   * @param forward Current forward direction.
   */
  private applyFlyMovement(deltaTime: number, forward: THREE.Vector3): void {
    const right = this.getRight();
    const worldUp = new THREE.Vector3(0, 1, 0);
    const moveAmount = this.moveSpeed * deltaTime;
    if (this.inputManager.isKeyDown('KeyW')) {
      this.camera.position.addScaledVector(forward, moveAmount);
    }
    if (this.inputManager.isKeyDown('KeyS')) {
      this.camera.position.addScaledVector(forward, -moveAmount);
    }
    if (this.inputManager.isKeyDown('KeyA')) {
      this.camera.position.addScaledVector(right, -moveAmount);
    }
    if (this.inputManager.isKeyDown('KeyD')) {
      this.camera.position.addScaledVector(right, moveAmount);
    }
    if (this.inputManager.isKeyDown('KeyQ')) {
      this.camera.position.addScaledVector(worldUp, -moveAmount);
    }
    if (this.inputManager.isKeyDown('KeyE')) {
      this.camera.position.addScaledVector(worldUp, moveAmount);
    }
  }

  /**
   * Returns whether the camera is currently in fly or pan navigation.
   * @returns True if right or middle mouse navigation is active.
   */
  isNavigating(): boolean {
    return this.isRotating || this.isPanning;
  }

  /**
   * Returns a copy of the current forward look direction.
   * @returns The forward direction vector.
   */
  getForwardDirection(): THREE.Vector3 {
    return this.getForward().clone();
  }

  /**
   * Handles pointer lock state changes from the browser.
   */
  private onPointerLockChange(): void {
    if (document.pointerLockElement === this.canvas) {
      this.isPointerLocked = true;
    } else {
      this.handlePointerLockLost();
    }
  }

  /**
   * Clears pointer lock state after a lock error.
   */
  private onPointerLockError(): void {
    this.isPointerLocked = false;
  }

  /**
   * Resets navigation flags when pointer lock is lost.
   */
  private handlePointerLockLost(): void {
    this.isPointerLocked = false;
    this.isRotating = false;
    this.isPanning = false;
    this.activeButtons.clear();
  }

  /**
   * Requests pointer lock on the canvas when supported.
   */
  private tryRequestPointerLock(): void {
    if (typeof this.canvas.requestPointerLock === 'function') {
      this.canvas.requestPointerLock();
    }
  }

  /**
   * Exits pointer lock when supported.
   */
  private tryExitPointerLock(): void {
    if (typeof document.exitPointerLock === 'function') {
      document.exitPointerLock();
    }
  }

  /**
   * Returns the current yaw angle in radians.
   * @returns Yaw in radians.
   */
  getYaw(): number {
    return this.yaw;
  }

  /**
   * Returns the current pitch angle in radians.
   * @returns Pitch in radians.
   */
  getPitch(): number {
    return this.pitch;
  }
}
