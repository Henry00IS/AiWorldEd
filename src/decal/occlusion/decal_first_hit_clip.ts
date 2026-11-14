import type { DecalFragment } from '@/decal/fragment/decal_fragment.js';
import { DecalFloatList } from '@/decal/fragment/decal_float_list.js';
import type { DecalJoinedTriangles } from '@/decal/presentation/decal_presentation_geometry.js';
import { DecalOccluderGrid } from './decal_occluder_grid.js';
import { DecalSeamMend } from './decal_seam_mend.js';
import {
  DECAL_POLYGON_AREA_MINIMUM,
  decalPolygonBox,
  decalPolygonSignedArea,
  DECAL_POLYGON_ALL_LEFT,
  decalPolygonSides,
  decalPolygonSplitBySides,
  decalPolygonSubtract,
} from './decal_image_polygon.js';

/**
 * Plane of a triangle as projector-space height y = slopeX·x + slopeZ·z +
 * height.
 */
interface DecalImagePlane {
  /** Change of y per unit x. */
  slopeX: number;
  /** Change of y per unit z. */
  slopeZ: number;
  /** Value of y at x = z = 0. */
  height: number;
}

/** One receiving triangle's surviving outline, in projector space. */
interface DecalFirstHitPiece {
  /** Source triangle index. */
  triangle: number;
  /** Convex outline, three floats per corner. */
  outline: number[];
  /** True when the outline is the whole source triangle. */
  whole: boolean;
}

/**
 * Keeps only the parts of decal triangles that the projection meets first, cut
 * exactly along the outlines of what shields them. Projector space runs from
 * -0.5 to 0.5 on each axis and the image travels down local y, so a triangle is
 * shielded wherever another surface lies higher above the same image point. For
 * every receiving triangle, each nearby triangle is clipped to the part above
 * the receiver's plane; that part's footprint in the image is its shadow, and
 * the shadows are cut out of the receiver. Pieces carry their position in the
 * receiver, so every attribute carries over exactly, and corners where pieces
 * meet are shared so no cracks open between them.
 *
 * Asked for the second hit instead, it keeps the opposite: the parts covered by
 * exactly one surface above, which is a shadow cast along the projection that
 * lands only on the first surface behind the blocker. Every surface recorded
 * here faces the projector, so the number of shadows covering a point is the
 * number of surfaces the image crosses before it; points under two or more get
 * nothing, so stacked floors never repeat the shadow.
 */
export class DecalFirstHitClip {
  /** Height a surface must rise above a receiver before it shields it. */
  static readonly tolerance = 1e-4;

  private readonly grid = new DecalOccluderGrid();
  private readonly near: number[] = [];
  private readonly seams = new DecalSeamMend();
  private pieces: DecalFirstHitPiece[] = [];
  private readonly cutCorners: number[] = [];
  private readonly positions = new DecalFloatList();
  private readonly normals = new DecalFloatList();
  private readonly uvs = new DecalFloatList();
  private readonly projectorLocal = new DecalFloatList();
  private source: DecalJoinedTriangles | null = null;

  /**
   * Returns the parts of joined decal triangles the projection meets first, or
   * with hit 2, the parts it meets second.
   *
   * @param joined Triangles with projector-space positions, in fragment order.
   * @param fragments Fragments the triangles were joined from, with shields.
   * @param hit 1 for the first hit, 2 for the second.
   * @returns New joined triangles.
   */
  apply(joined: DecalJoinedTriangles, fragments: readonly DecalFragment[], hit: 1 | 2 = 1): DecalJoinedTriangles {
    this.grid.build([joined.projectorLocal, ...fragments.map((fragment) => fragment.shields)]);
    this.listsClear();
    this.source = joined;
    this.pieces = [];
    this.cutCorners.length = 0;
    const count = joined.positions.length / 9;
    for (let triangle = 0; triangle < count; triangle++) {
      if (hit === 1) this.triangleClip(triangle);
      else this.triangleShadow(triangle);
    }
    this.piecesEmit();
    this.pieces = [];
    this.source = null;
    return {
      positions: this.positions.snapshot(),
      normals: this.normals.snapshot(),
      uvs: this.uvs.snapshot(),
      projectorLocal: this.projectorLocal.snapshot(),
    };
  }

