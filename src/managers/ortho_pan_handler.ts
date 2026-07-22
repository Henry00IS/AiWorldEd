import * as THREE from 'three';
import { blurActiveFormField } from '../utils/dom_focus.js';

type ZoomCallback = (factor: number) => void;

export class OrthoPanHandler {
  private isPanning: boolean;
  private isPointerLocked: boolean;
  private canvas: HTMLElement;
  private camera: THREE.OrthographicCamera;
  private zoomCallback: ZoomCallback;
  private tempForward: THREE.Vector3;
  private tempRight: THREE.Vector3;
  private tempUp: THREE.Vector3;

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

  private bindEvents(): void {
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    this.canvas.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    this.canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
    this.canvas.addEventListener('pointerup', (event) => this.onPointerUp(event));
    this.canvas.addEventListener('wheel', (event) => this.onWheel(event));
    document.addEventListener('pointerlockchange', () => this.onPointerLockChange());
    document.addEventListener('pointerlockerror', () => this.onPointerLockError());
  }

  private onPointerDown(event: PointerEvent): void {
    if (event.button !== 2) return;
    blurActiveFormField();
    this.isPanning = true;
    if (!this.isPointerLocked) {
      this.tryRequestPointerLock();
    }
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.isPanning) return;
    this.applyPan(event.movementX, event.movementY);
  }

  private onPointerUp(event: PointerEvent): void {
    if (event.button === 2) {
      this.isPanning = false;
      if (this.isPointerLocked) {
        this.tryExitPointerLock();
      }
    }
  }

  private onPointerLockChange(): void {
    if (document.pointerLockElement === this.canvas) {
      this.isPointerLocked = true;
    } else {
      this.isPointerLocked = false;
      this.isPanning = false;
    }
  }

  private onPointerLockError(): void {
    this.isPointerLocked = false;
  }

  private tryRequestPointerLock(): void {
    if (typeof this.canvas.requestPointerLock === 'function') {
      this.canvas.requestPointerLock();
    }
  }

  private tryExitPointerLock(): void {
    if (typeof document.exitPointerLock === 'function') {
      document.exitPointerLock();
    }
  }

  private onWheel(event: MouseEvent): void {
    event.preventDefault();
    const factor = event.deltaY > 0 ? 1.1 : 0.9;
    this.zoomCallback(factor);
  }

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
