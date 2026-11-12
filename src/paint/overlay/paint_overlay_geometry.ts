import * as THREE from 'three';
import {
  PAINT_PAGE_TEXELS,
  PAINT_TEXELS_PER_UNIT,
  PAINT_TILE_CONTENT_TEXELS,
  PAINT_TILE_GUTTER_TEXELS,
  PAINT_TILE_SLOT_TEXELS,
} from '@/paint/paint_constants.js';
import { paintCanvasTileIndex } from '@/paint/canvas/paint_canvas_tile.js';
import { paintAtlasSlotLocate } from '@/paint/atlas/paint_atlas_pages.js';
import type { PaintAtlasFaceTiles } from '@/paint/bake/paint_atlas.js';

/** Where one result triangle came from. */
export interface PaintOverlaySource {
  readonly brushId?: string;
  readonly surfaceIndex?: number;
  readonly derivedId?: string;
}

/** Painted brush as the overlay builder sees it. */
export interface PaintOverlayBrush {
  /** Maps result-mesh local space to brush-local space. */
  readonly resultToBrush: THREE.Matrix4;
  /**
   * Returns the tiles of a face.
   *
   * @param faceIndex Face index.
   * @returns Tiles, or undefined when the face has none.
   */
  faceTiles(faceIndex: number): PaintAtlasFaceTiles | undefined;
}

/** Overlay triangles for one atlas page, in result-mesh local space. */
export interface PaintOverlayPageBatch {
  readonly page: number;
  readonly positions: number[];
  readonly normals: number[];
  readonly uvs: number[];
}

/** Clipping vertex: canvas coordinates and barycentric weights. */
interface PaintClipVertex {
  s: number;
  t: number;
  a: number;
  b: number;
  c: number;
}

const scratchCorner = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const scratchLocal = new THREE.Vector3();

/**
 * Cuts the painted parts of a solid result into triangles that map straight
 * into the atlas: each result triangle of a painted face is clipped to every
 * allocated tile it overlaps.
 *
 * @param geometry Result geometry (non-indexed or indexed triangles).
 * @param sources Per-triangle sources.
 * @param brushes Painted brushes by id.
 * @returns Triangles grouped by atlas page.
 */
export function paintOverlayBuild(
  geometry: THREE.BufferGeometry,
  sources: readonly (PaintOverlaySource | undefined)[],
  brushes: ReadonlyMap<string, PaintOverlayBrush>,
): PaintOverlayPageBatch[] {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const index = geometry.getIndex();
  if (position === undefined) return [];
  const batches = new Map<number, PaintOverlayPageBatch>();
  const triangleCount = Math.floor((index?.count ?? position.count) / 3);
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const source = sources[triangle];
    if (source?.brushId === undefined || source.surfaceIndex === undefined || source.derivedId !== undefined) continue;
    const brush = brushes.get(source.brushId);
    const tiles = brush?.faceTiles(source.surfaceIndex);
    if (brush === undefined || tiles === undefined || tiles.slots.size === 0) continue;
    const vertices = [0, 1, 2].map((corner) => index?.getX(triangle * 3 + corner) ?? triangle * 3 + corner);
    const canvas = vertices.map((vertex, corner) => {
      const local = (scratchCorner[corner] as THREE.Vector3).fromBufferAttribute(position, vertex);
      scratchLocal.copy(local).applyMatrix4(brush.resultToBrush);
      return [
        scratchLocal.dot(tiles.frame.tangentS) * PAINT_TEXELS_PER_UNIT,
        scratchLocal.dot(tiles.frame.tangentT) * PAINT_TEXELS_PER_UNIT,
      ] as const;
    });
    const minS = Math.min(...canvas.map((point) => point[0]));
    const maxS = Math.max(...canvas.map((point) => point[0]));
    const minT = Math.min(...canvas.map((point) => point[1]));
    const maxT = Math.max(...canvas.map((point) => point[1]));
    for (let tileY = paintCanvasTileIndex(minT); tileY <= paintCanvasTileIndex(maxT); tileY++) {
      for (let tileX = paintCanvasTileIndex(minS); tileX <= paintCanvasTileIndex(maxS); tileX++) {
        const slot = tiles.slots.get(`${tileX}|${tileY}`);
        if (slot === undefined) continue;
        const polygon = paintOverlayClipToTile(
          [
            { s: canvas[0]?.[0] ?? 0, t: canvas[0]?.[1] ?? 0, a: 1, b: 0, c: 0 },
            { s: canvas[1]?.[0] ?? 0, t: canvas[1]?.[1] ?? 0, a: 0, b: 1, c: 0 },
            { s: canvas[2]?.[0] ?? 0, t: canvas[2]?.[1] ?? 0, a: 0, b: 0, c: 1 },
          ],
          tileX,
          tileY,
        );
        if (polygon.length < 3) continue;
        const location = paintAtlasSlotLocate(slot);
        let batch = batches.get(location.page);
        if (batch === undefined) {
          batch = { page: location.page, positions: [], normals: [], uvs: [] };
          batches.set(location.page, batch);
        }
        for (let fan = 1; fan < polygon.length - 1; fan++) {
          for (const vertex of [polygon[0], polygon[fan], polygon[fan + 1]] as PaintClipVertex[]) {
            paintOverlayEmit(batch, vertex, vertices, position, normal, tileX, tileY, location.column, location.row);
          }
        }
      }
    }
  }
  return [...batches.values()].sort((left, right) => left.page - right.page);
}

/**
 * Computes for every painted face whether the result shows it along its plane
 * normal (1) or flipped (-1), from the winding of its result triangles.
 *
 * @param geometry Result geometry.
 * @param sources Per-triangle sources.
 * @param resultToBrush Maps result-local space to brush-local space per brush
 *   id.
 * @param planeNormal Returns a face's brush-local plane normal.
 * @returns Signs keyed `brushId|face`.
 */
