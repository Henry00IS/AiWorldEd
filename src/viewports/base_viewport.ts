import * as THREE from 'three';
import { Theme } from '../theme.js';
import { ViewportToolbar } from '../ui/viewport_toolbar.js';
import { ShadingMode } from '../types/shading_mode.js';

export abstract class BaseViewport {
  protected container: HTMLElement;
  protected scene: THREE.Scene;
  protected renderer: THREE.WebGLRenderer;
  protected name: string;
  private viewportToolbar: ViewportToolbar;

  /**
   * Creates a viewport with a scene, renderer, and overlay toolbar.
   * @param container The DOM element that hosts this viewport.
   * @param name The display name shown in the viewport toolbar.
   * @param initialShadingMode The shading mode highlighted on the toolbar.
   */
  constructor(
    container: HTMLElement,
    name: string,
    initialShadingMode: ShadingMode = ShadingMode.SOLID
  ) {
    this.container = container;
    this.name = name;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(Theme.viewportBackground);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.viewportToolbar = new ViewportToolbar(
      container,
      name,
      initialShadingMode
    );
    this.setupContainer();
  }

  /**
   * Configures container and canvas layout styles, then attaches the canvas.
   */
  protected setupContainer(): void {
    this.container.style.position = 'relative';
    this.container.style.overflow = 'hidden';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
    this.container.appendChild(this.renderer.domElement);
  }

  abstract resize(width: number, height: number): void;
  abstract render(): void;
  abstract getCamera(): THREE.Camera;

  /**
   * Returns the Three.js scene for this viewport.
   * @returns The scene instance.
   */
  getScene(): THREE.Scene {
    return this.scene;
  }

  /**
   * Returns the WebGL renderer for this viewport.
   * @returns The renderer instance.
   */
  getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  /**
   * Returns the display name of this viewport.
   * @returns The viewport name string.
   */
  getName(): string {
    return this.name;
  }

  /**
   * Returns the overlay toolbar for this viewport.
   * @returns The ViewportToolbar instance.
   */
  getViewportToolbar(): ViewportToolbar {
    return this.viewportToolbar;
  }

  /**
   * Returns the toolbar root element (replaces the old standalone label).
   * @returns The toolbar container element.
   */
  getLabelElement(): HTMLElement {
    return this.viewportToolbar.getElement();
  }
}
