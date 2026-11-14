import { DecalFloatList } from '@/decal/fragment/decal_float_list.js';
import type { DecalJoinedTriangles } from '@/decal/presentation/decal_presentation_geometry.js';
import {
  DecalFirstHitMask,
  decalImagePlaneThrough,
  type DecalImageOutline,
  type DecalImagePlane,
} from './decal_first_hit_mask.js';

/** Floats per piece corner: image x and z, then three barycentric weights. */
const DECAL_PIECE_STRIDE = 5;

/** Half-open cell range along one image axis. */
type DecalCellRange = readonly [number, number];

/**
 * Keeps only the parts of decal triangles that the projection meets first. Each
 * triangle is tested against the mask cells whose centres it covers; fully
 * visible triangles are kept whole, fully shielded ones dropped, and mixed ones
 * halved along cell boundaries until single cells decide. Pieces carry
 * barycentric weights, so every attribute of the source triangle carries over
 * exactly.
 */
export class DecalFirstHitTrim {
  private readonly positions = new DecalFloatList();
  private readonly normals = new DecalFloatList();
  private readonly uvs = new DecalFloatList();
  private readonly projectorLocal = new DecalFloatList();
  private source: DecalJoinedTriangles | null = null;
  private triangle = 0;

  /**
   * Returns the visible parts of joined decal triangles.
   *
   * @param joined Triangles with projector-space positions.
   * @param mask First-hit mask built from the same decal.
   * @returns New joined triangles.
   */
  apply(joined: DecalJoinedTriangles, mask: DecalFirstHitMask): DecalJoinedTriangles {
    this.listsClear();
    this.source = joined;
    const triangleCount = joined.positions.length / 9;
    for (let triangle = 0; triangle < triangleCount; triangle++) this.triangleTrim(triangle, mask);
    this.source = null;
    return {
      positions: this.positions.snapshot(),
      normals: this.normals.snapshot(),
      uvs: this.uvs.snapshot(),
      projectorLocal: this.projectorLocal.snapshot(),
    };
  }

  /**
   * Trims one triangle. Triangles seen edge-on are kept as they are.
   *
   * @param triangle Triangle index.
   * @param mask First-hit mask.
   */
  private triangleTrim(triangle: number, mask: DecalFirstHitMask): void {
    const local = this.source?.projectorLocal ?? new Float32Array(0);
    const base = triangle * 9;
    this.triangle = triangle;
    const piece = [0, 1, 2].flatMap((corner) => [
      local[base + corner * 3] ?? 0,
      local[base + corner * 3 + 2] ?? 0,
      corner === 0 ? 1 : 0,
      corner === 1 ? 1 : 0,
      corner === 2 ? 1 : 0,
    ]);
    const plane = decalImagePlaneThrough(local, base);
    if (!plane) return this.pieceEmit(piece);
    const xs = [piece[0] ?? 0, piece[5] ?? 0, piece[10] ?? 0];
    const zs = [piece[1] ?? 0, piece[6] ?? 0, piece[11] ?? 0];
    const columns: DecalCellRange = [
      DecalFirstHitMask.cellOf(Math.min(...xs)),
      DecalFirstHitMask.cellOf(Math.max(...xs)) + 1,
    ];
    const rows: DecalCellRange = [
      DecalFirstHitMask.cellOf(Math.min(...zs)),
      DecalFirstHitMask.cellOf(Math.max(...zs)) + 1,
    ];
    this.pieceResolve(piece, plane, columns, rows, mask);
  }

  /**
   * Keeps, drops or halves a piece by the coverage of its cell rectangle.
   *
   * @param piece Piece corners.
   * @param plane Plane of the source triangle.
   * @param columns Column range of the rectangle.
   * @param rows Row range of the rectangle.
   * @param mask First-hit mask.
   */
  private pieceResolve(
    piece: number[],
    plane: DecalImagePlane,
    columns: DecalCellRange,
    rows: DecalCellRange,
    mask: DecalFirstHitMask,
  ): void {
    if (piece.length < DECAL_PIECE_STRIDE * 3) return;
    const coverage = mask.coverage(plane, decalPieceOutline(piece));
    if (coverage === 'visible') return this.pieceEmit(piece);
    if (coverage === 'shielded' || (columns[1] - columns[0] <= 1 && rows[1] - rows[0] <= 1)) return;
    const alongColumns = columns[1] - columns[0] >= rows[1] - rows[0];
    const range = alongColumns ? columns : rows;
    const middle = Math.floor((range[0] + range[1]) / 2);
    const boundary = DecalFirstHitMask.boundaryAt(middle);
    const axis = alongColumns ? 0 : 1;
    const low = decalPieceCut(piece, axis, boundary, true);
    const high = decalPieceCut(piece, axis, boundary, false);
    if (alongColumns) {
      this.pieceResolve(low, plane, [columns[0], middle], rows, mask);
      this.pieceResolve(high, plane, [middle, columns[1]], rows, mask);
    } else {
      this.pieceResolve(low, plane, columns, [rows[0], middle], mask);
      this.pieceResolve(high, plane, columns, [middle, rows[1]], mask);
    }
  }

