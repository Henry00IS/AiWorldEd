import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PaintAtlas, type PaintBakeBrush } from '@/paint/bake/paint_atlas.js';
import { paintAtlasSlotLocate } from '@/paint/atlas/paint_atlas_pages.js';
import { PAINT_IMAGE_SOURCE_NONE } from '@/paint/raster/paint_image.js';
import {
  PAINT_PAGE_TEXELS,
  PAINT_TILE_CONTENT_TEXELS,
  PAINT_TILE_GUTTER_TEXELS,
  PAINT_TILE_SLOT_TEXELS,
} from '@/paint/paint_constants.js';
import type { PaintStroke } from '@/paint/stroke/paint_stroke.js';
import { testFloorStroke } from '../paint_test_strokes.js';

/**
 * Bakes strokes on the top of a 4 m box.
 *
 * @param atlas Atlas.
 * @param strokes Strokes.
 * @param focus Strokes just added, for an incremental bake.
 */
function bake(atlas: PaintAtlas, strokes: PaintStroke[], focus?: PaintStroke[]): void {
  const input: PaintBakeBrush = {
    brushId: 'brush-1',
    strokes,
    faces: [
      {
        faceIndex: 2,
        normal: new THREE.Vector3(0, 1, 0),
        offset: 2,
        vertices: [
          new THREE.Vector3(-2, 2, -2),
          new THREE.Vector3(2, 2, -2),
          new THREE.Vector3(2, 2, 2),
          new THREE.Vector3(-2, 2, 2),
        ],
        facingSign: 1,
        layers: [],
        layerBounds: [],
      },
    ],
  };
  atlas.bakeBrush(input, focus);
}

/**
 * Reads one texel (A and B) of a tile's slot window.
 *
 * @param atlas Atlas.
 * @param slot Global slot.
 * @param x Window column.
 * @param y Window row.
 * @returns Eight bytes, A rgba then B rgba.
 */
function texel(atlas: PaintAtlas, slot: number, x: number, y: number): number[] {
  const located = paintAtlasSlotLocate(slot);
  const data = atlas.pageData(located.page)!;
  const row = (located.row * PAINT_TILE_SLOT_TEXELS + y) * PAINT_PAGE_TEXELS * 2;
  const index = (row + located.column * PAINT_TILE_SLOT_TEXELS + x) * 4;
  const b = index + PAINT_PAGE_TEXELS * 4;
  return [...data.subarray(index, index + 4), ...data.subarray(b, b + 4)];
}

/**
 * Checks every gutter texel of every tile against the texel of the neighbouring
 * tile that covers the same canvas texel, and counts the painted gutter texels
 * it compared.
 *
 * @param atlas Atlas.
 * @returns Painted gutter texels compared.
 */
function expectGuttersContinueNeighbours(atlas: PaintAtlas): number {
  const slots = atlas.faceTiles('brush-1', 2)!.slots;
  const gutter = PAINT_TILE_GUTTER_TEXELS;
  const content = PAINT_TILE_CONTENT_TEXELS;
  let painted = 0;
  for (const [key, slot] of slots) {
    const [tileX, tileY] = key.split('|').map(Number) as [number, number];
    for (let y = 0; y < PAINT_TILE_SLOT_TEXELS; y++) {
      for (let x = 0; x < PAINT_TILE_SLOT_TEXELS; x++) {
        const inside = x >= gutter && x < gutter + content && y >= gutter && y < gutter + content;
        if (inside) continue;
        // The canvas texel of this gutter texel, and the tile whose content holds it.
        const s = tileX * content - gutter + x;
        const t = tileY * content - gutter + y;
        const ownerX = Math.floor(s / content);
        const ownerY = Math.floor(t / content);
        const owner = slots.get(`${String(ownerX)}|${String(ownerY)}`);
        const value = texel(atlas, slot, x, y);
        if (owner === undefined) {
          // Nothing painted there: the gutter is identity, like the unpainted surface.
          expect(value).toEqual([255, 255, 255, 255, 0, 0, 0, 255]);
          continue;
        }
        const expected = texel(atlas, owner, s - (ownerX * content - gutter), t - (ownerY * content - gutter));
        expect(value).toEqual(expected);
        if (value[0] !== 255 || value[4] !== 0) painted++;
      }
    }
  }
  return painted;
}

describe('Paint atlas gutters', () => {
  it('hold the paint of the neighbouring tiles, never a background color, and follow every update', () => {
    const atlas = new PaintAtlas(PAINT_IMAGE_SOURCE_NONE);
    const across: [number, number, number][] = [];
    for (let x = -1.5; x <= 1.5; x += 0.02) across.push([x, 2, 0.3 * Math.sin(x * 3)]);
    bake(atlas, [testFloorStroke('across', 1, across, { radius: 0.3 })]);
    expect(expectGuttersContinueNeighbours(atlas)).toBeGreaterThan(100);
    // Thin strokes 3 texels past a tile edge, inside the neighbour's content only,
    // baked incrementally like the tool does: the gutters beside them must follow.
    const first = testFloorStroke('across', 1, across, { radius: 0.3 });
    const e = (PAINT_TILE_CONTENT_TEXELS + 3) / 128;
    const lines: PaintStroke[] = [];
    for (const sign of [-1, 1]) {
      for (const along of ['x', 'z'] as const) {
        const dense: [number, number, number][] = [];
        for (let step = 0; step <= 400; step++) {
          const run = -1.8 + (3.6 * step) / 400;
          dense.push(along === 'x' ? [run, 2, sign * e] : [sign * e, 2, run]);
        }
        lines.push(
          testFloorStroke(`${along}${String(sign)}`, lines.length + 2, dense, { radius: 1.5 / 128, color: 0x00ff00 }),
        );
      }
    }
    bake(atlas, [first, ...lines], lines);
    expect(expectGuttersContinueNeighbours(atlas)).toBeGreaterThan(100);
    atlas.dispose();
  });
});
