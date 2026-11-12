import * as THREE from 'three';
import { PAINT_TEXELS_PER_UNIT, PAINT_TILE_GUTTER_TEXELS } from '@/paint/paint_constants.js';
import { type PaintCanvasFrame, paintCanvasFrameFromPlane } from '@/paint/canvas/paint_canvas_frame.js';
import { paintCanvasTileIndex, paintCanvasTileKey } from '@/paint/canvas/paint_canvas_tile.js';
import { PaintAtlasAllocator } from '@/paint/atlas/paint_atlas_allocator.js';
import { PaintAtlasPage, paintAtlasSlotCopy, paintAtlasSlotLocate } from '@/paint/atlas/paint_atlas_pages.js';
import { PAINT_DAB_STRIDE, type PaintStroke, paintStrokeDabCount } from '@/paint/stroke/paint_stroke.js';
import { type PaintImageSource } from '@/paint/raster/paint_image.js';
import { type PaintTileLayer, PaintTileRaster } from '@/paint/raster/paint_tile_raster.js';

/** One brush face as the baker sees it, in brush-local space. */
export interface PaintBakeFace {
  /** Brush face index (the result's surface index). */
  readonly faceIndex: number;
  /** Unit plane normal. */
  readonly normal: THREE.Vector3;
  /** Plane offset. */
  readonly offset: number;
  /** Face polygon. */
  readonly vertices: readonly THREE.Vector3[];
  /** 1 when the result shows the plane normal, -1 when flipped. */
  readonly facingSign: number;
  /** Layers composited over the paint, such as decals. */
  readonly layers: readonly PaintTileLayer[];
  /** Brush-local boxes the layers reach, used to find their tiles. */
  readonly layerBounds: readonly THREE.Box3[];
}

/** Everything the baker needs to rasterize one brush. */
export interface PaintBakeBrush {
  readonly brushId: string;
  readonly faces: readonly PaintBakeFace[];
  /** Strokes sorted by order. */
  readonly strokes: readonly PaintStroke[];
}

/** Allocated tiles of one face. */
export interface PaintAtlasFaceTiles {
  readonly frame: PaintCanvasFrame;
  /** Slot per tile, keyed `x|y`. */
  readonly slots: Map<string, number>;
}

/** Result of baking a brush. */
export interface PaintBakeResult {
  /** True when an image was missing; bake again once images load. */
  readonly pending: boolean;
  /** True when tiles were allocated, freed or rewritten. */
  readonly changed: boolean;
}

/**
 * Owns the paint atlas: allocates uniform tiles to painted regions of brush
 * faces, rasterizes them from stroke records and keeps the page textures in
 * sync. The atlas is a cache; it can always be rebuilt from the records.
 */
export class PaintAtlas {
  private readonly allocator = new PaintAtlasAllocator();
  private readonly pages: PaintAtlasPage[] = [];
  private readonly raster = new PaintTileRaster();
  private readonly brushFaces = new Map<string, Map<number, PaintAtlasFaceTiles>>();
  private layoutVersion = 0;
  private readonly scratchPoint = new THREE.Vector2();
  private readonly scratchCenter = new THREE.Vector3();

  /** @param images Resolves stencil and stamp images. */
  constructor(private readonly images: PaintImageSource) {}

  /** Increments whenever a tile moves, appears or disappears. */
  get version(): number {
    return this.layoutVersion;
  }

  /** Number of pages. */
  get pageCount(): number {
    return this.pages.length;
  }

  /** Number of allocated tiles. */
  get tileCount(): number {
    return this.allocator.usedCount;
  }

  /**
   * Returns a page texture.
   *
   * @param page Page index.
   * @returns Texture, or null when out of range.
   */
  pageTexture(page: number): THREE.DataTexture | null {
    return this.pages[page]?.texture ?? null;
  }

  /**
   * Returns a page's raw bytes (A in the left half, B in the right).
   *
   * @param page Page index.
   * @returns Bytes, or null when out of range.
   */
  pageData(page: number): Uint8Array | null {
    return this.pages[page]?.data ?? null;
  }

  /**
   * Returns the allocated tiles of a brush face.
   *
   * @param brushId Brush id.
   * @param faceIndex Face index.
   * @returns Tiles, or undefined when the face has none.
   */
  faceTiles(brushId: string, faceIndex: number): PaintAtlasFaceTiles | undefined {
    return this.brushFaces.get(brushId)?.get(faceIndex);
  }

  /**
   * Returns whether a brush has tiles.
   *
   * @param brushId Brush id.
   * @returns True when any face of the brush has a tile.
   */
  hasBrush(brushId: string): boolean {
    return this.brushFaces.has(brushId);
  }

  /** Every brush id with tiles. */
  brushIds(): string[] {
    return [...this.brushFaces.keys()];
  }

