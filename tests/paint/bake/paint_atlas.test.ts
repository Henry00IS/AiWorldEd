import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PaintAtlas, type PaintBakeBrush, type PaintBakeFace } from '@/paint/bake/paint_atlas.js';
import { PAINT_IMAGE_SOURCE_NONE } from '@/paint/raster/paint_image.js';
import { PAINT_PAGE_SLOT_COUNT } from '@/paint/paint_constants.js';
import type { PaintStroke } from '@/paint/stroke/paint_stroke.js';
import { testFloorStroke } from '../paint_test_strokes.js';

/**
 * Builds the top face of a 2×2×2 box at a height.
 *
 * @param height Plane height.
 * @returns Face.
 */
function topFace(height: number = 1): PaintBakeFace {
  return {
    faceIndex: 2,
    normal: new THREE.Vector3(0, 1, 0),
    offset: height,
    vertices: [
      new THREE.Vector3(-1, height, -1),
      new THREE.Vector3(1, height, -1),
      new THREE.Vector3(1, height, 1),
      new THREE.Vector3(-1, height, 1),
    ],
    facingSign: 1,
    layers: [],
    layerBounds: [],
  };
}

/**
 * Builds bake input.
 *
 * @param strokes Strokes.
 * @param face Face.
 * @returns Input.
 */
function brush(strokes: PaintStroke[], face: PaintBakeFace = topFace()): PaintBakeBrush {
  return { brushId: 'brush-1', faces: [face], strokes };
}

describe('Paint atlas', () => {
  const stroke = testFloorStroke('s', 1, [[0.1, 1, 0.1]]);

  it('allocates tiles only where paint lands', () => {
    const atlas = new PaintAtlas(PAINT_IMAGE_SOURCE_NONE);
    const result = atlas.bakeBrush(brush([stroke]));
    expect(result.changed).toBe(true);
    expect(atlas.tileCount).toBeGreaterThan(0);
    expect(atlas.tileCount).toBeLessThanOrEqual(4);
    expect(atlas.pageCount).toBe(1);
    expect(atlas.faceTiles('brush-1', 2)?.slots.size).toBe(atlas.tileCount);
  });

  it('frees every tile when the paint goes away', () => {
    const atlas = new PaintAtlas(PAINT_IMAGE_SOURCE_NONE);
    atlas.bakeBrush(brush([stroke]));
    atlas.bakeBrush(brush([]));
    expect(atlas.tileCount).toBe(0);
    expect(atlas.hasBrush('brush-1')).toBe(false);
    expect(atlas.compactIfUseful()).toBe(true);
    expect(atlas.pageCount).toBe(0);
    expect(atlas.compactIfUseful()).toBe(false);
  });

  it('frees erased tiles', () => {
    const atlas = new PaintAtlas(PAINT_IMAGE_SOURCE_NONE);
    atlas.bakeBrush(brush([stroke, testFloorStroke('e', 2, [[0.1, 1, 0.1]], { mode: 'erase', radius: 0.3 })]));
    expect(atlas.tileCount).toBe(0);
  });

  it('keeps paint that the face no longer reaches out of the atlas', () => {
    const atlas = new PaintAtlas(PAINT_IMAGE_SOURCE_NONE);
    atlas.bakeBrush(brush([stroke]));
    atlas.bakeBrush(brush([stroke], topFace(1.5)));
    expect(atlas.tileCount).toBe(0);
  });

  it('bakes identical pages from identical records', () => {
    const strokes = [
      stroke,
      testFloorStroke(
        't',
        2,
        [
          [-0.4, 1, 0.3],
          [-0.35, 1, 0.3],
        ],
        { color: 0x00ff88, hardness: 0.2 },
      ),
    ];
    const first = new PaintAtlas(PAINT_IMAGE_SOURCE_NONE);
    const second = new PaintAtlas(PAINT_IMAGE_SOURCE_NONE);
    first.bakeBrush(brush(strokes));
    second.bakeBrush(brush(strokes));
    const firstData = first.pageData(0);
    const secondData = second.pageData(0);
    expect(firstData).not.toBeNull();
    expect(firstData?.every((value, index) => value === secondData?.[index])).toBe(true);
  });

  it('rewrites only focused tiles during a live stroke', () => {
    const atlas = new PaintAtlas(PAINT_IMAGE_SOURCE_NONE);
    atlas.bakeBrush(brush([stroke]));
    const before = atlas.tileCount;
    const far = testFloorStroke('far', 2, [[-0.8, 1, -0.8]]);
    atlas.bakeBrush(brush([stroke, far]), [far]);
    expect(atlas.tileCount).toBeGreaterThan(before);
  });

  it('compacts tiles after many are freed', () => {
    const atlas = new PaintAtlas(PAINT_IMAGE_SOURCE_NONE);
    const faces: PaintBakeFace[] = [];
    const strokes: PaintStroke[] = [];
    for (let level = 0; level < 300; level++) {
      faces.push({ ...topFace(level), faceIndex: level });
      strokes.push(testFloorStroke(`s${level}`, level + 1, [[0.1, level, 0.1]], { radius: 0.05 }));
    }
    atlas.bakeBrush({ brushId: 'brush-1', faces, strokes });
    expect(atlas.pageCount).toBe(2);
    atlas.bakeBrush({ brushId: 'brush-1', faces: faces.slice(0, 150), strokes });
    expect(atlas.compactIfUseful()).toBe(true);
    expect(atlas.pageCount).toBe(1);
    const slots = new Set<number>();
    for (let level = 0; level < 150; level++) {
      for (const slot of atlas.faceTiles('brush-1', level)?.slots.values() ?? []) slots.add(slot);
    }
    expect(slots.size).toBe(atlas.tileCount);
    expect(Math.max(...slots)).toBeLessThan(PAINT_PAGE_SLOT_COUNT);
  });
});
