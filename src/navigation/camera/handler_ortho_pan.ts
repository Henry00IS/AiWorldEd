import * as THREE from 'three';
import { managerPointerLock } from '@/input/manager_pointer_lock.js';
import { blurActiveFormField } from '@/utils/dom_focus.js';
import { SelectionClickThrough } from '@/selection/object/selection_click_through.js';

/**
 * Invoked when the user scrolls to zoom an orthographic viewport toward the
 * pointer. Factor greater than 1 zooms out. Pointer U/V are normalized to the
 * drawable pane (0..1 from left/top).
 *
 * @param factor Multiplier applied to frustum size.
 * @param pointerU Horizontal pointer in [0, 1].
 * @param pointerV Vertical pointer in [0, 1] (top → bottom).
 */
type ZoomCallback = (factor: number, pointerU: number, pointerV: number) => void;

/**
 * Right-button pan and wheel zoom for orthographic 2D viewports. Uses the
 * shared pointer-lock counter while the secondary button is held for continuous
 * pan.
 */
export class HandlerOrthoPan {
  private isPanning: boolean;
  private holdsPointerLock: boolean;
  private canvas: HTMLElement;
  private camera: THREE.OrthographicCamera;
  private zoomCallback: ZoomCallback;
  private tempForward: THREE.Vector3;
  private tempRight: THREE.Vector3;
  private tempUp: THREE.Vector3;
  private isDisposed: boolean;
  private readonly onContextMenu: (event: Event) => void;
  private readonly onPointerDownBound: (event: PointerEvent) => void;
  private readonly onPointerMoveBound: (event: PointerEvent) => void;
  private readonly onPointerUpBound: (event: PointerEvent) => void;
  private readonly onWheelBound: (event: WheelEvent) => void;
  private readonly onPointerLockChangeBound: () => void;

  /**
   * Creates a pan/zoom handler bound to a canvas and orthographic camera.
   *
   * @param canvas Canvas element that receives pointer and wheel events.
   * @param camera Orthographic camera whose position and frustum are updated.
   * @param zoomCallback Invoked with a zoom factor on wheel events.
   */
  constructor(canvas: HTMLElement, camera: THREE.OrthographicCamera, zoomCallback: ZoomCallback) {
    this.canvas = canvas;
    this.camera = camera;
    this.isPanning = false;
    this.holdsPointerLock = false;
    this.isDisposed = false;
    this.zoomCallback = zoomCallback;
    this.tempForward = new THREE.Vector3();
    this.tempRight = new THREE.Vector3();
    this.tempUp = new THREE.Vector3();
    this.onContextMenu = (event) => event.preventDefault();
    this.onPointerDownBound = (event) => this.onPointerDown(event);
    this.onPointerMoveBound = (event) => this.onPointerMove(event);
    this.onPointerUpBound = (event) => this.onPointerUp(event);
    this.onWheelBound = (event) => this.onWheel(event);
    this.onPointerLockChangeBound = () => this.onPointerLockChange();
    this.bindEvents();
  }

  /** Registers canvas listeners for pan and zoom. */
  private bindEvents(): void {
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
    this.canvas.addEventListener('pointerdown', this.onPointerDownBound);
    this.canvas.addEventListener('pointermove', this.onPointerMoveBound);
    this.canvas.addEventListener('pointerup', this.onPointerUpBound);
    this.canvas.addEventListener('wheel', this.onWheelBound, { passive: false });
    this.canvas.ownerDocument.addEventListener('pointerlockchange', this.onPointerLockChangeBound);
  }