  /**
   * Bakes a brush. A full bake finds every tile the strokes and layers reach,
   * rasterizes them and frees the rest; a focused bake only rewrites tiles the
   * focus strokes reach (used while a stroke is being drawn).
   *
   * @param input Brush faces and strokes.
   * @param focus Strokes limiting the rewritten tiles, or undefined for a full
   *   bake.
   * @returns Bake result.
   */
  bakeBrush(input: PaintBakeBrush, focus?: readonly PaintStroke[]): PaintBakeResult {
    let pending = false;
    let changed = false;
    const faceMap = this.brushFaces.get(input.brushId) ?? new Map<number, PaintAtlasFaceTiles>();
    const keepFaces = new Set<number>();
    for (const face of input.faces) {
      keepFaces.add(face.faceIndex);
      const frame = paintCanvasFrameFromPlane(face.normal, face.offset);
      let faceTiles = faceMap.get(face.faceIndex);
      if (faceTiles === undefined || !paintFramesEqual(faceTiles.frame, frame)) {
        if (faceTiles !== undefined) changed = this.freeFace(input.brushId, face.faceIndex, faceTiles) || changed;
        faceTiles = { frame, slots: new Map() };
        faceMap.set(face.faceIndex, faceTiles);
      }
      const candidates = this.candidateTiles(face, frame, focus ?? input.strokes, focus === undefined);
      if (focus === undefined) {
        for (const tile of [...faceTiles.slots.keys()]) {
          if (candidates.has(tile)) continue;
          this.freeTile(input.brushId, face.faceIndex, faceTiles, tile);
          changed = true;
        }
      }
      for (const tile of candidates) {
        const result = this.bakeTile(input, face, faceTiles, tile);
        pending = pending || result.pending;
        changed = changed || result.changed;
      }
      if (faceTiles.slots.size === 0) faceMap.delete(face.faceIndex);
    }
    if (focus === undefined) {
      for (const [faceIndex, faceTiles] of [...faceMap]) {
        if (keepFaces.has(faceIndex)) continue;
        changed = this.freeFace(input.brushId, faceIndex, faceTiles) || changed;
        faceMap.delete(faceIndex);
      }
    }
    if (faceMap.size > 0) this.brushFaces.set(input.brushId, faceMap);
    else this.brushFaces.delete(input.brushId);
    return { pending, changed };
  }

  /**
   * Frees every tile of a brush.
   *
   * @param brushId Brush id.
   * @returns True when tiles were freed.
   */
  releaseBrush(brushId: string): boolean {
    const faceMap = this.brushFaces.get(brushId);
    if (faceMap === undefined) return false;
    for (const [faceIndex, faceTiles] of faceMap) this.freeFace(brushId, faceIndex, faceTiles);
    this.brushFaces.delete(brushId);
    return true;
  }

  /**
   * Packs tiles into the lowest slots and drops empty trailing pages when that
   * saves at least one page.
   *
   * @returns True when the atlas shrank.
   */
  compactIfUseful(): boolean {
    if (!this.allocator.canShrink()) return false;
    const moves = this.allocator.compact();
    for (const move of moves) {
      const from = paintAtlasSlotLocate(move.from);
      const to = paintAtlasSlotLocate(move.to);
      const fromPage = this.pages[from.page];
      const toPage = this.pages[to.page];
      if (fromPage === undefined || toPage === undefined) continue;
      paintAtlasSlotCopy(fromPage, from.column, from.row, toPage, to.column, to.row);
      toPage.markSlotDirty(to.slotInPage);
      const [brushId, faceText, tileX, tileY] = move.key.split('|');
      this.brushFaces
        .get(brushId ?? '')
        ?.get(Number(faceText))
        ?.slots.set(`${tileX}|${tileY}`, move.to);
    }
    while (this.pages.length > this.allocator.pageCount) this.pages.pop()?.dispose();
    this.layoutVersion++;
    return true;
  }

  /** Queues dirty page rows for upload. */
  flush(): void {
    for (const page of this.pages) page.flush();
  }

  /** Frees every tile and page. */
  dispose(): void {
    for (const page of this.pages) page.dispose();
    this.pages.length = 0;
    this.brushFaces.clear();
  }

