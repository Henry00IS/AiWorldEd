import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { paintCanvasFrameFromPlane } from '@/paint/canvas/paint_canvas_frame.js';
import { PaintTileRaster } from '@/paint/raster/paint_tile_raster.js';
import { PAINT_IMAGE_SOURCE_NONE, type PaintImage, type PaintImageSource } from '@/paint/raster/paint_image.js';
import { PAINT_TEXELS_PER_UNIT, PAINT_TILE_GUTTER_TEXELS, PAINT_TILE_SLOT_TEXELS } from '@/paint/paint_constants.js';
import { testFloorStroke } from '../paint_test_strokes.js';

const floor = paintCanvasFrameFromPlane(new THREE.Vector3(0, 1, 0), 1);

/**
 * Returns the brush-local floor point at canvas texel coordinates.
 *
 * @param s Canvas s.
 * @param t Canvas t.
 * @returns Point as a tuple.
 */
function floorPoint(s: number, t: number): [number, number, number] {
  const point = new THREE.Vector3()
    .copy(floor.normal)
    .multiplyScalar(floor.offset)
    .addScaledVector(floor.tangentS, s / PAINT_TEXELS_PER_UNIT)
    .addScaledVector(floor.tangentT, t / PAINT_TEXELS_PER_UNIT);
  return [point.x, point.y, point.z];
}

/**
 * Returns [A, B] of the red channel at a window texel.
 *
 * @param raster Raster.
 * @param x Window x.
 * @param y Window y.
 * @returns Red multiplier and offset.
 */
function red(raster: PaintTileRaster, x: number, y: number): [number, number] {
  const index = (y * raster.size + x) * 3;
  return [raster.affineA[index] ?? NaN, raster.affineB[index] ?? NaN];
}

/**
 * Rasterizes strokes on floor tile 0,0.
 *
 * @param strokes Strokes.
 * @param images Image source.
 * @param facingSign Facing sign.
 * @returns Raster and pending flag.
 */
function bake(
  strokes: Parameters<PaintTileRaster['rasterStrokes']>[0],
  images: PaintImageSource = PAINT_IMAGE_SOURCE_NONE,
  facingSign: number = 1,
): { raster: PaintTileRaster; pending: boolean } {
  const raster = new PaintTileRaster();
  raster.prepare(floor, 0, 0, facingSign);
  const pending = raster.rasterStrokes(strokes, images);
  raster.resolvePaint();
  return { raster, pending };
}

describe('Paint tile raster', () => {
  it('paints the dab color under the dab and nothing far away', () => {
    const { raster } = bake([testFloorStroke('s', 1, [floorPoint(31.5, 31.5)])]);
    expect(red(raster, 32, 32)).toEqual([0, 1]);
    expect(red(raster, 2, 2)).toEqual([1, 0]);
    expect(raster.isIdentity()).toBe(false);
  });

  it('erases earlier paint', () => {
    const point = floorPoint(31.5, 31.5);
    const { raster } = bake([
      testFloorStroke('a', 1, [point]),
      testFloorStroke('b', 2, [point], { mode: 'erase', radius: 0.2 }),
    ]);
    expect(raster.isIdentity()).toBe(true);
  });

  it('applies opacity once per stroke where its dabs overlap', () => {
    const { raster } = bake([
      testFloorStroke('s', 1, [floorPoint(31.5, 31.5), floorPoint(32.5, 31.5)], { opacity: 0.5 }),
    ]);
    const [multiplier, offset] = red(raster, 32, 32);
    expect(multiplier).toBeCloseTo(0.5);
    expect(offset).toBeCloseTo(0.5);
  });

  it('ignores faces turned away and dabs far off the plane', () => {
    expect(
      bake([testFloorStroke('s', 1, [floorPoint(31.5, 31.5)])], PAINT_IMAGE_SOURCE_NONE, -1).raster.isIdentity(),
    ).toBe(true);
    const [x, y, z] = floorPoint(31.5, 31.5);
    expect(bake([testFloorStroke('s', 1, [[x, y + 0.5, z]])]).raster.isIdentity()).toBe(true);
  });

  it('rasterizes gutters exactly like the neighbouring tile content', () => {
    const stroke = testFloorStroke('s', 1, [floorPoint(62, 30)], { hardness: 0.3 });
    const left = new PaintTileRaster();
    left.prepare(floor, 0, 0);
    left.rasterStrokes([stroke], PAINT_IMAGE_SOURCE_NONE);
    left.resolvePaint();
    const right = new PaintTileRaster();
    right.prepare(floor, 1, 0);
    right.rasterStrokes([stroke], PAINT_IMAGE_SOURCE_NONE);
    right.resolvePaint();
    for (let y = 20; y < 40; y++) {
      expect(red(left, 63, y)[0]).toBeCloseTo(red(right, 1, y)[0], 6);
      expect(red(left, 62, y)[0]).toBeCloseTo(red(right, 0, y)[0], 6);
    }
  });

  it('masks strokes with a surface stencil and waits for missing images', () => {
    const stencil: PaintImage = { width: 2, height: 1, data: new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255]) };
    const images: PaintImageSource = { image: (id) => (id === 'stripes' ? stencil : null) };
    const stroke = testFloorStroke('s', 1, [floorPoint(31.5, 31.5)], {
      stencilTextureId: 'stripes',
      stencilScale: 64 / 128,
      radius: 0.3,
    });
    const { raster, pending } = bake([stroke], images);
    expect(pending).toBe(false);
    const values = new Set<number>();
    for (let x = 10; x < 54; x++) values.add(Math.round(red(raster, x, 32)[0] * 4));
    expect(values.has(0)).toBe(true);
    expect(values.has(4)).toBe(true);
    const missing = bake([testFloorStroke('s', 1, [floorPoint(31.5, 31.5)], { stencilTextureId: 'gone' })], images);
    expect(missing.pending).toBe(true);
    expect(missing.raster.isIdentity()).toBe(true);
  });

  it('prints image stamps tinted by the stroke color', () => {
    const image: PaintImage = { width: 1, height: 1, data: new Uint8Array([128, 255, 255, 255]) };
    const images: PaintImageSource = { image: () => image };
    const stroke = testFloorStroke('s', 1, [floorPoint(31.5, 31.5)], {
      shape: 'image',
      stampTextureId: 'logo',
      color: 0xffffff,
    });
    const { raster } = bake([stroke], images);
    expect(red(raster, 32, 32)[1]).toBeCloseTo(128 / 255, 2);
    expect(bake([stroke]).pending).toBe(true);
  });

  it('writes A to the left half and B to the right half of a slot', () => {
    const { raster } = bake([testFloorStroke('s', 1, [floorPoint(31.5, 31.5)])]);
    const data = new Uint8Array(2048 * 1024 * 4);
    raster.writeSlot(data, 1, 2);
    const inner = PAINT_TILE_GUTTER_TEXELS + 31;
    const row = (2 * PAINT_TILE_SLOT_TEXELS + inner) * 2048 * 4;
    const left = row + (PAINT_TILE_SLOT_TEXELS + inner) * 4;
    const right = left + 1024 * 4;
    expect(Array.from(data.subarray(left, left + 4))).toEqual([0, 0, 0, 255]);
    expect(Array.from(data.subarray(right, right + 4))).toEqual([255, 0, 0, 255]);
  });
});
