import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { paintCanvasFrameFromPlane } from '@/paint/canvas/paint_canvas_frame.js';
import { PaintTileRaster } from '@/paint/raster/paint_tile_raster.js';
import { PAINT_IMAGE_SOURCE_NONE, type PaintImageSource } from '@/paint/raster/paint_image.js';
import { PaintDecalLayer, type PaintDecalSpec, paintDecalEdge } from '@/paint/decal/paint_decal_layer.js';
import { testFloorStroke } from '../paint_test_strokes.js';

/** A floor at y = 1 facing up. */
const floor = paintCanvasFrameFromPlane(new THREE.Vector3(0, 1, 0), 1);

/** Plain white normal decal covering everything, no fades. */
const SPEC: PaintDecalSpec = {
  textureId: '',
  color: [1, 1, 1],
  blend: 'normal',
  opacity: 1,
  order: 1,
  edgeFade: 0,
  angleFade: false,
};

/**
 * Returns a transform mapping brush-local points into a decal box centered at
 * `center` with `size`, unrotated.
 *
 * @param center Box center.
 * @param size Box size.
 * @returns Brush-to-decal transform.
 */
function boxAt(center: THREE.Vector3, size: THREE.Vector3): THREE.Matrix4 {
  return new THREE.Matrix4().compose(center, new THREE.Quaternion(), size).invert();
}

/**
 * Prepares floor tile 0,0, optionally painted with one red dab in its middle.
 *
 * @param painted True to paint the red dab.
 * @returns Raster.
 */
function floorTile(painted = false): PaintTileRaster {
  const raster = new PaintTileRaster();
  raster.prepare(floor, 0, 0, 1);
  const middle = new THREE.Vector3().fromArray(raster.points, (32 * raster.size + 32) * 3);
  raster.rasterStrokes(
    painted ? [testFloorStroke('s', 1, [[middle.x, middle.y, middle.z]])] : [],
    PAINT_IMAGE_SOURCE_NONE,
  );
  raster.resolvePaint();
  return raster;
}

/**
 * Returns [A, B] of one channel at a window texel.
 *
 * @param raster Raster.
 * @param x Window x.
 * @param y Window y.
 * @param channel Channel 0..2.
 * @returns Multiplier and offset.
 */
function affine(raster: PaintTileRaster, x: number, y: number, channel = 0): [number, number] {
  const index = (y * raster.size + x) * 3 + channel;
  return [raster.affineA[index] ?? NaN, raster.affineB[index] ?? NaN];
}

/** A large box around the floor tile. */
const wide = boxAt(new THREE.Vector3(0, 1, 0), new THREE.Vector3(100, 2, 100));
const up = new THREE.Vector3(0, 1, 0);

describe('Paint decal layer', () => {
  it('covers the floor with its color inside the box', () => {
    const raster = floorTile();
    const layer = new PaintDecalLayer({ ...SPEC, color: [0.5, 0.25, 1] }, wide, up, PAINT_IMAGE_SOURCE_NONE);
    expect(layer.composite(raster)).toBe(false);
    expect(affine(raster, 10, 10, 0)[0]).toBeCloseTo(0);
    expect(affine(raster, 10, 10, 0)[1]).toBeCloseTo(0.5);
    expect(affine(raster, 10, 10, 1)[1]).toBeCloseTo(0.25);
  });

  it('leaves texels outside the box alone', () => {
    const raster = floorTile();
    const far = boxAt(new THREE.Vector3(500, 1, 500), new THREE.Vector3(1, 1, 1));
    new PaintDecalLayer(SPEC, far, up, PAINT_IMAGE_SOURCE_NONE).composite(raster);
    expect(raster.isIdentity()).toBe(true);
  });

  it('skips faces turned away from the projection', () => {
    const raster = floorTile();
    new PaintDecalLayer(SPEC, wide, new THREE.Vector3(0, -1, 0), PAINT_IMAGE_SOURCE_NONE).composite(raster);
    expect(raster.isIdentity()).toBe(true);
  });

  it('fades steep faces with Angle Fade but not without it', () => {
    const tilted = new THREE.Vector3(1, 0.3, 0).normalize();
    const faded = floorTile();
    new PaintDecalLayer({ ...SPEC, angleFade: true }, wide, tilted, PAINT_IMAGE_SOURCE_NONE).composite(faded);
    const sharp = floorTile();
    new PaintDecalLayer(SPEC, wide, tilted, PAINT_IMAGE_SOURCE_NONE).composite(sharp);
    expect(affine(faded, 10, 10)[1]).toBeGreaterThan(0);
    expect(affine(faded, 10, 10)[1]).toBeLessThan(0.5);
    expect(affine(sharp, 10, 10)[1]).toBeCloseTo(1);
  });

  it('multiplies over the paint when its order is positive', () => {
    const raster = floorTile(true);
    new PaintDecalLayer(
      { ...SPEC, blend: 'multiply', color: [0.5, 0.5, 0.5] },
      wide,
      up,
      PAINT_IMAGE_SOURCE_NONE,
    ).composite(raster);
    // Red paint (A 0, B 1) darkened by half.
    expect(affine(raster, 32, 32)[0]).toBeCloseTo(0);
    expect(affine(raster, 32, 32)[1]).toBeCloseTo(0.5);
    // Bare floor gets base × 0.5.
    expect(affine(raster, 2, 2)[0]).toBeCloseTo(0.5);
  });

  it('stays under the paint when its order is negative', () => {
    const raster = floorTile(true);
    new PaintDecalLayer({ ...SPEC, order: -1, color: [0, 0, 1] }, wide, up, PAINT_IMAGE_SOURCE_NONE).composite(raster);
    // The opaque red dab hides the blue decal; bare floor turns blue.
    expect(affine(raster, 32, 32, 0)).toEqual([0, 1]);
    expect(affine(raster, 32, 32, 2)[1]).toBeCloseTo(0);
    expect(affine(raster, 2, 2, 2)[1]).toBeCloseTo(1);
  });

  it('waits for its image and then uses its alpha as the mask', () => {
    const raster = floorTile();
    const missing: PaintImageSource = { image: () => null };
    expect(new PaintDecalLayer({ ...SPEC, textureId: 't' }, wide, up, missing).composite(raster)).toBe(true);
    const half: PaintImageSource = {
      image: () => ({ width: 1, height: 1, data: new Uint8ClampedArray([255, 0, 0, 128]) }),
    };
    expect(new PaintDecalLayer({ ...SPEC, textureId: 't' }, wide, up, half).composite(raster)).toBe(false);
    expect(affine(raster, 10, 10, 0)[1]).toBeCloseTo(128 / 255, 2);
    expect(affine(raster, 10, 10, 1)[1]).toBeCloseTo(0);
  });

  it('fades out toward the box sides', () => {
    expect(paintDecalEdge(new THREE.Vector3(0, 0, 0), 0.1)).toBe(1);
    expect(paintDecalEdge(new THREE.Vector3(0.6, 0, 0), 0.1)).toBe(0);
    const near = paintDecalEdge(new THREE.Vector3(0.47, 0, 0), 0.1);
    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThan(1);
    expect(paintDecalEdge(new THREE.Vector3(0.49, 0, 0), 0)).toBe(1);
  });
});