export function paintOverlayFacingSigns(
  geometry: THREE.BufferGeometry,
  sources: readonly (PaintOverlaySource | undefined)[],
  resultToBrush: ReadonlyMap<string, THREE.Matrix4>,
  planeNormal: (brushId: string, faceIndex: number) => THREE.Vector3 | null,
): Map<string, number> {
  const votes = new Map<string, number>();
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  if (position === undefined) return votes;
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();
  const triangleCount = Math.floor((index?.count ?? position.count) / 3);
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const source = sources[triangle];
    if (source?.brushId === undefined || source.surfaceIndex === undefined || source.derivedId !== undefined) continue;
    const matrix = resultToBrush.get(source.brushId);
    if (matrix === undefined) continue;
    const plane = planeNormal(source.brushId, source.surfaceIndex);
    if (plane === null) continue;
    const corners = [0, 1, 2].map((corner) =>
      (scratchCorner[corner] as THREE.Vector3)
        .fromBufferAttribute(position, index?.getX(triangle * 3 + corner) ?? triangle * 3 + corner)
        .applyMatrix4(matrix),
    );
    edgeA.subVectors(corners[1] as THREE.Vector3, corners[0] as THREE.Vector3);
    edgeB.subVectors(corners[2] as THREE.Vector3, corners[0] as THREE.Vector3);
    const facing = edgeA.cross(edgeB).dot(plane);
    if (facing === 0) continue;
    const key = `${source.brushId}|${source.surfaceIndex}`;
    votes.set(key, (votes.get(key) ?? 0) + Math.sign(facing));
  }
  const signs = new Map<string, number>();
  votes.forEach((vote, key) => signs.set(key, vote < 0 ? -1 : 1));
  return signs;
}

/**
 * Clips a canvas polygon to one tile's content rectangle.
 *
 * @param polygon Polygon.
 * @param tileX Tile x.
 * @param tileY Tile y.
 * @returns Clipped polygon.
 */
function paintOverlayClipToTile(polygon: PaintClipVertex[], tileX: number, tileY: number): PaintClipVertex[] {
  const minS = tileX * PAINT_TILE_CONTENT_TEXELS;
  const minT = tileY * PAINT_TILE_CONTENT_TEXELS;
  let result = polygon;
  result = paintOverlayClipEdge(result, (vertex) => vertex.s - minS);
  result = paintOverlayClipEdge(result, (vertex) => minS + PAINT_TILE_CONTENT_TEXELS - vertex.s);
  result = paintOverlayClipEdge(result, (vertex) => vertex.t - minT);
  result = paintOverlayClipEdge(result, (vertex) => minT + PAINT_TILE_CONTENT_TEXELS - vertex.t);
  return result;
}

/**
 * Keeps the part of a polygon where a linear function is not negative.
 *
 * @param polygon Polygon.
 * @param inside Signed distance to the clipping edge.
 * @returns Clipped polygon.
 */
function paintOverlayClipEdge(
  polygon: PaintClipVertex[],
  inside: (vertex: PaintClipVertex) => number,
): PaintClipVertex[] {
  const output: PaintClipVertex[] = [];
  for (let index = 0; index < polygon.length; index++) {
    const current = polygon[index] as PaintClipVertex;
    const next = polygon[(index + 1) % polygon.length] as PaintClipVertex;
    const currentDistance = inside(current);
    const nextDistance = inside(next);
    if (currentDistance >= 0) output.push(current);
    if (currentDistance >= 0 !== nextDistance >= 0) {
      const ratio = currentDistance / (currentDistance - nextDistance);
      output.push({
        s: current.s + (next.s - current.s) * ratio,
        t: current.t + (next.t - current.t) * ratio,
        a: current.a + (next.a - current.a) * ratio,
        b: current.b + (next.b - current.b) * ratio,
        c: current.c + (next.c - current.c) * ratio,
      });
    }
  }
  return output;
}

/**
 * Appends one overlay vertex.
 *
 * @param batch Target batch.
 * @param vertex Clipped vertex.
 * @param corners Result vertex indices of the source triangle.
 * @param position Result positions.
 * @param normal Result normals, if any.
 * @param tileX Tile x.
 * @param tileY Tile y.
 * @param column Slot column.
 * @param row Slot row.
 */
function paintOverlayEmit(
  batch: PaintOverlayPageBatch,
  vertex: PaintClipVertex,
  corners: readonly number[],
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  normal: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined,
  tileX: number,
  tileY: number,
  column: number,
  row: number,
): void {
  const weights = [vertex.a, vertex.b, vertex.c];
  for (const attribute of [position, normal]) {
    const target = attribute === position ? batch.positions : batch.normals;
    for (let axis = 0; axis < 3; axis++) {
      let value = 0;
      if (attribute !== undefined) {
        corners.forEach((corner, cornerIndex) => {
          value += attribute.getComponent(corner, axis) * (weights[cornerIndex] ?? 0);
        });
      }
      target.push(value);
    }
  }
  const slotS =
    column * PAINT_TILE_SLOT_TEXELS + PAINT_TILE_GUTTER_TEXELS + (vertex.s - tileX * PAINT_TILE_CONTENT_TEXELS);
  const slotT =
    row * PAINT_TILE_SLOT_TEXELS + PAINT_TILE_GUTTER_TEXELS + (vertex.t - tileY * PAINT_TILE_CONTENT_TEXELS);
  batch.uvs.push(slotS / (PAINT_PAGE_TEXELS * 2), slotT / PAINT_PAGE_TEXELS);
}