  /** Removes all listeners so the handler can be garbage-collected. */
  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.isPanning = false;
    this.dropPointerLock();
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.canvas.removeEventListener('pointerdown', this.onPointerDownBound);
    this.canvas.removeEventListener('pointermove', this.onPointerMoveBound);
    this.canvas.removeEventListener('pointerup', this.onPointerUpBound);
    this.canvas.removeEventListener('wheel', this.onWheelBound);
    this.canvas.ownerDocument.removeEventListener('pointerlockchange', this.onPointerLockChangeBound);
  }

  /**
   * Returns whether secondary-button pan is currently active.
   *
   * @returns True while right-mouse pan is held.
   */
  isNavigating(): boolean {
    return this.isPanning;
  }

  /**
   * Starts panning when the secondary mouse button is pressed.
   *
   * @param event Pointer down event from the canvas.
   */
  private onPointerDown(event: PointerEvent): void {
    if (event.button !== 2) return;
    blurActiveFormField();
    this.isPanning = true;
    SelectionClickThrough.resetClickThrough();
    this.takePointerLock();
  }

  /**
   * Applies camera pan while the secondary button drag is active.
   *
   * @param event Pointer move event with movement deltas.
   */
  private onPointerMove(event: PointerEvent): void {
    if (!this.isPanning) return;
    this.applyPan(event.movementX, event.movementY);
  }

  /**
   * Ends panning when the secondary button is released.
   *
   * @param event Pointer up event from the canvas.
   */
  private onPointerUp(event: PointerEvent): void {
    if (event.button === 2) {
      this.isPanning = false;
      this.dropPointerLock();
    }
  }

  /**
   * Takes one shared pointer-lock ref if this handler does not already hold
   * one.
   */
  private takePointerLock(): void {
    if (this.holdsPointerLock) {
      return;
    }
    managerPointerLock.lock(this.canvas);
    this.holdsPointerLock = true;
  }

  /** Drops this handler's shared pointer-lock ref when held. */
  private dropPointerLock(): void {
    if (!this.holdsPointerLock) {
      return;
    }
    this.holdsPointerLock = false;
    managerPointerLock.unlock();
  }

  /** Stops pan and balances the lock counter when the browser ends capture. */
  private onPointerLockChange(): void {
    if (!this.holdsPointerLock) {
      return;
    }
    if (managerPointerLock.isBrowserLocked()) {
      return;
    }
    this.isPanning = false;
    this.dropPointerLock();
  }

  /**
   * Converts wheel deltas into orthographic zoom factors at the pointer.
   *
   * @param event Wheel event from the canvas.
   */
  private onWheel(event: WheelEvent): void {
    event.preventDefault();
    const factor = event.deltaY > 0 ? 1.1 : 0.9;
    const pointer = this.readNormalizedPointer(event);
    this.zoomCallback(factor, pointer.u, pointer.v);
    SelectionClickThrough.resetClickThrough();
  }

  /**
   * Maps a wheel event's client position into pane-normalized U/V.
   *
   * @param event Wheel event providing client coordinates.
   * @returns Pointer fractions across the drawable element.
   */
  private readNormalizedPointer(event: WheelEvent): { u: number; v: number } {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(rect.width, 1);
    const height = Math.max(rect.height, 1);
    return {
      u: (event.clientX - rect.left) / width,
      v: (event.clientY - rect.top) / height,
    };
  }

  /**
   * Pans the camera in view space from screen-pixel movement.
   *
   * @param screenDeltaX Horizontal pointer movement in CSS pixels.
   * @param screenDeltaY Vertical pointer movement in CSS pixels.
   */
  private applyPan(screenDeltaX: number, screenDeltaY: number): void {
    const frustumWidth = this.camera.right - this.camera.left;
    const frustumHeight = this.camera.top - this.camera.bottom;
    const canvasWidth = this.canvas.clientWidth || 1;
    const canvasHeight = this.canvas.clientHeight || 1;
    const worldX = (screenDeltaX * frustumWidth) / canvasWidth;
    const worldY = (screenDeltaY * frustumHeight) / canvasHeight;
    this.camera.getWorldDirection(this.tempForward);
    this.tempRight.crossVectors(this.tempForward, this.camera.up).normalize();
    if (this.tempRight.lengthSq() < 1e-10) {
      this.tempRight.set(1, 0, 0);
    }
    this.tempUp.crossVectors(this.tempRight, this.tempForward).normalize();
    this.camera.position.addScaledVector(this.tempRight, -worldX);
    this.camera.position.addScaledVector(this.tempUp, worldY);
  }
}
