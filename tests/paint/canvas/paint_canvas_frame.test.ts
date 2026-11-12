import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  paintCanvasFrameFromPlane,
  paintCanvasProject,
  paintCanvasUnproject,
} from '@/paint/canvas/paint_canvas_frame.js';
import {
  paintCanvasTileIndex,
  paintCanvasTilesInRect,
  paintCanvasTileWindowStart,
} from '@/paint/canvas/paint_canvas_tile.js';
import { PAINT_TEXELS_PER_UNIT, PAINT_TILE_CONTENT_TEXELS, PAINT_TILE_GUTTER_TEXELS } from '@/paint/paint_constants.js';

describe('Paint canvas frame', () => {
  const normals = [
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(1, 2, 3),
  ];

  it.each(normals.map((normal) => [normal.toArray().join(',') as string, normal] as const))(
    'is orthonormal and right-handed for %s',
    (_label, normal) => {
      const frame = paintCanvasFrameFromPlane(normal, 0.5);
      expect(frame.tangentS.length()).toBeCloseTo(1);
      expect(frame.tangentT.length()).toBeCloseTo(1);
      expect(frame.tangentS.dot(frame.normal)).toBeCloseTo(0);
      expect(frame.tangentT.dot(frame.tangentS)).toBeCloseTo(0);
      const cross = new THREE.Vector3().crossVectors(frame.tangentS, frame.tangentT);
      expect(cross.distanceTo(frame.normal)).toBeLessThan(1e-6);
    },
  );

  it('maps one unit to the texel density and unprojects onto the plane', () => {
    const frame = paintCanvasFrameFromPlane(new THREE.Vector3(0, 1, 0), 2);
    const point = new THREE.Vector3(1.5, 2, -0.25);
    const canvas = paintCanvasProject(frame, point, new THREE.Vector2());
    const back = paintCanvasUnproject(frame, canvas.x, canvas.y, new THREE.Vector3());
    expect(back.distanceTo(point)).toBeLessThan(1e-5);
    const moved = paintCanvasProject(frame, point.clone().add(frame.tangentS), new THREE.Vector2());
    expect(moved.x - canvas.x).toBeCloseTo(PAINT_TEXELS_PER_UNIT);
  });
});

describe('Paint canvas tiles', () => {
  it('splits the canvas into content-sized tiles including negative ones', () => {
    expect(paintCanvasTileIndex(0)).toBe(0);
    expect(paintCanvasTileIndex(PAINT_TILE_CONTENT_TEXELS - 0.01)).toBe(0);
    expect(paintCanvasTileIndex(PAINT_TILE_CONTENT_TEXELS)).toBe(1);
    expect(paintCanvasTileIndex(-0.01)).toBe(-1);
    expect(paintCanvasTileWindowStart(1)).toBe(PAINT_TILE_CONTENT_TEXELS - PAINT_TILE_GUTTER_TEXELS);
  });

  it('includes neighbours whose gutter a rectangle touches', () => {
    const tiles = paintCanvasTilesInRect(10, 10, PAINT_TILE_CONTENT_TEXELS - 0.5, 20);
    expect(tiles).toContainEqual({ x: 1, y: 0 });
    expect(tiles).toContainEqual({ x: 0, y: 0 });
  });
});
