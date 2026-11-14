import type { DecalFragment } from '@/decal/fragment/decal_fragment.js';
import { DecalFloatList } from '@/decal/fragment/decal_float_list.js';
import type { DecalJoinedTriangles } from '@/decal/presentation/decal_presentation_geometry.js';
import { DecalOccluderGrid } from './decal_occluder_grid.js';
import { DecalSeamMend } from './decal_seam_mend.js';
import { decalPolygonBox, decalPolygonSignedArea, decalPolygonSubtract } from './decal_image_polygon.js';

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
 */
export class DecalFirstHitClip {
  /** Height a surface must rise above a receiver before it shields it. */
  static readonly tolerance = 1e-4;

  private readonly grid = new DecalOccluderGrid();
  private readonly near: number[] = [];
  private readonly seams = new DecalSeamMend();
  private pieces: DecalFirstHitPiece[] = [];
  private cutAny = false;
  private readonly cutCorners: number[] = [];
  private readonly positions = new DecalFloatList();
  private readonly normals = new DecalFloatList();
  private readonly uvs = new DecalFloatList();
  private readonly projectorLocal = new DecalFloatList();
  private source: DecalJoinedTriangles | null = null;

  /**
   * Returns the parts of joined decal triangles that no other surface of the
   * decal shields.
   *
   * @param joined Triangles with projector-space positions, in fragment order.
   * @param fragments Fragments the triangles were joined from, with shields.
   * @returns New joined triangles.
   */
  apply(joined: DecalJoinedTriangles, fragments: readonly DecalFragment[]): DecalJoinedTriangles {
    this.grid.build([joined.projectorLocal, ...fragments.map((fragment) => fragment.shields)]);
    this.listsClear();
    this.source = joined;
    this.pieces = [];
    this.cutAny = false;
    this.cutCorners.length = 0;
    const count = joined.positions.length / 9;
    for (let triangle = 0; triangle < count; triangle++) this.triangleClip(triangle);
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
      if (pieces.length === 0) {
        this.cutAny = true;
        return;
      }
    }
    if (!cut) return this.wholeKeep(triangle);
    this.cutAny = true;
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
    const local = this.grid.trianglesAll();
    const base = triangle * 9;
    const [ax, az, bx, bz, cx, cz] = [
      local[base]!,
      local[base + 2]!,
      local[base + 3]!,
      local[base + 5]!,
      local[base + 6]!,
      local[base + 8]!,
    ];
    const determinant = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
    const at = (px: number, pz: number) => {
      const [x, z] = [px - ax, pz - az];
      const wb = (x * (cz - az) - (cx - ax) * z) / determinant;
      const wc = ((bx - ax) * z - x * (bz - az)) / determinant;
      this.cornerEmit(triangle, 1 - wb - wc, wb, wc);
    };
    const corner = (index: number) => at(piece[index * 3]!, piece[index * 3 + 2]!);
    const count = piece.length / 3;
    if (!fromCentre) {
      for (let fan = 1; fan + 1 < count; fan++) [0, fan, fan + 1].forEach(corner);
      return;
    }
    let [mx, mz] = [0, 0];
    for (let index = 0; index < count; index++)
      [mx, mz] = [mx + piece[index * 3]! / count, mz + piece[index * 3 + 2]! / count];
    for (let index = 0; index < count; index++) {
      at(mx, mz);
      corner(index);
      corner((index + 1) % count);
    }
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
    const triple = (values: Float32Array, list: DecalFloatList) => {
      const base = triangle * 9;
      const blend = (axis: number) =>
        wa * (values[base + axis] ?? 0) + wb * (values[base + 3 + axis] ?? 0) + wc * (values[base + 6 + axis] ?? 0);
      list.pushTriple(blend(0), blend(1), blend(2));
    };
    triple(source.positions, this.positions);
    triple(source.normals, this.normals);
    triple(source.projectorLocal, this.projectorLocal);
    const base = triangle * 6;
    const uv = (axis: number) =>
      wa * (source.uvs[base + axis] ?? 0) +
      wb * (source.uvs[base + 2 + axis] ?? 0) +
      wc * (source.uvs[base + 4 + axis] ?? 0);
    this.uvs.pushPair(uv(0), uv(1));
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
 * Returns the footprint in the image of the part of a triangle that lies above
 * a plane, wound counter-clockwise, or null when nothing of it does.
 *
 * @param triangles Triangle list in projector space.
 * @param base Offset of the triangle.
 * @param plane Receiver plane.
 * @returns Flat x, z pairs or null.
 */
function decalShadowOf(triangles: Float32Array, base: number, plane: DecalImagePlane): number[] | null {
  const above = (corner: number) => {
    const x = triangles[base + corner * 3] ?? 0;
    const z = triangles[base + corner * 3 + 2] ?? 0;
    return (
      (triangles[base + corner * 3 + 1] ?? 0) -
      (plane.slopeX * x + plane.slopeZ * z + plane.height) -
      DecalFirstHitClip.tolerance
    );
  };
  const heights = [above(0), above(1), above(2)];
  if (heights[0]! <= 0 && heights[1]! <= 0 && heights[2]! <= 0) return null;
  const shadow: number[] = [];
  for (let corner = 0; corner < 3; corner++) {
    const next = (corner + 1) % 3;
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