  /**
   * Finds the tiles of a face that strokes or layers can reach.
   *
   * @param face Face.
   * @param frame Face canvas frame.
   * @param strokes Strokes to consider.
   * @param includeLayers Whether layer bounds add tiles.
   * @returns Tile keys `x|y`.
   */
  private candidateTiles(
    face: PaintBakeFace,
    frame: PaintCanvasFrame,
    strokes: readonly PaintStroke[],
    includeLayers: boolean,
  ): Set<string> {
    const tiles = new Set<string>();
    const faceRect = paintFaceCanvasRect(frame, face.vertices, this.scratchPoint);
    const normal = face.facingSign < 0 ? -1 : 1;
    for (const stroke of strokes) {
      const count = paintStrokeDabCount(stroke);
      for (let dab = 0; dab < count; dab++) {
        const base = dab * PAINT_DAB_STRIDE;
        this.scratchCenter.fromArray(stroke.dabs, base);
        const facing =
          -normal *
          ((stroke.dabs[base + 3] ?? 0) * frame.normal.x +
            (stroke.dabs[base + 4] ?? 0) * frame.normal.y +
            (stroke.dabs[base + 5] ?? 0) * frame.normal.z);
        if (facing <= 0.3) continue;
        if (Math.abs(this.scratchCenter.dot(frame.normal) - frame.offset) >= stroke.radius) continue;
        const centerS = this.scratchCenter.dot(frame.tangentS) * PAINT_TEXELS_PER_UNIT;
        const centerT = this.scratchCenter.dot(frame.tangentT) * PAINT_TEXELS_PER_UNIT;
        const reach = (stroke.radius * PAINT_TEXELS_PER_UNIT) / facing + 1;
        paintRectTiles(centerS - reach, centerT - reach, centerS + reach, centerT + reach, faceRect, tiles);
      }
    }
    if (includeLayers) {
      for (const bounds of face.layerBounds) {
        const rect = paintBoxCanvasRect(frame, bounds);
        if (rect !== null) paintRectTiles(rect[0], rect[1], rect[2], rect[3], faceRect, tiles);
      }
    }
    return tiles;
  }

  /**
   * Rasterizes one tile and stores it, or frees it when it holds nothing.
   *
   * @param input Brush input.
   * @param face Face.
   * @param faceTiles Face tile map.
   * @param tile Tile key `x|y`.
   * @returns Pending and changed flags.
   */
  private bakeTile(
    input: PaintBakeBrush,
    face: PaintBakeFace,
    faceTiles: PaintAtlasFaceTiles,
    tile: string,
  ): PaintBakeResult {
    const [xText, yText] = tile.split('|');
    const tileX = Number(xText);
    const tileY = Number(yText);
    this.raster.prepare(faceTiles.frame, tileX, tileY, face.facingSign);
    let pending = this.raster.rasterStrokes(input.strokes, this.images);
    this.raster.resolvePaint();
    if (this.raster.compositeLayers(face.layers)) pending = true;
    if (this.raster.isIdentity()) {
      if (!faceTiles.slots.has(tile)) return { pending, changed: false };
      this.freeTile(input.brushId, face.faceIndex, faceTiles, tile);
      return { pending, changed: true };
    }
    let slot = faceTiles.slots.get(tile);
    if (slot === undefined) {
      slot = this.allocator.allocate(paintCanvasTileKey(input.brushId, face.faceIndex, tileX, tileY));
      faceTiles.slots.set(tile, slot);
      this.layoutVersion++;
    }
    const location = paintAtlasSlotLocate(slot);
    while (this.pages.length <= location.page) this.pages.push(new PaintAtlasPage());
    const page = this.pages[location.page] as PaintAtlasPage;
    this.raster.writeSlot(page.data, location.column, location.row);
    page.markSlotDirty(location.slotInPage);
    return { pending, changed: true };
  }

  /**
   * Frees one tile.
   *
   * @param brushId Brush id.
   * @param faceIndex Face index.
   * @param faceTiles Face tile map.
   * @param tile Tile key `x|y`.
   */
  private freeTile(brushId: string, faceIndex: number, faceTiles: PaintAtlasFaceTiles, tile: string): void {
    const [tileX, tileY] = tile.split('|');
    this.allocator.free(paintCanvasTileKey(brushId, faceIndex, Number(tileX), Number(tileY)));
    faceTiles.slots.delete(tile);
    this.layoutVersion++;
  }

  /**
   * Frees every tile of a face.
   *
   * @param brushId Brush id.
   * @param faceIndex Face index.
   * @param faceTiles Face tile map.
   * @returns True when tiles were freed.
   */
  private freeFace(brushId: string, faceIndex: number, faceTiles: PaintAtlasFaceTiles): boolean {
    const had = faceTiles.slots.size > 0;
    for (const tile of [...faceTiles.slots.keys()]) this.freeTile(brushId, faceIndex, faceTiles, tile);
    return had;
  }
}

/**
 * Returns whether two canvas frames are the same plane.
 *
 * @param left First frame.
 * @param right Second frame.
 * @returns True when equal within a tiny tolerance.
 */
function paintFramesEqual(left: PaintCanvasFrame, right: PaintCanvasFrame): boolean {
  return left.normal.distanceToSquared(right.normal) < 1e-12 && Math.abs(left.offset - right.offset) < 1e-7;
}

