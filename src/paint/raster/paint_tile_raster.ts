import * as THREE from 'three';
import { PAINT_PAGE_TEXELS, PAINT_TEXELS_PER_UNIT, PAINT_TILE_SLOT_TEXELS } from '@/paint/paint_constants.js';
import { type PaintCanvasFrame, paintCanvasUnproject } from '@/paint/canvas/paint_canvas_frame.js';
import { paintCanvasTileWindowStart } from '@/paint/canvas/paint_canvas_tile.js';
import { PAINT_DAB_STRIDE, type PaintStroke, paintStrokeDabCount } from '@/paint/stroke/paint_stroke.js';
import { paintShapeFind } from '@/paint/shape/paint_shape_catalog.js';
import { paintSmoothstep } from '@/paint/shape/paint_shape.js';
import { type PaintImageSource, paintImageMaskValue, paintImageSample } from './paint_image.js';
import { paintStrokeBounds } from '@/paint/stroke/paint_stroke_bounds.js';

/** Shape id of strokes that print a texture image. */
export const PAINT_SHAPE_IMAGE_ID = 'image';

/** Dabs fade out on faces turned further than this from the dab (cosine). */
const PAINT_FACING_MIN = 0.3;
/** Dabs reach full strength on faces turned closer than this (cosine). */
const PAINT_FACING_FULL = 0.6;
/** Fraction of the radius above or below the surface where dabs start to fade. */
const PAINT_DEPTH_FADE_START = 0.5;
/** Values this close to identity count as unpainted. */
const PAINT_IDENTITY_EPSILON = 0.5 / 255;

/** A layer composited over the paint of a tile, such as a decal volume. */
export interface PaintTileLayer {
  /**
   * Composites the layer into the raster's affine maps.
   *
   * @param raster Prepared raster with paint already resolved.
   * @returns True when the layer still waits for an image.
   */
  composite(raster: PaintTileRaster): boolean;
}

/**
 * Rasterizes one tile of one face canvas: strokes into premultiplied paint,
 * then paint and layers into the affine maps `base·A + B` that the atlas
 * stores. One instance is reused for every tile.
 */
export class PaintTileRaster {
  /** Texels along one side of the tile window, gutters included. */
  readonly size = PAINT_TILE_SLOT_TEXELS;
  /** Texels in the tile window. */
  readonly count = PAINT_TILE_SLOT_TEXELS * PAINT_TILE_SLOT_TEXELS;
  /** Brush-local positions of texel centers, xyz each. */
  readonly points = new Float32Array(this.count * 3);
  /** Canvas coordinates of texel centers in texels, st each. */
  readonly canvas = new Float32Array(this.count * 2);
  /** Premultiplied paint, rgba each. */
  readonly paint = new Float32Array(this.count * 4);
  /** Per-stroke coverage scratch. */
  readonly coverage = new Float32Array(this.count);
  /** Affine multipliers, rgb each. */
  readonly affineA = new Float32Array(this.count * 3);
  /** Affine offsets, rgb each. */
  readonly affineB = new Float32Array(this.count * 3);
  /** Brush-local unit normal of the face. */
  readonly normal = new THREE.Vector3();
  /** Brush-local bounds of the tile window. */
  readonly bounds = new THREE.Box3();

  private frame: PaintCanvasFrame | null = null;
  private readonly sample = new Float32Array(4);
  private readonly scratchPoint = new THREE.Vector3();

