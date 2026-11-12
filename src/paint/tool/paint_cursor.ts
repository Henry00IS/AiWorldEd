import * as THREE from 'three';
import { paintShapeFind } from '@/paint/shape/paint_shape_catalog.js';
import { paintImageSample, type PaintImage } from '@/paint/raster/paint_image.js';
import type { PaintToolMode } from './paint_tool_settings.js';

/** Side of the shape preview texture in texels. */
const PAINT_CURSOR_SHAPE_TEXELS = 96;

/** Length of the press pulse and the stamp ripple in milliseconds. */
const PAINT_CURSOR_PULSE_MS = 160;
const PAINT_CURSOR_RIPPLE_MS = 360;

/** Draw order above the paint overlays and the scene. */
const PAINT_CURSOR_RENDER_ORDER = 1000;

/** What the cursor previews. */
export interface PaintCursorLook {
  /** Click mode. */
  readonly mode: PaintToolMode;
  /** Paint color 0xRRGGBB. */
  readonly color: number;
  /** Strength 0..1. */
  readonly opacity: number;
  /** Edge hardness 0..1. */
  readonly hardness: number;
  /** Shape id. */
  readonly shape: string;
  /** Stamp image, when the shape is an image. */
  readonly image: PaintImage | null;
}

const PAINT_CURSOR_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const PAINT_CURSOR_FRAGMENT = /* glsl */ `
uniform sampler2D uShape;
uniform vec3 uColor;
uniform float uMode;
uniform float uOpacity;
uniform float uHardness;
uniform float uRipple;
uniform float uRippleAlpha;
varying vec2 vUv;

float ringAt(float distanceToCenter, float radius, float width) {
  float edge = fwidth(distanceToCenter);
  return 1.0 - smoothstep(width * 0.5, width * 0.5 + edge * 1.5, abs(distanceToCenter - radius));
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float d = length(p) * 1.25;
  float pixel = fwidth(d);
  float outline = ringAt(d, 1.0, pixel * 3.5);
  float core = ringAt(d, 1.0, pixel * 1.5);
  vec4 color = vec4(0.0);
  float shape = texture2D(uShape, clamp(p * 0.625 + 0.5, 0.0, 1.0)).r;
  if (uMode < 0.5) {
    color = vec4(uColor, shape * (0.18 + 0.32 * uOpacity));
  } else if (uMode < 1.5) {
    float angle = atan(p.y, p.x);
    float dash = step(0.0, sin(angle * 18.0));
    core *= dash;
    color = vec4(vec3(1.0), shape * 0.08);
  } else {
    float cross = (1.0 - smoothstep(pixel, pixel * 2.5, abs(p.x))) + (1.0 - smoothstep(pixel, pixel * 2.5, abs(p.y)));
    cross *= step(d, 0.35);
    color = vec4(uColor, step(d, 1.0) * 0.85);
    color = mix(color, vec4(1.0), clamp(cross, 0.0, 1.0));
  }
  float inner = ringAt(d, max(0.08, uHardness), pixel * 1.0) * 0.35 * step(uMode, 0.5);
  color = mix(color, vec4(vec3(1.0), 0.6), inner);
  color = mix(color, vec4(vec3(0.0), 0.55), outline * (1.0 - core));
  color = mix(color, vec4(vec3(1.0), 1.0), core);
  float ripple = ringAt(d, uRipple, pixel * 2.0) * uRippleAlpha;
  color = mix(color, vec4(uColor, 1.0), ripple);
  if (color.a <= 0.003) discard;
  gl_FragColor = color;
}
`;

/**
 * Brush cursor drawn on the surface under the pointer: the outline, the
 * hardness ring and a tinted preview of the stamp shape. It pulses when paint
 * lands and stamps send out a ripple, unless the user asked for reduced
 * motion.
 */
export class PaintCursor {
  readonly object: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly shapeTexture: THREE.DataTexture;
  private shapeKey = '';
  private shapeImage: PaintImage | null = null;
  private pulseStart = -Infinity;
  private rippleStart = -Infinity;
  private baseScale = 1;