/**
 * Returns the canvas rectangle of a face polygon, one texel larger.
 *
 * @param frame Face frame.
 * @param vertices Face polygon.
 * @param scratch Scratch vector.
 * @returns [minS, minT, maxS, maxT].
 */
function paintFaceCanvasRect(
  frame: PaintCanvasFrame,
  vertices: readonly THREE.Vector3[],
  scratch: THREE.Vector2,
): [number, number, number, number] {
  const rect: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const vertex of vertices) {
    scratch.set(vertex.dot(frame.tangentS) * PAINT_TEXELS_PER_UNIT, vertex.dot(frame.tangentT) * PAINT_TEXELS_PER_UNIT);
    rect[0] = Math.min(rect[0], scratch.x - PAINT_TILE_GUTTER_TEXELS);
    rect[1] = Math.min(rect[1], scratch.y - PAINT_TILE_GUTTER_TEXELS);
    rect[2] = Math.max(rect[2], scratch.x + PAINT_TILE_GUTTER_TEXELS);
    rect[3] = Math.max(rect[3], scratch.y + PAINT_TILE_GUTTER_TEXELS);
  }
  return rect;
}

/**
 * Returns the canvas rectangle covered by a brush-local box, or null when the
 * box is empty.
 *
 * @param frame Face frame.
 * @param box Box.
 * @returns {undefined} MinS, minT, maxS, maxT or null.
 */
function paintBoxCanvasRect(frame: PaintCanvasFrame, box: THREE.Box3): [number, number, number, number] | null {
  if (box.isEmpty()) return null;
  const distanceMin = paintBoxPlaneDistance(frame, box, false);
  const distanceMax = paintBoxPlaneDistance(frame, box, true);
  if (distanceMin > 0 || distanceMax < 0) return null;
  const rect: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  const corner = new THREE.Vector3();
  for (let index = 0; index < 8; index++) {
    corner.set(index & 1 ? box.max.x : box.min.x, index & 2 ? box.max.y : box.min.y, index & 4 ? box.max.z : box.min.z);
    const s = corner.dot(frame.tangentS) * PAINT_TEXELS_PER_UNIT;
    const t = corner.dot(frame.tangentT) * PAINT_TEXELS_PER_UNIT;
    rect[0] = Math.min(rect[0], s);
    rect[1] = Math.min(rect[1], t);
    rect[2] = Math.max(rect[2], s);
    rect[3] = Math.max(rect[3], t);
  }
  return rect;
}

/**
 * Returns the smallest or largest signed plane distance over a box.
 *
 * @param frame Face frame.
 * @param box Box.
 * @param largest True for the largest distance.
 * @returns Signed distance.
 */
function paintBoxPlaneDistance(frame: PaintCanvasFrame, box: THREE.Box3, largest: boolean): number {
  const normal = frame.normal;
  const pick = (value: number, min: number, max: number) => (value >= 0 === largest ? max : min);
  return (
    normal.x * pick(normal.x, box.min.x, box.max.x) +
    normal.y * pick(normal.y, box.min.y, box.max.y) +
    normal.z * pick(normal.z, box.min.z, box.max.z) -
    frame.offset
  );
}

/**
 * Adds the tiles a canvas rectangle reaches inside a face rectangle.
 *
 * @param minS Rectangle minimum s.
 * @param minT Rectangle minimum t.
 * @param maxS Rectangle maximum s.
 * @param maxT Rectangle maximum t.
 * @param faceRect Face rectangle [minS, minT, maxS, maxT].
 * @param tiles Receives `x|y` keys.
 */
function paintRectTiles(
  minS: number,
  minT: number,
  maxS: number,
  maxT: number,
  faceRect: readonly [number, number, number, number],
  tiles: Set<string>,
): void {
  const clampedMinS = Math.max(minS, faceRect[0]);
  const clampedMinT = Math.max(minT, faceRect[1]);
  const clampedMaxS = Math.min(maxS, faceRect[2]);
  const clampedMaxT = Math.min(maxT, faceRect[3]);
  if (clampedMinS > clampedMaxS || clampedMinT > clampedMaxT) return;
  const firstX = paintCanvasTileIndex(clampedMinS - PAINT_TILE_GUTTER_TEXELS);
  const lastX = paintCanvasTileIndex(clampedMaxS + PAINT_TILE_GUTTER_TEXELS);
  const firstY = paintCanvasTileIndex(clampedMinT - PAINT_TILE_GUTTER_TEXELS);
  const lastY = paintCanvasTileIndex(clampedMaxT + PAINT_TILE_GUTTER_TEXELS);
  for (let y = firstY; y <= lastY; y++) {
    for (let x = firstX; x <= lastX; x++) tiles.add(`${x}|${y}`);
  }
}
