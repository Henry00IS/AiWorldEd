import * as THREE from 'three';
import { blurActiveFormField } from '../utils/dom_focus.js';

/**
 * Invoked when the user scrolls to zoom an orthographic viewport.
 * @param factor Multiplier applied to frustum size (greater than 1 zooms out).
 */
type ZoomCallback = (factor: number) => void;

/**
 * Right-button pan and wheel zoom for orthographic 2D viewports.
 * Uses pointer lock while the secondary button is held for continuous pan.
 */
export class OrthoPanHandler {
  private isPanning: boolean;
  private isPointerLocked: boolean;
  private canvas: HTMLElement;
  private camera: THREE.OrthographicCamera;
  private zoomCallback: ZoomCallback;
  private tempForward: THREE.Vector3;
  private tempRight: THREE.Vector3;
  private tempUp: THREE.Vector3;

  /**
   * Creates a pan/zoom handler bound to a canvas and orthographic camera.
   * @param canvas Canvas element that receives pointer and wheel events.
   * @param camera Orthographic camera whose position and frustum are updated.
   * @param zoomCallback Invoked with a zoom factor on wheel events.
   */
  constructor(
    canvas: HTMLElement,
    camera: THREE.OrthographicCamera,
    zoomCallback: ZoomCallback
  ) {
    this.canvas = canvas;
    this.camera = camera;
    this.isPanning = false;
    this.isPointerLocked = false;
    this.zoomCallback = zoomCallback;
    this.tempForward = new THREE.Vector3();
    this.tempRight = new THREE.Vector3();
    this.tempUp = new THREE.Vector3();
    this.bindEvents();
  }

  /**
   * Registers canvas and document listeners for pan, zoom, and pointer lock.
   */
  private bindEvents(): void {
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    this.canvas.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    this.canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
    this.canvas.addEventListener('pointerup', (event) => this.onPointerUp(event));
    this.canvas.addEventListener('wheel', (event) => this.onWheel(event));
    document.addEventListener('pointerlockchange', () => this.onPointerLockChange());
    document.addEventListener('pointerlockerror', () => this.onPointerLockError());
  }

  /**
   * Starts panning when the secondary mouse button is pressed.
   * @param event Pointer down event from the canvas.
   */
  private onPointerDown(event: PointerEvent): void {
    if (event.button !== 2) return;
    blurActiveFormField();
    this.isPanning = true;
    if (!this.isPointerLocked) {
      this.tryRequestPointerLock();
    }
  }

  /**
   * Applies camera pan while the secondary button drag is active.
   * @param event Pointer move event with movement deltas.
   */
  private onPointerMove(event: PointerEvent): void {
    if (!this.isPanning) return;
    this.applyPan(event.movementX, event.movementY);
  }

  /**
   * Ends panning when the secondary button is released.
   * @param event Pointer up event from the canvas.
   */
  private onPointerUp(event: PointerEvent): void {
    if (event.button === 2) {
      this.isPanning = false;
      if (this.isPointerLocked) {
        this.tryExitPointerLock();
      }
    }
  }

  /**
   * Tracks pointer-lock state changes for continuous pan.
   */
  private onPointerLockChange(): void {
    if (document.pointerLockElement === this.canvas) {
      this.isPointerLocked = true;
    } else {
      this.isPointerLocked = false;
      this.isPanning = false;
    }
  }

  /**
   * Clears pointer-lock state when the lock request fails.
   */
  private onPointerLockError(): void {
    this.isPointerLocked = false;
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
   * Releases pointer lock when supported.
   */
  private tryExitPointerLock(): void {
    if (typeof document.exitPointerLock === 'function') {
      document.exitPointerLock();
    }
  }

  /**
   * Converts wheel deltas into orthographic zoom factors.
   * @param event Wheel event from the canvas.
   */
  private onWheel(event: WheelEvent): void {
    event.preventDefault();
    const factor = event.deltaY > 0 ? 1.1 : 0.9;
    this.zoomCallback(factor);
  }

  /**
   * Pans the camera in view space from screen-pixel movement.
   * @param screenDeltaX Horizontal pointer movement in CSS pixels.
   * @param screenDeltaY Vertical pointer movement in CSS pixels.
   */
  private applyPan(screenDeltaX: number, screenDeltaY: number): void {
    const frustumWidth = this.camera.right - this.camera.left;
    const frustumHeight = this.camera.top - this.camera.bottom;
    const canvasWidth = this.canvas.clientWidth || 1;
    const canvasHeight = this.canvas.clientHeight || 1;
    const worldX = screenDeltaX * frustumWidth / canvasWidth;
    const worldY = screenDeltaY * frustumHeight / canvasHeight;
    this.camera.getWorldDirection(this.tempForward);
    this.tempRight.crossVectors(this.tempForward, new THREE.Vector3(0, 1, 0)).normalize();
    this.tempUp.crossVectors(this.tempRight, this.tempForward).normalize();
    this.camera.position.addScaledVector(this.tempRight, -worldX);
    this.camera.position.addScaledVector(this.tempUp, worldY);
  }
}