  /**
   * Cuts the shadows of nearby surfaces out of one triangle. Triangles seen
   * edge-on are kept as they are.
   *
   * @param triangle Triangle index.
   */
  private triangleClip(triangle: number): void {
    const local = this.grid.trianglesAll();
    const base = triangle * 9;
    const plane = decalImagePlaneThrough(local, base);
    if (!plane) return this.wholeEmit(triangle);
    const outline = [
      local[base]!,
      local[base + 2]!,
      local[base + 3]!,
      local[base + 5]!,
      local[base + 6]!,
      local[base + 8]!,
    ];
    const floor = Math.min(local[base + 1]!, local[base + 4]!, local[base + 7]!) + DecalFirstHitClip.tolerance;
    this.grid.near(decalPolygonBox(outline), floor, triangle, this.near);
    let pieces: number[][] = [outline];
    let cut = false;
    for (const other of this.near) {
      const shadow = decalShadowOf(local, other * 9, plane);
      if (!shadow) continue;
      const kept: number[][] = [];
      for (const piece of pieces) decalPolygonSubtract(piece, shadow, kept);
      cut ||= kept.length !== 1 || kept[0] !== pieces[0];
      pieces = kept;
      if (pieces.length === 0) return;
    }
    if (!cut) return this.wholeKeep(triangle);
    for (const piece of pieces) {
      const corners: number[] = [];
      for (let index = 0; index < piece.length; index += 2) {
        const [x, z] = [piece[index]!, piece[index + 1]!];
        const y = plane.slopeX * x + plane.slopeZ * z + plane.height;
        corners.push(x, y, z);
        if (!decalOutlineHasCorner(outline, x, z)) this.cutCorners.push(x, y, z);
      }
      this.pieces.push({ triangle, outline: corners, whole: false });
    }
  }

  /**
   * Keeps the parts of one triangle covered by exactly one shadow: for each
   * shadow, its overlap with the triangle minus every other shadow. The kept
   * parts never overlap, since each lies under its own shadow only.
   *
   * @param triangle Triangle index.
   */
  private triangleShadow(triangle: number): void {
    const local = this.grid.trianglesAll();
    const base = triangle * 9;
    const plane = decalImagePlaneThrough(local, base);
    if (!plane) return;
    const outline = [
      local[base]!,
      local[base + 2]!,
      local[base + 3]!,
      local[base + 5]!,
      local[base + 6]!,
      local[base + 8]!,
    ];
    const floor = Math.min(local[base + 1]!, local[base + 4]!, local[base + 7]!) + DecalFirstHitClip.tolerance;
    this.grid.near(decalPolygonBox(outline), floor, triangle, this.near);
    const shadows: number[][] = [];
    for (const other of this.near) {
      const shadow = decalShadowOf(local, other * 9, plane);
      if (shadow) shadows.push(shadow);
    }
    if (shadows.length === 0) return;
    // Shadows covering the whole triangle go first: two of them leave nothing,
    // and one of them empties every other shadow's part at once.
    const covering = shadows.filter((shadow) => decalPolygonContains(shadow, outline));
    if (covering.length >= 2) return;
    const ordered = [...covering, ...shadows.filter((shadow) => !covering.includes(shadow))];
    const boxes = ordered.map((shadow) => decalPolygonBox(shadow));
    for (let index = 0; index < ordered.length; index++) {
      let pieces: number[][] = [];
      const under = decalPolygonClipConvex(outline, ordered[index]!);
      if (under) pieces.push(under);
      const [minX, maxX, minZ, maxZ] = under ? decalPolygonBox(under) : [0, 0, 0, 0];
      for (let other = 0; other < ordered.length && pieces.length > 0; other++) {
        if (other === index) continue;
        const box = boxes[other]!;
        if (box[0] >= maxX || box[1] <= minX || box[2] >= maxZ || box[3] <= minZ) continue;
        const kept: number[][] = [];
        for (const piece of pieces) decalPolygonSubtract(piece, ordered[other]!, kept);
        pieces = kept;
      }
      for (const piece of pieces) {
        const corners: number[] = [];
        for (let corner = 0; corner < piece.length; corner += 2) {
          const [x, z] = [piece[corner]!, piece[corner + 1]!];
          const y = plane.slopeX * x + plane.slopeZ * z + plane.height;
          corners.push(x, y, z);
          if (!decalOutlineHasCorner(outline, x, z)) this.cutCorners.push(x, y, z);
        }
        this.pieces.push({ triangle, outline: corners, whole: false });
      }
    }
  }

