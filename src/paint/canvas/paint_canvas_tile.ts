import { PAINT_TILE_CONTENT_TEXELS, PAINT_TILE_GUTTER_TEXELS } from '@/paint/paint_constants.js';

/** Integer tile coordinates on a face canvas. */
export interface PaintCanvasTileCoord {
  readonly x: number;
  readonly y: number;
}

/**
 * Builds the map key of a tile on one face of one brush.
 *
 * @param brushId Brush id.
 * @param faceIndex Brush face index.
 * @param tileX Tile x.
 * @param tileY Tile y.
 * @returns Tile key.
 */
export function paintCanvasTileKey(brushId: string, faceIndex: number, tileX: number, tileY: number): string {
  return `${brushId}|${faceIndex}|${tileX}|${tileY}`;
}

/**
 * Returns the tile that holds a canvas coordinate.
 *
 * @param texel Canvas coordinate in texels.
 * @returns Tile index along that axis.
 */
export function paintCanvasTileIndex(texel: number): number {
  return Math.floor(texel / PAINT_TILE_CONTENT_TEXELS);
}

/**
 * Returns the canvas texel where a tile's slot window starts, gutter included.
 *
 * @param tileIndex Tile index along one axis.
 * @returns First canvas texel of the slot window.
 */
export function paintCanvasTileWindowStart(tileIndex: number): number {
  return tileIndex * PAINT_TILE_CONTENT_TEXELS - PAINT_TILE_GUTTER_TEXELS;
}

/**
 * Lists the tiles a canvas rectangle reaches, gutters included.
 *
 * @param minS Rectangle minimum s in texels.
 * @param minT Rectangle minimum t in texels.
 * @param maxS Rectangle maximum s in texels.
 * @param maxT Rectangle maximum t in texels.
 * @returns Tile coordinates.
 */
export function paintCanvasTilesInRect(minS: number, minT: number, maxS: number, maxT: number): PaintCanvasTileCoord[] {
  const tiles: PaintCanvasTileCoord[] = [];
  const firstX = paintCanvasTileIndex(minS - PAINT_TILE_GUTTER_TEXELS);
  const lastX = paintCanvasTileIndex(maxS + PAINT_TILE_GUTTER_TEXELS);
  const firstY = paintCanvasTileIndex(minT - PAINT_TILE_GUTTER_TEXELS);
  const lastY = paintCanvasTileIndex(maxT + PAINT_TILE_GUTTER_TEXELS);
  for (let y = firstY; y <= lastY; y++) {
    for (let x = firstX; x <= lastX; x++) tiles.push({ x, y });
  }
  return tiles;
}
