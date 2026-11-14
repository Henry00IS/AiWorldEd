import type { DecalFragment } from '@/decal/fragment/decal_fragment.js';

/**
 * Outcome of testing a cell rectangle against the mask: every cell sees the
 * plane first, something nearer the projector covers every cell, or both
 * occur.
 */
export type DecalFirstHitCoverage = 'visible' | 'shielded' | 'mixed';

/**
 * Plane over the image, as projector-space height y = slopeX·x + slopeZ·z +
 * height.
 */
export interface DecalImagePlane {
  /** Change of y per unit x. */
  slopeX: number;
  /** Change of y per unit z. */
  slopeZ: number;
  /** Value of y at x = z = 0. */
  height: number;
}

/** Convex outline in the image, as matching lists of corner x and z. */
export interface DecalImageOutline {
  /** Corner x coordinates, in order around the outline. */
  readonly xs: readonly number[];
  /** Corner z coordinates, in the same order. */
  readonly zs: readonly number[];
}

/**
 * Height map of the first surface the projection meets above every cell of the
 * image. Projector space runs from -0.5 to 0.5 on each axis and the image
 * travels down local y, so the first hit is the highest surface in a cell.
 */
export class DecalFirstHitMask {
  /** Cells along each image axis. */
  static readonly resolution = 192;
  /** Height a plane may sit below the first hit and still count as it. */
  static readonly tolerance = 1e-4;

  private readonly heights = new Float32Array(DecalFirstHitMask.resolution * DecalFirstHitMask.resolution);

  /**
   * Rebuilds the map from the receiving and shielding triangles of fragments.
   *
   * @param fragments Fragments of one decal, recorded with shielding.
   */
  build(fragments: Iterable<DecalFragment>): void {
    this.heights.fill(-Infinity);
    for (const fragment of fragments) {
      this.trianglesRaise(fragment.projectorLocal);
      this.trianglesRaise(fragment.shields);
    }
  }

  /**
   * Returns the cell index of an image coordinate, clamped to the map.
   *
   * @param coordinate Projector-space x or z.
   * @returns Cell index.
   */
  static cellOf(coordinate: number): number {
    const resolution = DecalFirstHitMask.resolution;
    return Math.min(resolution - 1, Math.max(0, Math.floor((coordinate + 0.5) * resolution)));
  }

  /**
   * Returns the projector-space coordinate of a cell boundary.
   *
   * @param boundary Boundary index from 0 to the resolution.
   * @returns Projector-space x or z.
   */
  static boundaryAt(boundary: number): number {
    return boundary / DecalFirstHitMask.resolution - 0.5;
  }

  /**
   * Tests a plane against the first hits of the cells whose centres lie in a
   * convex outline. An outline holding no cell centre is judged by the cell
   * under its corner average.
   *
   * @param plane Plane of the receiving surface.
   * @param outline Convex outline to test.
   * @returns Coverage of the outline.
   */
  coverage(plane: DecalImagePlane, outline: DecalImageOutline): DecalFirstHitCoverage {
    let seen = false;
    let shielded = false;
    decalOutlineCells(outline, (row, columnFirst, columnLast, z) => {
      for (let column = columnFirst; column <= columnLast; column++) {
        if (this.cellSees(plane, column, row, z)) seen = true;
        else shielded = true;
        if (seen && shielded) return false;
      }
      return true;
    });
    if (seen && shielded) return 'mixed';
    if (seen || shielded) return seen ? 'visible' : 'shielded';
    const average = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    return this.pointSees(plane, average(outline.xs), average(outline.zs)) ? 'visible' : 'shielded';
  }

  /**
   * Returns whether a plane is the first hit in the cell under an image point.
   *
   * @param plane Plane of the receiving surface.
   * @param x Projector-space x.
   * @param z Projector-space z.
   * @returns True when nothing sits higher than the plane there.
   */
  private pointSees(plane: DecalImagePlane, x: number, z: number): boolean {
    const row = DecalFirstHitMask.cellOf(z);
    return this.cellSees(plane, DecalFirstHitMask.cellOf(x), row, DecalFirstHitMask.boundaryAt(row + 0.5));
  }

