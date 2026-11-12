import * as THREE from 'three';
import type { PaintTileLayer, PaintTileRaster } from '@/paint/raster/paint_tile_raster.js';
import { type PaintImageSource, paintImageSample } from '@/paint/raster/paint_image.js';
import {
  type PaintBlendMode,
  paintAffineCompose,
  paintAffineComposeUnder,
  paintBlendAffine,
} from '@/paint/raster/paint_blend_mode.js';
import { paintSmoothstep } from '@/paint/shape/paint_shape.js';

/** Surfaces facing the projection less than this (cosine) get nothing. */
export const PAINT_DECAL_FACING_MIN = 0.2;
/** With Angle Fade, surfaces reach full strength from this facing (cosine). */
const PAINT_DECAL_FACING_FULL = 0.5;

/** What a decal paints, read from its volume. */
export interface PaintDecalSpec {
  /** Texture id, or empty for a plain color. */
  readonly textureId: string;
  /** Tint as 0..1 rgb. */
  readonly color: readonly [number, number, number];
  readonly blend: PaintBlendMode;
  /** Strength 0..1. */
  readonly opacity: number;
  /** Layer order; hand painting is 0, lower layers apply first. */
  readonly order: number;
  /** Fade width toward the box sides, as a share of the box size (0..0.5). */
  readonly edgeFade: number;
  /** True fades surfaces turned away from the projection. */
  readonly angleFade: boolean;
}

/**
 * One decal volume as a paint layer of one brush. Texel positions arrive in the
 * brush's local space; `brushToDecal` maps them into the volume's unit box,
 * where x and z pick the image and the projection runs down -y.
 */
export class PaintDecalLayer implements PaintTileLayer {
  private readonly sample = new Float32Array(4);
  private readonly affine = new Float32Array(2);
  private readonly point = new THREE.Vector3();

  /**
   * @param spec Decal settings.
   * @param brushToDecal Brush-local to unit-box transform.
   * @param up Brush-local unit direction the decal faces (its +Y).
   * @param images Image source.
   */
  constructor(
    readonly spec: PaintDecalSpec,
    private readonly brushToDecal: THREE.Matrix4,
    private readonly up: THREE.Vector3,
    private readonly images: PaintImageSource,
  ) {}

  /**
   * Composites the decal into a tile: above the paint for positive orders,
   * underneath it for negative ones.
   *
   * @param raster Prepared raster with paint already resolved.
   * @returns True while the image is not available.
   */
  composite(raster: PaintTileRaster): boolean {
    const spec = this.spec;
    const image = spec.textureId === '' ? null : this.images.image(spec.textureId);
    if (spec.textureId !== '' && image === null) return true;
    const facing = raster.normal.dot(this.up);
    if (facing < PAINT_DECAL_FACING_MIN || spec.opacity <= 0) return false;
    const angle = spec.angleFade ? paintSmoothstep(PAINT_DECAL_FACING_MIN, PAINT_DECAL_FACING_FULL, facing) : 1;
    const strength = spec.opacity * angle;
    const compose = spec.order < 0 ? paintAffineComposeUnder : paintAffineCompose;
    for (let index = 0; index < raster.count; index++) {
      this.point.fromArray(raster.points, index * 3).applyMatrix4(this.brushToDecal);
      const edge = paintDecalEdge(this.point, spec.edgeFade);
      if (edge <= 0) continue;
      let alpha = strength * edge;
      let red = spec.color[0];
      let green = spec.color[1];
      let blue = spec.color[2];
      if (image !== null) {
        paintImageSample(image, this.point.x + 0.5, 0.5 - this.point.z, this.sample);
        red *= this.sample[0] ?? 1;
        green *= this.sample[1] ?? 1;
        blue *= this.sample[2] ?? 1;
        alpha *= this.sample[3] ?? 1;
      }
      if (alpha <= 0) continue;
      const channels = [red, green, blue];
      for (let channel = 0; channel < 3; channel++) {
        paintBlendAffine(spec.blend, channels[channel] ?? 0, alpha, this.affine);
        compose(raster.affineA, raster.affineB, index * 3 + channel, this.affine[0] ?? 1, this.affine[1] ?? 0);
      }
    }
    return false;
  }
}

/**
 * Returns how strongly a point inside the unit box is covered: 1 well inside, 0
 * outside, fading over `fade` toward every side.
 *
 * @param point Point in unit-box coordinates.
 * @param fade Fade width 0..0.5.
 * @returns Coverage 0..1.
 */
export function paintDecalEdge(point: THREE.Vector3, fade: number): number {
  const inside = 0.5 - Math.max(Math.abs(point.x), Math.abs(point.y), Math.abs(point.z));
  if (inside < 0) return 0;
  if (fade <= 0) return 1;
  return paintSmoothstep(0, fade, inside);
}
