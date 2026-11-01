import * as THREE from 'three';
import {
  screenCollaborationPaneHeight,
  screenCollaborationWorldPerPixel,
} from '@/collaboration/presence/screen_collaboration_presence.js';
import { presenceCollaborationTag } from '@/collaboration/presence/tag_collaboration_presence.js';

/** Name tag height in CSS pixels. */
export const NAMETAG_COLLABORATION_PRESENCE_HEIGHT_PX = 22;
/** Canvas pixels per name tag pixel, for crisp text on dense screens. */
const NAMETAG_COLLABORATION_PRESENCE_SCALE = 2;
/** Font of the name. */
const NAMETAG_COLLABORATION_PRESENCE_FONT = '600 26px system-ui, sans-serif';
/**
 * Gap kept between a tag pulled into view and the top of the pane, in CSS
 * pixels.
 */
export const NAMETAG_COLLABORATION_PRESENCE_EDGE_PX = 4;

const nametagUp = new THREE.Vector3();
const nametagTop = new THREE.Vector3();
const nametagBase = new THREE.Vector3();

/** Lift of the tag above its anchor. */
export interface NametagCollaborationPresenceLift {
  /** Lift in world units, used when it is larger on screen. */
  world: number;
  /** Lift in screen pixels. */
  pixels: number;
  /**
   * Bottom of what the tag labels (a character's feet). When set and that point
   * is on screen, a tag that would leave the top of the pane is pulled down to
   * stay in view, but never below this point.
   */
  base?: THREE.Vector3;
}

/**
 * A billboard name tag in the member's color that keeps the same size on screen
 * in every pane and stays visible through geometry.
 */
export class NametagCollaborationPresence {
  readonly sprite: THREE.Sprite;
  readonly anchor: THREE.Vector3;
  private readonly lift: NametagCollaborationPresenceLift;
  private readonly texture: THREE.CanvasTexture;
  private aspect: number;

  /**
   * Creates the tag.
   *
   * @param name Display name.
   * @param color Member color (0xRRGGBB).
   * @param lift Lift above the anchor.
   */
  constructor(name: string, color: number, lift: NametagCollaborationPresenceLift) {
    const canvas = document.createElement('canvas');
    this.aspect = nametagCollaborationDraw(canvas, name, color);
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: this.texture, depthTest: false, depthWrite: false });
    this.sprite = new THREE.Sprite(material);
    this.sprite.center.set(0.5, 0);
    this.sprite.renderOrder = 1000;
    this.anchor = new THREE.Vector3();
    this.lift = lift;
    this.sprite.frustumCulled = false;
    presenceCollaborationTag(this.sprite);
    this.sprite.onBeforeRender = (renderer, _scene, camera) => this.place(renderer, camera);
  }

  /**
   * Sizes the tag and lifts it toward the top of the pane being drawn.
   *
   * @param renderer Renderer.
   * @param camera Pane camera.
   */
  private place(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    const perPixel = screenCollaborationWorldPerPixel(renderer, camera, this.anchor);
    const lift = Math.max(this.lift.world, this.lift.pixels * perPixel);
    const height = NAMETAG_COLLABORATION_PRESENCE_HEIGHT_PX * perPixel;
    nametagUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    this.sprite.position.copy(this.anchor).addScaledVector(nametagUp, lift);
    const base = this.lift.base;
    if (base !== undefined) {
      const pane = { camera, pixels: screenCollaborationPaneHeight(renderer), perPixel };
      const drop = nametagCollaborationOverflow(this.sprite.position, base, height, pane);
      this.sprite.position.addScaledVector(nametagUp, -drop);
    }
    this.sprite.scale.set(height * this.aspect, height, 1);
    this.sprite.updateMatrixWorld();
  }

  /** Frees the texture and material. */
  dispose(): void {
    this.texture.dispose();
    this.sprite.material.dispose();
  }
}

/** Pane a tag is drawn in. */
export interface NametagCollaborationPane {
  /** Pane camera, with its world matrices up to date. */
  camera: THREE.Camera;
  /** Pane height in CSS pixels. */
  pixels: number;
  /** World units per CSS pixel at the tag. */
  perPixel: number;
}

/**
 * Returns how far (in world units, along the camera's up axis) a tag must move
 * down so its top stays inside the pane. It is zero when the tag fits, when the
 * labelled point is off screen or behind the camera, and never moves the tag
 * below that point.
 *
 * @param position Bottom center of the tag.
 * @param base Bottom of what the tag labels.
 * @param height Tag height in world units.
 * @param pane Pane being drawn.
 * @returns Downward shift in world units.
 */
export function nametagCollaborationOverflow(
  position: THREE.Vector3,
  base: THREE.Vector3,
  height: number,
  pane: NametagCollaborationPane,
): number {
  nametagUp.setFromMatrixColumn(pane.camera.matrixWorld, 1).normalize();
  const floor = nametagBase.copy(base).project(pane.camera);
  if (floor.z > 1 || floor.z < -1 || Math.abs(floor.x) > 1 || floor.y > 1) return 0;
  const top = nametagTop.copy(position).addScaledVector(nametagUp, height).project(pane.camera);
  const edge = 1 - (2 * NAMETAG_COLLABORATION_PRESENCE_EDGE_PX) / pane.pixels;
  const overflow = ((top.y - edge) * pane.pixels) / 2;
  const room = Math.max(0, nametagBase.copy(position).sub(base).dot(nametagUp));
  return THREE.MathUtils.clamp(overflow * pane.perPixel, 0, room);
}

/**
 * Draws the tag: a rounded pill in the member color with a readable name.
 *
 * @param canvas Target canvas.
 * @param name Display name.
 * @param color Member color.
 * @returns Width over height.
 */
export function nametagCollaborationDraw(canvas: HTMLCanvasElement, name: string, color: number): number {
  const height = NAMETAG_COLLABORATION_PRESENCE_HEIGHT_PX * NAMETAG_COLLABORATION_PRESENCE_SCALE;
  const context = canvas.getContext('2d');
  const measured = context === null ? name.length * 14 : nametagCollaborationMeasure(context, name);
  canvas.width = Math.ceil(measured + height);
  canvas.height = height;
  if (context === null) return canvas.width / canvas.height;
  context.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  context.beginPath();
  context.roundRect(0, 0, canvas.width, height, height / 2);
  context.fill();
  context.font = NAMETAG_COLLABORATION_PRESENCE_FONT;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = nametagCollaborationInk(color);
  context.fillText(name, canvas.width / 2, height / 2 + 1);
  return canvas.width / canvas.height;
}

/**
 * Measures the name in the tag font.
 *
 * @param context Canvas context.
 * @param name Display name.
 * @returns Width in canvas pixels.
 */
function nametagCollaborationMeasure(context: CanvasRenderingContext2D, name: string): number {
  context.font = NAMETAG_COLLABORATION_PRESENCE_FONT;
  return context.measureText(name).width;
}

/**
 * Picks dark or white text for a background.
 *
 * @param color Background color.
 * @returns CSS color.
 */
export function nametagCollaborationInk(color: number): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#111827' : '#ffffff';
}