  /**
   * Creates the cursor.
   *
   * @param reducedMotion Returns true while the user asks for reduced motion.
   * @param now Clock in milliseconds.
   */
  constructor(
    private readonly reducedMotion: () => boolean,
    private readonly now: () => number = () => performance.now(),
  ) {
    const data = new Uint8Array(PAINT_CURSOR_SHAPE_TEXELS * PAINT_CURSOR_SHAPE_TEXELS * 4);
    this.shapeTexture = new THREE.DataTexture(data, PAINT_CURSOR_SHAPE_TEXELS, PAINT_CURSOR_SHAPE_TEXELS);
    this.shapeTexture.magFilter = THREE.LinearFilter;
    this.shapeTexture.minFilter = THREE.LinearFilter;
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uShape: { value: this.shapeTexture },
        uColor: { value: new THREE.Color() },
        uMode: { value: 0 },
        uOpacity: { value: 1 },
        uHardness: { value: 0.7 },
        uRipple: { value: 1 },
        uRippleAlpha: { value: 0 },
      },
      vertexShader: PAINT_CURSOR_VERTEX,
      fragmentShader: PAINT_CURSOR_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.object = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.5), material);
    this.object.name = 'paint_cursor';
    this.object.renderOrder = PAINT_CURSOR_RENDER_ORDER;
    this.object.frustumCulled = false;
    this.object.visible = false;
    this.object.raycast = () => undefined;
    this.object.userData['editorHelper'] = true;
  }

  /**
   * Updates what the cursor previews.
   *
   * @param look Mode, color and shape.
   */
  setLook(look: PaintCursorLook): void {
    const uniforms = this.object.material.uniforms;
    (uniforms['uColor']?.value as THREE.Color).setHex(look.color);
    if (uniforms['uMode']) uniforms['uMode'].value = look.mode === 'paint' ? 0 : look.mode === 'erase' ? 1 : 2;
    if (uniforms['uOpacity']) uniforms['uOpacity'].value = look.opacity;
    if (uniforms['uHardness']) uniforms['uHardness'].value = look.hardness;
    const shape = look.mode === 'erase' ? 'round' : look.shape;
    const key = `${shape}|${look.hardness.toFixed(2)}`;
    if (key !== this.shapeKey || look.image !== this.shapeImage) this.drawShape(shape, look.hardness, look.image, key);
  }

  /**
   * Places the cursor on a surface.
   *
   * @param point World center.
   * @param normal World surface normal facing the viewer.
   * @param up World up of the stamp.
   * @param radius World radius.
   */
  place(point: THREE.Vector3, normal: THREE.Vector3, up: THREE.Vector3, radius: number): void {
    const z = normal.clone().normalize();
    const y = up.clone().addScaledVector(z, -up.dot(z));
    if (y.lengthSq() < 1e-10) y.set(Math.abs(z.y) < 0.9 ? 0 : 1, Math.abs(z.y) < 0.9 ? 1 : 0, 0);
    y.normalize();
    const x = new THREE.Vector3().crossVectors(y, z).normalize();
    y.crossVectors(z, x);
    this.object.matrixAutoUpdate = true;
    this.object.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    this.object.position.copy(point).addScaledVector(z, radius * 0.01);
    this.baseScale = radius;
    this.object.visible = true;
    this.animate();
  }

  /** Hides the cursor. */
  hide(): void {
    this.object.visible = false;
  }

  /**
   * Plays the feedback for paint landing.
   *
   * @param stamp True for a stamp, which also sends a ripple.
   */
  pulse(stamp: boolean): void {
    if (this.reducedMotion()) return;
    const now = this.now();
    if (now - this.pulseStart > PAINT_CURSOR_PULSE_MS * 0.5) this.pulseStart = now;
    if (stamp) this.rippleStart = now;
  }

  /** Advances the pulse and ripple; call every frame while visible. */
  animate(): void {
    const uniforms = this.object.material.uniforms;
    const now = this.now();
    const pulse = Math.max(0, 1 - (now - this.pulseStart) / PAINT_CURSOR_PULSE_MS);
    const scale = this.baseScale * (1 - 0.06 * Math.sin(pulse * Math.PI));
    this.object.scale.set(scale, scale, scale);
    const ripple = Math.min(1, Math.max(0, (now - this.rippleStart) / PAINT_CURSOR_RIPPLE_MS));
    if (uniforms['uRipple']) uniforms['uRipple'].value = 1 + ripple * 0.22;
    if (uniforms['uRippleAlpha']) uniforms['uRippleAlpha'].value = ripple >= 1 ? 0 : (1 - ripple) * 0.9;
  }

  /** Returns whether a pulse or ripple is still playing. */
  isAnimating(): boolean {
    const now = this.now();
    return now - this.pulseStart < PAINT_CURSOR_PULSE_MS || now - this.rippleStart < PAINT_CURSOR_RIPPLE_MS;
  }

  /** Frees GPU resources. */
  dispose(): void {
    this.object.removeFromParent();
    this.object.geometry.dispose();
    this.object.material.dispose();
    this.shapeTexture.dispose();
  }

  /**
   * Draws the shape preview into the shape texture.
   *
   * @param shapeId Shape id.
   * @param hardness Edge hardness.
   * @param image Stamp image, or null.
   * @param key Cache key.
   */
  private drawShape(shapeId: string, hardness: number, image: PaintImage | null, key: string): void {
    this.shapeKey = key;
    this.shapeImage = image;
    const shape = paintShapeFind(shapeId);
    const data = this.shapeTexture.image.data as Uint8Array;
    const size = PAINT_CURSOR_SHAPE_TEXELS;
    const sample = new Float32Array(4);
    const edge = 2 / size;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = ((x + 0.5) / size) * 2 - 1;
        const v = ((y + 0.5) / size) * 2 - 1;
        let value: number;
        if (image !== null) {
          paintImageSample(image, (u + 1) * 0.5, (v + 1) * 0.5, sample);
          value = sample[3] ?? 0;
        } else {
          value = shape.coverage(u, v, edge, hardness, 0);
        }
        const index = (y * size + x) * 4;
        const byte = Math.round(Math.max(0, Math.min(1, value)) * 255);
        data[index] = byte;
        data[index + 1] = byte;
        data[index + 2] = byte;
        data[index + 3] = 255;
      }
    }
    this.shapeTexture.needsUpdate = true;
  }
}
