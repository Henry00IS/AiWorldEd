import * as THREE from 'three';
import type { AxisDirection } from '../settings/coordinate_space_types.js';

const LABEL_CANVAS_WIDTH = 128;
const LABEL_CANVAS_HEIGHT = 64;

/** Owns one camera-facing signed-axis label and its GPU resources. */
export class CameraWidgetAxisLabel {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D | null;
  private readonly texture: THREE.CanvasTexture;
  private readonly material: THREE.SpriteMaterial;
  private readonly sprite: THREE.Sprite;
  private text: AxisDirection;
  private color: number;

  /** Creates an initially blank transparent label sprite. */
  constructor() {
    this.canvas = createLabelCanvas();
    this.context = acquireCanvasContext(this.canvas);
    this.texture = createLabelTexture(this.canvas);
    this.material = createLabelMaterial(this.texture);
    this.sprite = new THREE.Sprite(this.material);
    this.sprite.scale.set(0.72, 0.36, 1);
    this.text = '+x';
    this.color = 0xffffff;
  }

  /**
   * Updates the signed text and axis color without replacing GPU resources.
   *
   * @param text Signed axis text.
   * @param color Axis color.
   */
  update(text: AxisDirection, color: number): void {
    if (this.text === text && this.color === color) return;
    this.text = text;
    this.color = color;
    this.material.color.setHex(color);
    this.drawText();
  }

  /**
   * Positions the label beyond an arrow tip.
   *
   * @param direction Arrow direction in widget-local editor space.
   * @param distance Distance from the widget origin.
   */
  setPosition(direction: THREE.Vector3, distance: number): void {
    this.sprite.position.copy(direction).multiplyScalar(distance);
  }

  /**
   * Returns the renderable label sprite.
   *
   * @returns Camera-facing sprite.
   */
  getSprite(): THREE.Sprite {
    return this.sprite;
  }

  /**
   * Returns the displayed signed axis.
   *
   * @returns Uppercase signed axis label.
   */
  getText(): string {
    return this.text.toUpperCase();
  }

  /**
   * Returns the current label color.
   *
   * @returns Hexadecimal color.
   */
  getColor(): number {
    return this.color;
  }

  /**
   * Returns the owned texture for lifecycle verification.
   *
   * @returns Canvas texture.
   */
  getTexture(): THREE.CanvasTexture {
    return this.texture;
  }

  /**
   * Returns the owned material for lifecycle verification.
   *
   * @returns Sprite material.
   */
  getMaterial(): THREE.SpriteMaterial {
    return this.material;
  }

  /** Releases the label's material and texture. */
  dispose(): void {
    this.material.dispose();
    this.texture.dispose();
  }

  /** Redraws the current signed axis into the transparent texture. */
  private drawText(): void {
    if (!this.context) return;
    this.context.clearRect(0, 0, LABEL_CANVAS_WIDTH, LABEL_CANVAS_HEIGHT);
    this.context.font = '700 40px Arial, sans-serif';
    this.context.textAlign = 'center';
    this.context.textBaseline = 'middle';
    this.context.fillStyle = '#ffffff';
    this.context.fillText(this.text.toUpperCase(), LABEL_CANVAS_WIDTH / 2, LABEL_CANVAS_HEIGHT / 2);
    this.texture.needsUpdate = true;
  }
}

/**
 * Creates the off-DOM drawing surface for one label.
 *
 * @returns Sized canvas element.
 */
function createLabelCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = LABEL_CANVAS_WIDTH;
  canvas.height = LABEL_CANVAS_HEIGHT;
  return canvas;
}

/**
 * Acquires a 2D context when the host environment implements one.
 *
 * @param canvas Label drawing surface.
 * @returns Drawing context or null in headless test environments.
 */
function acquireCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  if (typeof CanvasRenderingContext2D === 'undefined') return null;
  try {
    return canvas.getContext('2d');
  } catch {
    return null;
  }
}

/**
 * Creates a color-managed texture for a label canvas.
 *
 * @param canvas Label drawing surface.
 * @returns Configured canvas texture.
 */
function createLabelTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/**
 * Creates a transparent overlay material for one label.
 *
 * @param texture Label texture.
 * @returns Sprite material.
 */
function createLabelMaterial(texture: THREE.CanvasTexture): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}