  /**
   * Prepares texel positions for a tile.
   *
   * @param frame Face canvas frame.
   * @param tileX Tile x.
   * @param tileY Tile y.
   * @param facingSign 1 when the face shows its plane normal, -1 when the
   *   result shows it flipped (subtracted brushes).
   */
  prepare(frame: PaintCanvasFrame, tileX: number, tileY: number, facingSign: number = 1): void {
    this.frame = frame;
    this.normal.copy(frame.normal).multiplyScalar(facingSign < 0 ? -1 : 1);
    this.bounds.makeEmpty();
    const startS = paintCanvasTileWindowStart(tileX);
    const startT = paintCanvasTileWindowStart(tileY);
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const index = y * this.size + x;
        const s = startS + x + 0.5;
        const t = startT + y + 0.5;
        paintCanvasUnproject(frame, s, t, this.scratchPoint);
        this.points[index * 3] = this.scratchPoint.x;
        this.points[index * 3 + 1] = this.scratchPoint.y;
        this.points[index * 3 + 2] = this.scratchPoint.z;
        this.canvas[index * 2] = s;
        this.canvas[index * 2 + 1] = t;
      }
    }
    for (const index of [0, this.size - 1, this.count - this.size, this.count - 1]) {
      this.scratchPoint.fromArray(this.points, index * 3);
      this.bounds.expandByPoint(this.scratchPoint);
    }
    this.paint.fill(0);
  }

  /**
   * Rasterizes strokes in order into the paint buffer.
   *
   * @param strokes Strokes sorted by order.
   * @param images Image source for stencils and image stamps.
   * @returns True when a needed image is not available yet.
   */
  rasterStrokes(strokes: readonly PaintStroke[], images: PaintImageSource): boolean {
    let pending = false;
    for (const stroke of strokes) {
      if (!paintStrokeBounds(stroke).intersectsBox(this.bounds)) continue;
      if (this.rasterStroke(stroke, images)) pending = true;
    }
    return pending;
  }

  /** Converts the paint buffer into the affine maps. */
  resolvePaint(): void {
    for (let index = 0; index < this.count; index++) {
      const alpha = this.paint[index * 4 + 3] ?? 0;
      for (let channel = 0; channel < 3; channel++) {
        this.affineA[index * 3 + channel] = 1 - alpha;
        this.affineB[index * 3 + channel] = this.paint[index * 4 + channel] ?? 0;
      }
    }
  }

  /**
   * Composites layers over the resolved paint.
   *
   * @param layers Layers in order.
   * @returns True when a layer waits for an image.
   */
  compositeLayers(layers: readonly PaintTileLayer[]): boolean {
    let pending = false;
    for (const layer of layers) if (layer.composite(this)) pending = true;
    return pending;
  }

  /**
   * Returns whether the affine maps leave every texel unchanged.
   *
   * @returns True when nothing is painted.
   */
  isIdentity(): boolean {
    for (let index = 0; index < this.count * 3; index++) {
      if ((this.affineA[index] ?? 1) < 1 - PAINT_IDENTITY_EPSILON) return false;
      if ((this.affineB[index] ?? 0) > PAINT_IDENTITY_EPSILON) return false;
    }
    return true;
  }

  /**
   * Writes the affine maps into an atlas page buffer: A in the left half, B in
   * the right half.
   *
   * @param data Page RGBA bytes, two page widths wide.
   * @param slotX Slot column.
   * @param slotY Slot row.
   */
  writeSlot(data: Uint8Array, slotX: number, slotY: number): void {
    const rowTexels = PAINT_PAGE_TEXELS * 2;
    const originX = slotX * this.size;
    const originY = slotY * this.size;
    for (let y = 0; y < this.size; y++) {
      let rowA = ((originY + y) * rowTexels + originX) * 4;
      let rowB = rowA + PAINT_PAGE_TEXELS * 4;
      for (let x = 0; x < this.size; x++) {
        const index = (y * this.size + x) * 3;
        for (let channel = 0; channel < 3; channel++) {
          data[rowA + channel] = paintUnitByte(this.affineA[index + channel] ?? 1);
          data[rowB + channel] = paintUnitByte(this.affineB[index + channel] ?? 0);
        }
        data[rowA + 3] = 255;
        data[rowB + 3] = 255;
        rowA += 4;
        rowB += 4;
      }
    }
  }

  /**
   * Rasterizes one stroke.
   *
   * @param stroke Stroke.
   * @param images Image source.
   * @returns True when an image is missing.
   */
  private rasterStroke(stroke: PaintStroke, images: PaintImageSource): boolean {
    const image = stroke.shape === PAINT_SHAPE_IMAGE_ID ? images.image(stroke.stampTextureId) : null;
    if (stroke.shape === PAINT_SHAPE_IMAGE_ID && image === null) return true;
    const stencil = stroke.stencilTextureId === '' ? null : images.image(stroke.stencilTextureId);
    const pending = stroke.stencilTextureId !== '' && stencil === null;
    const perDab = image !== null;
    const red = ((stroke.color >> 16) & 255) / 255;
    const green = ((stroke.color >> 8) & 255) / 255;
    const blue = (stroke.color & 255) / 255;
    const shape = paintShapeFind(stroke.shape);
    const radius = Math.max(1e-4, stroke.radius);
    const edge = 1.5 / (radius * PAINT_TEXELS_PER_UNIT);
    const frame = this.frame;
    if (frame === null) return pending;
    if (!perDab) this.coverage.fill(0);
    const dabCount = paintStrokeDabCount(stroke);
    const dabs = stroke.dabs;
    const normalX = this.normal.x;
    const normalY = this.normal.y;
    const normalZ = this.normal.z;
    const windowS = this.canvas[0] ?? 0;
    const windowT = this.canvas[1] ?? 0;
    for (let dab = 0; dab < dabCount; dab++) {
      const base = dab * PAINT_DAB_STRIDE;
      const centerX = dabs[base] ?? 0;
      const centerY = dabs[base + 1] ?? 0;
      const centerZ = dabs[base + 2] ?? 0;
      const forwardX = dabs[base + 3] ?? 0;
      const forwardY = dabs[base + 4] ?? 0;
      const forwardZ = dabs[base + 5] ?? 1;
      const upX = dabs[base + 6] ?? 0;
      const upY = dabs[base + 7] ?? 1;
      const upZ = dabs[base + 8] ?? 0;
      const facing = -(normalX * forwardX + normalY * forwardY + normalZ * forwardZ);
      if (facing <= PAINT_FACING_MIN) continue;
      const planeDistance =
        frame.normal.x * centerX + frame.normal.y * centerY + frame.normal.z * centerZ - frame.offset;
      if (Math.abs(planeDistance) >= radius) continue;
      const facingWeight = paintSmoothstep(PAINT_FACING_MIN, PAINT_FACING_FULL, facing);
      const rightX = forwardY * upZ - forwardZ * upY;
      const rightY = forwardZ * upX - forwardX * upZ;
      const rightZ = forwardX * upY - forwardY * upX;
      const centerS =
        (centerX * frame.tangentS.x + centerY * frame.tangentS.y + centerZ * frame.tangentS.z) * PAINT_TEXELS_PER_UNIT;
      const centerT =
        (centerX * frame.tangentT.x + centerY * frame.tangentT.y + centerZ * frame.tangentT.z) * PAINT_TEXELS_PER_UNIT;
      const reach = (radius * PAINT_TEXELS_PER_UNIT) / facing + 1;
      const minX = Math.max(0, Math.floor(centerS - reach - windowS));
      const maxX = Math.min(this.size - 1, Math.ceil(centerS + reach - windowS));
      const minY = Math.max(0, Math.floor(centerT - reach - windowT));
      const maxY = Math.min(this.size - 1, Math.ceil(centerT + reach - windowT));
      if (minX > maxX || minY > maxY) continue;
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const index = y * this.size + x;
          const offsetX = (this.points[index * 3] ?? 0) - centerX;
          const offsetY = (this.points[index * 3 + 1] ?? 0) - centerY;
          const offsetZ = (this.points[index * 3 + 2] ?? 0) - centerZ;
          const dabX = (offsetX * rightX + offsetY * rightY + offsetZ * rightZ) / radius;
          const dabY = (offsetX * upX + offsetY * upY + offsetZ * upZ) / radius;
          if (dabX <= -1 || dabX >= 1 || dabY <= -1 || dabY >= 1) continue;
          const depth = Math.abs(offsetX * forwardX + offsetY * forwardY + offsetZ * forwardZ) / radius;
          const depthWeight = 1 - paintSmoothstep(PAINT_DEPTH_FADE_START, 1, depth);
          if (depthWeight <= 0) continue;
          if (perDab) {
            paintImageSample(image, (dabX + 1) * 0.5, (dabY + 1) * 0.5, this.sample);
            const alpha =
              (this.sample[3] ?? 0) *
              depthWeight *
              facingWeight *
              stroke.opacity *
              this.stencilAt(stencil, stroke, index);
            this.compositeTexel(
              stroke,
              index,
              alpha,
              (this.sample[0] ?? 0) * red,
              (this.sample[1] ?? 0) * green,
              (this.sample[2] ?? 0) * blue,
            );
            continue;
          }
          const mask = shape.coverage(dabX, dabY, edge, stroke.hardness, dab) * depthWeight * facingWeight;
          if (mask > (this.coverage[index] ?? 0)) this.coverage[index] = mask;
        }
      }
    }
    if (!perDab) {
      for (let index = 0; index < this.count; index++) {
        const mask = this.coverage[index] ?? 0;
        if (mask <= 0) continue;
        this.compositeTexel(
          stroke,
          index,
          mask * stroke.opacity * this.stencilAt(stencil, stroke, index),
          red,
          green,
          blue,
        );
      }
    }
    return pending;
  }

  /**
   * Returns the stencil mask at a texel.
   *
   * @param stencil Stencil image, or null for none.
   * @param stroke Stroke.
   * @param index Texel index.
   * @returns Mask 0..1.
   */
  private stencilAt(stencil: ReturnType<PaintImageSource['image']>, stroke: PaintStroke, index: number): number {
    if (stencil === null) return stroke.stencilTextureId === '' ? 1 : 0;
    const repeat = stroke.stencilScale * PAINT_TEXELS_PER_UNIT;
    paintImageSample(
      stencil,
      (this.canvas[index * 2] ?? 0) / repeat,
      (this.canvas[index * 2 + 1] ?? 0) / repeat,
      this.sample,
    );
    return paintImageMaskValue(this.sample);
  }

  /**
   * Composites a color over (or erases) one texel of the paint buffer.
   *
   * @param stroke Stroke.
   * @param index Texel index.
   * @param alpha Coverage times opacity.
   * @param red Red 0..1.
   * @param green Green 0..1.
   * @param blue Blue 0..1.
   */
  private compositeTexel(
    stroke: PaintStroke,
    index: number,
    alpha: number,
    red: number,
    green: number,
    blue: number,
  ): void {
    if (alpha <= 0) return;
    const clamped = Math.min(1, alpha);
    const keep = 1 - clamped;
    const offset = index * 4;
    if (stroke.mode === 'erase') {
      for (let channel = 0; channel < 4; channel++)
        this.paint[offset + channel] = (this.paint[offset + channel] ?? 0) * keep;
      return;
    }
    this.paint[offset] = red * clamped + (this.paint[offset] ?? 0) * keep;
    this.paint[offset + 1] = green * clamped + (this.paint[offset + 1] ?? 0) * keep;
    this.paint[offset + 2] = blue * clamped + (this.paint[offset + 2] ?? 0) * keep;
    this.paint[offset + 3] = clamped + (this.paint[offset + 3] ?? 0) * keep;
  }
}

/**
 * Converts 0..1 to a byte with rounding and clamping.
 *
 * @param value Value.
 * @returns Byte.
 */
function paintUnitByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value * 255)));
}