  /**
   * Returns whether a plane is the first hit at a cell centre.
   *
   * @param plane Plane of the receiving surface.
   * @param column Cell column.
   * @param row Cell row.
   * @param z Projector-space z of the row centre.
   * @returns True when nothing sits higher than the plane there.
   */
  private cellSees(plane: DecalImagePlane, column: number, row: number, z: number): boolean {
    const highest = this.heights[row * DecalFirstHitMask.resolution + column] ?? -Infinity;
    const x = DecalFirstHitMask.boundaryAt(column + 0.5);
    return plane.slopeX * x + plane.slopeZ * z + plane.height >= highest - DecalFirstHitMask.tolerance;
  }

  /**
   * Raises the map to every triangle of a projector-space list.
   *
   * @param triangles Projector-space positions, nine floats per triangle.
   */
  private trianglesRaise(triangles: Float32Array): void {
    for (let base = 0; base + 9 <= triangles.length; base += 9) this.triangleRaise(triangles, base);
  }

  /**
   * Raises every cell whose centre lies inside a triangle to the triangle's
   * height there.
   *
   * @param triangles Projector-space positions.
   * @param base First float of the triangle.
   */
  private triangleRaise(triangles: Float32Array, base: number): void {
    const plane = decalImagePlaneThrough(triangles, base);
    if (!plane) return;
    const at = (index: number) => triangles[base + index] ?? 0;
    const outline = { xs: [at(0), at(3), at(6)], zs: [at(2), at(5), at(8)] };
    const resolution = DecalFirstHitMask.resolution;
    decalOutlineCells(outline, (row, columnFirst, columnLast, z) => {
      const rowHeight = plane.slopeZ * z + plane.height;
      for (let column = columnFirst; column <= columnLast; column++) {
        const index = row * resolution + column;
        const height = plane.slopeX * DecalFirstHitMask.boundaryAt(column + 0.5) + rowHeight;
        if (height > (this.heights[index] ?? -Infinity)) this.heights[index] = height;
      }
      return true;
    });
  }
}

/**
 * Visits, row by row, the cells whose centres lie inside a convex outline,
 * edges included. The visitor returns false to stop early.
 *
 * @param outline Convex outline.
 * @param visit Receives a row, its first and last covered columns and the row
 *   centre z.
 */
function decalOutlineCells(
  outline: DecalImageOutline,
  visit: (row: number, columnFirst: number, columnLast: number, z: number) => boolean,
): void {
  const resolution = DecalFirstHitMask.resolution;
  const centreIndex = (coordinate: number, round: (value: number) => number) =>
    round((coordinate + 0.5) * resolution - 0.5);
  const rowFirst = Math.max(0, centreIndex(Math.min(...outline.zs), Math.ceil));
  const rowLast = Math.min(resolution - 1, centreIndex(Math.max(...outline.zs), Math.floor));
  for (let row = rowFirst; row <= rowLast; row++) {
    const z = DecalFirstHitMask.boundaryAt(row + 0.5);
    const span = decalOutlineSpan(outline, z);
    if (!span) continue;
    const columnFirst = Math.max(0, centreIndex(span[0], Math.ceil));
    const columnLast = Math.min(resolution - 1, centreIndex(span[1], Math.floor));
    if (columnFirst <= columnLast && !visit(row, columnFirst, columnLast, z)) return;
  }
}

/**
 * Returns the x range a convex outline covers along a line of constant z.
 *
 * @param outline Convex outline.
 * @param z Line position.
 * @returns Lowest and highest x, or null when the line misses the outline.
 */
function decalOutlineSpan(outline: DecalImageOutline, z: number): [number, number] | null {
  let low = Infinity;
  let high = -Infinity;
  const count = outline.xs.length;
  for (let corner = 0; corner < count; corner++) {
    const ax = outline.xs[corner] ?? 0;
    const az = outline.zs[corner] ?? 0;
    const bx = outline.xs[(corner + 1) % count] ?? 0;
    const bz = outline.zs[(corner + 1) % count] ?? 0;
    if ((z < az && z < bz) || (z > az && z > bz)) continue;
    const xs = az === bz ? [ax, bx] : [ax + ((z - az) / (bz - az)) * (bx - ax)];
    for (const x of xs) {
      low = Math.min(low, x);
      high = Math.max(high, x);
    }
  }
  return low <= high ? [low, high] : null;
}

/**
 * Returns the plane through a projector-space triangle, or null when the
 * triangle is seen edge-on from the projector.
 *
 * @param triangles Projector-space positions.
 * @param base First float of the triangle.
 * @returns Plane, or null.
 */
export function decalImagePlaneThrough(triangles: ArrayLike<number>, base: number): DecalImagePlane | null {
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