  /**
   * Keeps one triangle whole.
   *
   * @param triangle Triangle index.
   */
  private wholeKeep(triangle: number): void {
    const corners = Array.from(this.grid.trianglesAll().subarray(triangle * 9, triangle * 9 + 9));
    this.pieces.push({ triangle, outline: corners, whole: true });
  }

  /**
   * Writes every kept piece, first giving shared edges their missing corners
   * when anything was cut.
   */
  private piecesEmit(): void {
    const mending = this.cutCorners.length > 0;
    if (mending) this.seams.index(this.cutCorners);
    for (const piece of this.pieces) {
      const mended = mending ? this.seams.mend(piece.outline) : null;
      if (!mended && piece.whole) this.wholeEmit(piece.triangle);
      else this.pieceEmit(piece.triangle, mended ?? piece.outline, mended !== null);
    }
  }

  /**
   * Fans a convex piece into triangles and writes them with attributes blended
   * from the source triangle. A mended piece has corners lying on its edges, so
   * it fans from its centre to give every edge segment a triangle.
   *
   * @param triangle Source triangle index.
   * @param piece Convex outline, three floats per corner.
   * @param fromCentre True to fan from the centre instead of the first corner.
   */
  private pieceEmit(triangle: number, piece: readonly number[], fromCentre: boolean): void {
    const count = piece.length / 3;
    if (!fromCentre) {
      for (let fan = 1; fan + 1 < count; fan++) {
        this.imagePointEmit(triangle, piece[0]!, piece[2]!);
        this.imagePointEmit(triangle, piece[fan * 3]!, piece[fan * 3 + 2]!);
        this.imagePointEmit(triangle, piece[fan * 3 + 3]!, piece[fan * 3 + 5]!);
      }
      return;
    }
    let mx = 0;
    let mz = 0;
    for (let index = 0; index < count; index++) {
      mx = mx + piece[index * 3]! / count;
      mz = mz + piece[index * 3 + 2]! / count;
    }
    for (let index = 0; index < count; index++) {
      const next = index + 1 < count ? index + 1 : 0;
      this.imagePointEmit(triangle, mx, mz);
      this.imagePointEmit(triangle, piece[index * 3]!, piece[index * 3 + 2]!);
      this.imagePointEmit(triangle, piece[next * 3]!, piece[next * 3 + 2]!);
    }
  }

  /**
   * Writes one output corner at an image point inside a source triangle, with
   * attributes blended by its position in the triangle.
   *
   * @param triangle Source triangle index.
   * @param px Image x.
   * @param pz Image z.
   */
  private imagePointEmit(triangle: number, px: number, pz: number): void {
    const local = this.grid.trianglesAll();
    const base = triangle * 9;
    const ax = local[base]!;
    const az = local[base + 2]!;
    const bx = local[base + 3]!;
    const bz = local[base + 5]!;
    const cx = local[base + 6]!;
    const cz = local[base + 8]!;
    const determinant = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
    const x = px - ax;
    const z = pz - az;
    const wb = (x * (cz - az) - (cx - ax) * z) / determinant;
    const wc = ((bx - ax) * z - x * (bz - az)) / determinant;
    this.cornerEmit(triangle, 1 - wb - wc, wb, wc);
  }

