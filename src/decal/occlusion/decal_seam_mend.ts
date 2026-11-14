/** Fewest grid cells along each image axis of the corner lookup. */
const DECAL_SEAM_GRID_MINIMUM = 32;

/** Most grid cells along each image axis of the corner lookup. */
const DECAL_SEAM_GRID_MAXIMUM = 256;

/** Distance in projector units within which a corner counts as on an edge. */
const DECAL_SEAM_TOLERANCE = 2e-5;

/**
 * Removes T-junctions between the convex pieces a first-hit cut leaves. Where
 * the corner of one piece lies on the edge of another, the edge gains that
 * corner too, so neighbouring pieces share every corner along their common
 * edges and no hairline cracks open between them when drawn.
 */
export class DecalSeamMend {
  private corners = new Float32Array(0);
  private grid = DECAL_SEAM_GRID_MINIMUM;
  private cellStarts = new Int32Array(DECAL_SEAM_GRID_MINIMUM * DECAL_SEAM_GRID_MINIMUM + 1);
  private cellItems = new Int32Array(0);

  /**
   * Indexes the corners a cut created, as projector-space x, y, z triples, once
   * each. Corners of the source mesh are shared already and need no lookup. The
   * grid grows with the corner count so cells stay sparse.
   *
   * @param corners Flat x, y, z triples.
   */
  index(corners: readonly number[]): void {
    this.corners = decalSeamCornersUnique(corners);
    const count = this.corners.length / 3;
    const grid = Math.min(DECAL_SEAM_GRID_MAXIMUM, Math.max(DECAL_SEAM_GRID_MINIMUM, Math.ceil(Math.sqrt(count))));
    if (grid !== this.grid) {
      this.grid = grid;
      this.cellStarts = new Int32Array(grid * grid + 1);
    }
    const starts = this.cellStarts;
    starts.fill(0);
    for (let corner = 0; corner < count; corner++) starts[this.cellOfCorner(corner) + 1]++;
    for (let cell = 1; cell < starts.length; cell++) starts[cell] = (starts[cell] ?? 0) + (starts[cell - 1] ?? 0);
    this.cellItems = new Int32Array(count);
    const cursor = starts.slice(0, starts.length - 1);
    for (let corner = 0; corner < count; corner++) this.cellItems[cursor[this.cellOfCorner(corner)]!++] = corner;
  }

  /**
   * Returns a piece outline with every indexed corner that lies inside one of
   * its edges inserted in order, or null when no edge gains a corner.
   *
   * @param polygon Piece outline, three floats per corner.
   * @returns Mended outline or null.
   */
  mend(polygon: readonly number[]): number[] | null {
    const count = polygon.length / 3;
    const mended: number[] = [];
    let gained = false;
    for (let corner = 0; corner < count; corner++) {
      const next = (corner + 1) % count;
      mended.push(polygon[corner * 3]!, polygon[corner * 3 + 1]!, polygon[corner * 3 + 2]!);
      const inner = this.edgeCorners(polygon, corner * 3, next * 3);
      if (inner.length === 0) continue;
      gained = true;
      for (const point of inner) mended.push(point[1], point[2], point[3]);
    }
    return gained ? mended : null;
  }

  /**
   * Lists indexed corners strictly inside an edge, sorted from its start.
   *
   * @param polygon Piece outline.
   * @param from Offset of the edge start.
   * @param to Offset of the edge end.
   * @returns Entries of position along the edge, then x, y, z.
   */
  private edgeCorners(polygon: readonly number[], from: number, to: number): [number, number, number, number][] {
    const ax = polygon[from]!;
    const ay = polygon[from + 1]!;
    const az = polygon[from + 2]!;
    const dx = polygon[to]! - ax;
    const dy = polygon[to + 1]! - ay;
    const dz = polygon[to + 2]! - az;
    const lengthSquared = dx * dx + dy * dy + dz * dz;
    const found: [number, number, number, number][] = [];
    if (lengthSquared < DECAL_SEAM_TOLERANCE * DECAL_SEAM_TOLERANCE * 4) return found;
    const margin = DECAL_SEAM_TOLERANCE;
    const grid = this.grid;
    const r0 = this.cellOf(Math.min(az, az + dz) - margin);
    const r1 = this.cellOf(Math.max(az, az + dz) + margin);
    const end = Math.sqrt(lengthSquared);
    for (let row = r0; row <= r1; row++) {
      // Only the columns the edge crosses within this row's band of z.
      const bandLow = row === 0 ? -Infinity : row / grid - 0.5 - margin;
      const bandHigh = row === grid - 1 ? Infinity : (row + 1) / grid - 0.5 + margin;
      let t0 = 0;
      let t1 = 1;
      if (Math.abs(dz) > 1e-12) {
        const ta = (bandLow - az) / dz;
        const tb = (bandHigh - az) / dz;
        t0 = Math.max(0, Math.min(ta, tb));
        t1 = Math.min(1, Math.max(ta, tb));
        if (t0 > t1) continue;
      }
      const c0 = this.cellOf(Math.min(ax + dx * t0, ax + dx * t1) - margin);
      const c1 = this.cellOf(Math.max(ax + dx * t0, ax + dx * t1) + margin);
      for (let column = c0; column <= c1; column++) {
        const cell = row * grid + column;
        const last = this.cellStarts[cell + 1]!;
        for (let item = this.cellStarts[cell]!; item < last; item++) {
          const base = this.cellItems[item]! * 3;
          const px = this.corners[base]!;
          const py = this.corners[base + 1]!;
          const pz = this.corners[base + 2]!;
          const along = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / lengthSquared;
          if (along * end <= DECAL_SEAM_TOLERANCE || (1 - along) * end <= DECAL_SEAM_TOLERANCE) continue;
          const ox = ax + dx * along - px;
          const oy = ay + dy * along - py;
          const oz = az + dz * along - pz;
          if (ox * ox + oy * oy + oz * oz > DECAL_SEAM_TOLERANCE * DECAL_SEAM_TOLERANCE) continue;
          if (found.some((entry) => Math.abs(entry[0] - along) * end <= DECAL_SEAM_TOLERANCE)) continue;
          found.push([along, px, py, pz]);
        }
      }
    }
    return found.sort((first, second) => first[0] - second[0]);
  }

  /**
   * Returns the lookup cell of an indexed corner.
   *
   * @param corner Corner index.
   * @returns Flat cell index.
   */
  private cellOfCorner(corner: number): number {
    return this.cellOf(this.corners[corner * 3 + 2]!) * this.grid + this.cellOf(this.corners[corner * 3]!);
  }

  /**
   * Returns the lookup cell of an image coordinate, clamped to the grid.
   *
   * @param coordinate Projector-space x or z.
   * @returns Cell index along that axis.
   */
  private cellOf(coordinate: number): number {
    return Math.min(this.grid - 1, Math.max(0, Math.floor((coordinate + 0.5) * this.grid)));
  }
}

/**
 * Returns corners with exact repeats removed; cuts meet at the same corner from
 * every piece that shares it.
 *
 * @param corners Flat x, y, z triples.
 * @returns Unique triples.
 */
function decalSeamCornersUnique(corners: readonly number[]): Float32Array<ArrayBuffer> {
  const seen = new Set<string>();
  const unique: number[] = [];
  for (let index = 0; index < corners.length; index += 3) {
    const key = `${corners[index]},${corners[index + 1]},${corners[index + 2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(corners[index]!, corners[index + 1]!, corners[index + 2]!);
  }
  return new Float32Array(unique);
}
