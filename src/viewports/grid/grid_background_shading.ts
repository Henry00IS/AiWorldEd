import * as THREE from 'three';
import type { ThemeViewportPalette } from '@/viewports/theme/theme_viewport_palette.js';

/**
 * Re-bases faded grid line colors onto the pane background gradient. Grid line
 * colors are mixed toward the flat viewport background; when the theme paints a
 * vertical gradient instead, each line endpoint swaps that flat share for the
 * gradient color at its screen height, so faded lines vanish into the gradient
 * rather than flattening it. Without a gradient colors pass through.
 */
export class GridBackgroundShading {
  private readonly flatColor: THREE.Color;
  private readonly topColor: THREE.Color;
  private readonly bottomColor: THREE.Color;
  private readonly scratchBackground: THREE.Color;
  private readonly scratchProjected: THREE.Vector3;
  private camera: THREE.Camera | null;
  private isGradientActive: boolean;

  /** Creates an inactive shading helper; call sync before use. */
  constructor() {
    this.flatColor = new THREE.Color();
    this.topColor = new THREE.Color();
    this.bottomColor = new THREE.Color();
    this.scratchBackground = new THREE.Color();
    this.scratchProjected = new THREE.Vector3();
    this.camera = null;
    this.isGradientActive = false;
  }

  /**
   * Reads the palette background colors and the camera used for screen height.
   *
   * @param palette Active viewport palette.
   * @param camera Camera of the pane being drawn.
   */
  sync(palette: ThemeViewportPalette, camera: THREE.Camera): void {
    this.camera = camera;
    this.flatColor.setHex(palette.viewportBackground);
    const top = palette.viewportGradientTop;
    const bottom = palette.viewportGradientBottom;
    this.isGradientActive = top !== null && bottom !== null;
    if (top === null || bottom === null) return;
    this.topColor.setHex(top);
    this.bottomColor.setHex(bottom);
  }

  /**
   * Returns true when the pane background is a gradient.
   *
   * @returns Whether endpoint colors are re-based.
   */
  isActive(): boolean {
    return this.isGradientActive;
  }

  /**
   * Writes the endpoint color for a line color that holds a share of the flat
   * background.
   *
   * @param point World position of the endpoint.
   * @param lineColor Line color mixed against the flat background.
   * @param backgroundShare Weight of the flat background inside lineColor.
   * @param target Receives the endpoint color.
   * @returns The target color.
   */
  endpointColor(
    point: THREE.Vector3,
    lineColor: THREE.Color,
    backgroundShare: number,
    target: THREE.Color,
  ): THREE.Color {
    target.copy(lineColor);
    if (!this.isGradientActive || !this.camera || backgroundShare <= 0) return target;
    const background = this.backgroundAt(point);
    target.r += (background.r - this.flatColor.r) * backgroundShare;
    target.g += (background.g - this.flatColor.g) * backgroundShare;
    target.b += (background.b - this.flatColor.b) * backgroundShare;
    return target;
  }

  /**
   * Returns the gradient color at a world point's screen height. Points off
   * screen extrapolate linearly so interpolated on-screen pixels stay exact.
   *
   * @param point World position.
   * @returns Scratch background color.
   */
  private backgroundAt(point: THREE.Vector3): THREE.Color {
    this.scratchProjected.copy(point).project(this.camera as THREE.Camera);
    const fromTop = (1 - this.scratchProjected.y) * 0.5;
    this.scratchBackground.r = this.topColor.r + (this.bottomColor.r - this.topColor.r) * fromTop;
    this.scratchBackground.g = this.topColor.g + (this.bottomColor.g - this.topColor.g) * fromTop;
    this.scratchBackground.b = this.topColor.b + (this.bottomColor.b - this.topColor.b) * fromTop;
    return this.scratchBackground;
  }
}