  /**
   * Writes one triangle unchanged.
   *
   * @param triangle Triangle index.
   */
  private wholeEmit(triangle: number): void {
    this.cornerEmit(triangle, 1, 0, 0);
    this.cornerEmit(triangle, 0, 1, 0);
    this.cornerEmit(triangle, 0, 0, 1);
  }

  /**
   * Writes one output corner blended from the source triangle's corners.
   *
   * @param triangle Source triangle index.
   * @param wa Weight of the first corner.
   * @param wb Weight of the second corner.
   * @param wc Weight of the third corner.
   */
  private cornerEmit(triangle: number, wa: number, wb: number, wc: number): void {
    const source = this.source;
    if (!source) return;
    const base = triangle * 9;
    decalCornerBlend(source.positions, base, wa, wb, wc, this.positions);
    decalCornerBlend(source.normals, base, wa, wb, wc, this.normals);
    decalCornerBlend(source.projectorLocal, base, wa, wb, wc, this.projectorLocal);
    const uvs = source.uvs;
    const uvBase = triangle * 6;
    this.uvs.pushPair(
      wa * uvs[uvBase]! + wb * uvs[uvBase + 2]! + wc * uvs[uvBase + 4]!,
      wa * uvs[uvBase + 1]! + wb * uvs[uvBase + 3]! + wc * uvs[uvBase + 5]!,
    );
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
 * Appends one corner blended from a triangle's three corners.
 *
 * @param values Nine floats per triangle.
 * @param base Offset of the triangle.
 * @param wa Weight of the first corner.
 * @param wb Weight of the second corner.
 * @param wc Weight of the third corner.
 * @param list List receiving the blended corner.
 */
function decalCornerBlend(
  values: Float32Array,
  base: number,
  wa: number,
  wb: number,
  wc: number,
  list: DecalFloatList,
): void {
  list.pushTriple(
    wa * values[base]! + wb * values[base + 3]! + wc * values[base + 6]!,
    wa * values[base + 1]! + wb * values[base + 4]! + wc * values[base + 7]!,
    wa * values[base + 2]! + wb * values[base + 5]! + wc * values[base + 8]!,
  );
}

/**
 * Returns the footprint in the image of the part of a triangle that lies above
 * a plane, wound counter-clockwise, or null when nothing of it does.
 *
 * @param triangles Triangle list in projector space.
 * @param base Offset of the triangle.
 * @param plane Receiver plane.
 * @returns Flat x, z pairs or null.
 */
function decalShadowOf(triangles: Float32Array, base: number, plane: DecalImagePlane): number[] | null {
  const tolerance = DecalFirstHitClip.tolerance;
  const heights = DECAL_SHADOW_HEIGHTS;
  for (let corner = 0; corner < 3; corner++) {
    const x = triangles[base + corner * 3]!;
    const z = triangles[base + corner * 3 + 2]!;
    heights[corner] =
      triangles[base + corner * 3 + 1]! - (plane.slopeX * x + plane.slopeZ * z + plane.height) - tolerance;
  }
  if (heights[0]! <= 0 && heights[1]! <= 0 && heights[2]! <= 0) return null;
  const shadow: number[] = [];
  for (let corner = 0; corner < 3; corner++) {
    const next = corner === 2 ? 0 : corner + 1;
    const hp = heights[corner]!;
    const hq = heights[next]!;
    const px = triangles[base + corner * 3]!;
    const pz = triangles[base + corner * 3 + 2]!;
    if (hp > 0) shadow.push(px, pz);
    if ((hp > 0 && hq <= 0) || (hp <= 0 && hq > 0)) {
      const t = hp / (hp - hq);
      shadow.push(px + (triangles[base + next * 3]! - px) * t, pz + (triangles[base + next * 3 + 2]! - pz) * t);
    }
  }
  if (shadow.length < 6) return null;
  const area = decalPolygonSignedArea(shadow);
  if (Math.abs(area) < 1e-14) return null;
  return area > 0 ? shadow : decalPolygonReverse(shadow);
}

/** Scratch heights of a triangle's corners above a receiver plane. */
const DECAL_SHADOW_HEIGHTS = new Float64Array(3);

/**
 * Returns the part of a convex polygon inside a counter-clockwise convex
 * window, or null when too little of it is.
 *
 * @param polygon Flat x, z pairs.
 * @param window Counter-clockwise convex flat x, z pairs.
 * @returns Overlap or null.
 */
function decalPolygonClipConvex(polygon: readonly number[], window: readonly number[]): number[] | null {
  let inside: number[] = [...polygon];
  const length = window.length;
  for (let index = 0; index < length && inside.length >= 6; index += 2) {
    const next = index + 2 < length ? index + 2 : 0;
    const placement = decalPolygonSides(inside, window[index]!, window[index + 1]!, window[next]!, window[next + 1]!);
    if (placement === DECAL_POLYGON_ALL_LEFT) continue;
    const kept: number[] = [];
    decalPolygonSplitBySides(inside, kept, DECAL_CLIP_DISCARD);
    inside = kept;
  }
  if (inside.length < 6 || Math.abs(decalPolygonSignedArea(inside)) <= DECAL_POLYGON_AREA_MINIMUM) return null;
  return inside;
}

/** Scratch list for the parts a convex clip throws away. */
const DECAL_CLIP_DISCARD: number[] = [];

/**
 * Returns whether a counter-clockwise convex polygon holds every corner of
 * another polygon, edges included.
 *
 * @param window Counter-clockwise convex flat x, z pairs.
 * @param polygon Flat x, z pairs.
 * @returns True when the polygon lies inside the window.
 */
function decalPolygonContains(window: readonly number[], polygon: readonly number[]): boolean {
  const count = window.length / 2;
  for (let corner = 0; corner < count; corner++) {
    const next = (corner + 1) % count;
    const [ax, az, bx, bz] = [window[corner * 2]!, window[corner * 2 + 1]!, window[next * 2]!, window[next * 2 + 1]!];
    for (let index = 0; index < polygon.length; index += 2) {
      if ((bx - ax) * (polygon[index + 1]! - az) - (bz - az) * (polygon[index]! - ax) < -1e-12) return false;
    }
  }
  return true;
}

/**
 * Returns whether an image point is one of a triangle outline's corners.
 *
 * @param outline Triangle corners as flat x, z pairs.
 * @param x Point x.
 * @param z Point z.
 * @returns True when the point matches a corner.
 */
function decalOutlineHasCorner(outline: readonly number[], x: number, z: number): boolean {
  for (let index = 0; index < outline.length; index += 2) {
    if (Math.abs(outline[index]! - x) < 1e-7 && Math.abs(outline[index + 1]! - z) < 1e-7) return true;
  }
  return false;
}

/**
 * Returns a polygon with its corners in the opposite order.
 *
 * @param polygon Flat x, z pairs.
 * @returns Reversed polygon.
 */
function decalPolygonReverse(polygon: readonly number[]): number[] {
  const reversed: number[] = [];
  for (let index = polygon.length - 2; index >= 0; index -= 2) reversed.push(polygon[index]!, polygon[index + 1]!);
  return reversed;
}

/**
 * Returns the plane through a triangle in projector space, or null when the
 * projection sees it edge-on.
 *
 * @param triangles Triangle list in projector space.
 * @param base Offset of the triangle.
 * @returns Plane or null.
 */
function decalImagePlaneThrough(triangles: ArrayLike<number>, base: number): DecalImagePlane | null {
  const at = (index: number) => triangles[base + index] ?? 0;
  const ux = at(3) - at(0);
  const uy = at(4) - at(1);
  const uz = at(5) - at(2);
  const vx = at(6) - at(0);
  const vy = at(7) - at(1);
  const vz = at(8) - at(2);
  const determinant = ux * vz - uz * vx;
  if (Math.abs(determinant) < 1e-12) return null;
  const slopeX = (uy * vz - uz * vy) / determinant;
  const slopeZ = (ux * vy - uy * vx) / determinant;
  return { slopeX, slopeZ, height: at(1) - slopeX * at(0) - slopeZ * at(2) };
}