  /**
   * Writes a convex piece as a fan of triangles.
   *
   * @param piece Piece corners.
   */
  private pieceEmit(piece: readonly number[]): void {
    const cornerCount = piece.length / DECAL_PIECE_STRIDE;
    for (let corner = 1; corner + 1 < cornerCount; corner++) {
      for (const index of [0, corner, corner + 1]) this.cornerEmit(piece, index * DECAL_PIECE_STRIDE);
    }
  }

  /**
   * Writes one piece corner, blending the source triangle's attributes.
   *
   * @param piece Piece corners.
   * @param offset First float of the corner.
   */
  private cornerEmit(piece: readonly number[], offset: number): void {
    const source = this.source;
    if (!source) return;
    const first = piece[offset + 2] ?? 0;
    const second = piece[offset + 3] ?? 0;
    const third = piece[offset + 4] ?? 0;
    const corner = this.triangle * 3;
    const blend = (values: Float32Array, size: number, component: number) =>
      first * (values[corner * size + component] ?? 0) +
      second * (values[(corner + 1) * size + component] ?? 0) +
      third * (values[(corner + 2) * size + component] ?? 0);
    this.positions.pushTriple(
      blend(source.positions, 3, 0),
      blend(source.positions, 3, 1),
      blend(source.positions, 3, 2),
    );
    const nx = blend(source.normals, 3, 0);
    const ny = blend(source.normals, 3, 1);
    const nz = blend(source.normals, 3, 2);
    const length = Math.hypot(nx, ny, nz) || 1;
    this.normals.pushTriple(nx / length, ny / length, nz / length);
    this.uvs.pushPair(blend(source.uvs, 2, 0), blend(source.uvs, 2, 1));
    const local = source.projectorLocal;
    this.projectorLocal.pushTriple(blend(local, 3, 0), blend(local, 3, 1), blend(local, 3, 2));
  }

  /** Empties the output lists. */
  private listsClear(): void {
    this.positions.clear();
    this.normals.clear();
    this.uvs.clear();
    this.projectorLocal.clear();
  }
}

/**
 * Returns the image outline of a convex piece.
 *
 * @param piece Piece corners.
 * @returns Corner x and z lists.
 */
function decalPieceOutline(piece: readonly number[]): DecalImageOutline {
  const xs: number[] = [];
  const zs: number[] = [];
  for (let offset = 0; offset + DECAL_PIECE_STRIDE <= piece.length; offset += DECAL_PIECE_STRIDE) {
    xs.push(piece[offset] ?? 0);
    zs.push(piece[offset + 1] ?? 0);
  }
  return { xs, zs };
}

/**
 * Keeps the part of a convex piece on one side of an axis-aligned line.
 *
 * @param piece Piece corners.
 * @param axis 0 cuts along image x, 1 along image z.
 * @param boundary Line position on that axis.
 * @param keepLow True keeps the side below the line, false the side above.
 * @returns Corners of the kept part.
 */
function decalPieceCut(piece: readonly number[], axis: number, boundary: number, keepLow: boolean): number[] {
  const kept: number[] = [];
  const cornerCount = piece.length / DECAL_PIECE_STRIDE;
  const inside = (offset: number) =>
    keepLow ? (piece[offset + axis] ?? 0) <= boundary : (piece[offset + axis] ?? 0) >= boundary;
  for (let corner = 0; corner < cornerCount; corner++) {
    const here = corner * DECAL_PIECE_STRIDE;
    const next = ((corner + 1) % cornerCount) * DECAL_PIECE_STRIDE;
    if (inside(here)) kept.push(...piece.slice(here, here + DECAL_PIECE_STRIDE));
    if (inside(here) === inside(next)) continue;
    const from = piece[here + axis] ?? 0;
    const share = (boundary - from) / ((piece[next + axis] ?? 0) - from);
    for (let float = 0; float < DECAL_PIECE_STRIDE; float++) {
      const start = piece[here + float] ?? 0;
      kept.push(float === axis ? boundary : start + ((piece[next + float] ?? 0) - start) * share);
    }
  }
  return kept;
}
