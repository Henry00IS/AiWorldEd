import * as THREE from 'three';
import { Theme } from '../theme.js';

/**
 * Renders three colored arrows (X=red, Y=green, Z=blue) in the top-right
 * corner of the 3D viewport, mirroring the camera's current orientation.
 */
export class CameraWidget {
  private widgetRenderer: THREE.WebGLRenderer;
  private widgetCamera: THREE.OrthographicCamera;
  private widgetScene: THREE.Scene;
  private arrowGroup: THREE.Group;
  private arrowX: THREE.ArrowHelper;
  private arrowY: THREE.ArrowHelper;
  private arrowZ: THREE.ArrowHelper;

  private readonly canvasSize: number;
  private readonly arrowLength: number;
  private readonly headLength: number;
  private readonly headWidth: number;
  private readonly offsetX: number;
  private readonly offsetY: number;

  /**
   * Creates a new camera orientation widget.
   * @param container The viewport container to overlay the widget onto.
   */
  constructor(container: HTMLElement) {
    this.canvasSize = 96;
    this.arrowLength = 1.2;
    this.headLength = 0.35;
    this.headWidth = 0.2;
    this.offsetX = 4;
    this.offsetY = Theme.viewportToolbarHeightPx + 4;

    this.widgetScene = new THREE.Scene();

    this.widgetCamera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 100);
    this.widgetCamera.position.set(0, 0, 5);
    this.widgetCamera.lookAt(0, 0, 0);

    this.widgetRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.widgetRenderer.setPixelRatio(window.devicePixelRatio);
    this.widgetRenderer.setSize(this.canvasSize, this.canvasSize);

    this.arrowGroup = new THREE.Group();
    this.widgetScene.add(this.arrowGroup);

    this.createArrows();
    this.attachToContainer(container);
  }

  /**
   * Creates the three axis arrows and adds them to the widget scene.
   */
  private createArrows(): void {
    this.arrowX = this.buildArrow(
      new THREE.Vector3(1, 0, 0),
      Theme.widgetXAxisColor
    );
    this.arrowGroup.add(this.arrowX);

    this.arrowY = this.buildArrow(
      new THREE.Vector3(0, 1, 0),
      Theme.widgetYAxisColor
    );
    this.arrowGroup.add(this.arrowY);

    this.arrowZ = this.buildArrow(
      new THREE.Vector3(0, 0, 1),
      Theme.widgetZAxisColor
    );
    this.arrowGroup.add(this.arrowZ);
  }

  /**
   * Builds an ArrowHelper with consistent sizing.
   * @param direction The axis direction for the arrow.
   * @param color The hex color for the arrow shaft and head.
   * @returns A configured ArrowHelper instance.
   */
  private buildArrow(direction: THREE.Vector3, color: number): THREE.ArrowHelper {
    return new THREE.ArrowHelper(
      direction,
      new THREE.Vector3(0, 0, 0),
      this.arrowLength,
      color,
      this.headLength,
      this.headWidth
    );
  }

  /**
   * Attaches the widget canvas to the viewport container as an overlay.
   * @param container The parent viewport container element.
   */
  private attachToContainer(container: HTMLElement): void {
    const canvas = this.widgetRenderer.domElement;
    canvas.style.position = 'absolute';
    canvas.style.top = `${this.offsetY}px`;
    canvas.style.right = `${this.offsetX}px`;
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '10';
    canvas.style.borderRadius = '4px';
    canvas.style.overflow = 'hidden';
    container.appendChild(canvas);
  }

  /**
   * Updates the widget camera to match the main camera's orientation,
   * then renders the widget.
   * @param camera The main camera to mirror.
   */
  update(camera: THREE.Camera): void {
    const mainQuaternion = new THREE.Quaternion();
    camera.getWorldQuaternion(mainQuaternion);
    this.arrowGroup.quaternion.copy(mainQuaternion);
    this.arrowGroup.quaternion.invert();
    this.widgetRenderer.render(this.widgetScene, this.widgetCamera);
  }

  /**
   * Returns the canvas DOM element for the widget.
   * @returns The HTML canvas element.
   */
  getCanvasElement(): HTMLCanvasElement {
    return this.widgetRenderer.domElement;
  }

  /**
   * Returns the widget's Three.js scene.
   * @returns The scene containing the axis arrows.
   */
  getScene(): THREE.Scene {
    return this.widgetScene;
  }

  /**
   * Returns the X axis arrow helper.
   * @returns The red (X) ArrowHelper.
   */
  getArrowX(): THREE.ArrowHelper {
    return this.arrowX;
  }

  /**
   * Returns the Y axis arrow helper.
   * @returns The green (Y) ArrowHelper.
   */
  getArrowY(): THREE.ArrowHelper {
    return this.arrowY;
  }

  /**
   * Returns the Z axis arrow helper.
   * @returns The blue (Z) ArrowHelper.
   */
  getArrowZ(): THREE.ArrowHelper {
    return this.arrowZ;
  }

  /**
   * Disposes all Three.js resources and removes the canvas from the DOM.
   */
  dispose(): void {
    this.widgetScene.remove(this.arrowX);
    this.widgetScene.remove(this.arrowY);
    this.widgetScene.remove(this.arrowZ);
    this.widgetRenderer.dispose();
    if (this.widgetRenderer.domElement.parentNode) {
      this.widgetRenderer.domElement.parentNode.removeChild(this.widgetRenderer.domElement);
    }
  }
}
