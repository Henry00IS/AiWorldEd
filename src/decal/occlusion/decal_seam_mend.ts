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
    for (let corner = 0; corner < count; corner++) starts[this.cellOfCorner(corner) + 1]!++;
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
    let mended: number[] | null = null;
    const found = this.found;
    for (let corner = 0; corner < count; corner++) {
      const next = corner + 1 < count ? corner + 1 : 0;
      const inner = this.edgeCorners(polygon, corner * 3, next * 3);
      if (inner === 0) {
        if (mended) mended.push(polygon[corner * 3]!, polygon[corner * 3 + 1]!, polygon[corner * 3 + 2]!);
        continue;
      }
      mended ??= polygon.slice(0, corner * 3);
      mended.push(polygon[corner * 3]!, polygon[corner * 3 + 1]!, polygon[corner * 3 + 2]!);
      for (let entry = 0; entry < inner; entry++)
        mended.push(found[entry * 4 + 1]!, found[entry * 4 + 2]!, found[entry * 4 + 3]!);
    }
    return mended;
  }

  /** Corners found inside one edge: position along it, then x, y, z. */
  private found: number[] = [];

  /**
   * Finds the indexed corners strictly inside an edge and leaves them in the
   * found list sorted from its start.
   *
   * @param polygon Piece outline.
   * @param from Offset of the edge start.
   * @param to Offset of the edge end.
   * @returns Number of corners found.
   */
  private edgeCorners(polygon: readonly number[], from: number, to: number): number {
    const ax = polygon[from]!;
    const ay = polygon[from + 1]!;
    const az = polygon[from + 2]!;
    const dx = polygon[to]! - ax;
    const dy = polygon[to + 1]! - ay;
    const dz = polygon[to + 2]! - az;
    const lengthSquared = dx * dx + dy * dy + dz * dz;
    if (lengthSquared < DECAL_SEAM_TOLERANCE * DECAL_SEAM_TOLERANCE * 4) return 0;
    const found = this.found;
    let foundCount = 0;
    const corners = this.corners;
    const starts = this.cellStarts;
    const items = this.cellItems;
    const margin = DECAL_SEAM_TOLERANCE;
    const grid = this.grid;
    const r0 = this.cellOf(Math.min(az, az + dz) - margin);
    const r1 = this.cellOf(Math.max(az, az + dz) + margin);
    const end = Math.sqrt(lengthSquared);
    // Box around the edge, twice the tolerance wide, that holds every corner
    // the exact test below can accept; it rejects most lookups cheaply.
    const reach = DECAL_SEAM_TOLERANCE * 2;
    const minX = Math.min(ax, ax + dx) - reach;
    const maxX = Math.max(ax, ax + dx) + reach;
    const minY = Math.min(ay, ay + dy) - reach;
    const maxY = Math.max(ay, ay + dy) + reach;
    const minZ = Math.min(az, az + dz) - reach;
    const maxZ = Math.max(az, az + dz) + reach;
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
        const last = starts[cell + 1]!;
        for (let item = starts[cell]!; item < last; item++) {
          const base = items[item]! * 3;
          const px = corners[base]!;
          const py = corners[base + 1]!;
          const pz = corners[base + 2]!;
          if (px < minX || px > maxX || py < minY || py > maxY || pz < minZ || pz > maxZ) continue;
          const along = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / lengthSquared;
          if (along * end <= DECAL_SEAM_TOLERANCE || (1 - along) * end <= DECAL_SEAM_TOLERANCE) continue;
          const ox = ax + dx * along - px;
          const oy = ay + dy * along - py;
          const oz = az + dz * along - pz;
          if (ox * ox + oy * oy + oz * oz > DECAL_SEAM_TOLERANCE * DECAL_SEAM_TOLERANCE) continue;
          let repeat = false;
          for (let entry = 0; entry < foundCount && !repeat; entry++)
            repeat = Math.abs(found[entry * 4]! - along) * end <= DECAL_SEAM_TOLERANCE;
          if (repeat) continue;
          // Insert in order of position along the edge.
          let slot = foundCount;
          while (slot > 0 && found[(slot - 1) * 4]! > along) {
            found[slot * 4] = found[(slot - 1) * 4]!;
            found[slot * 4 + 1] = found[(slot - 1) * 4 + 1]!;
            found[slot * 4 + 2] = found[(slot - 1) * 4 + 2]!;
            found[slot * 4 + 3] = found[(slot - 1) * 4 + 3]!;
            slot--;
          }
          found[slot * 4] = along;
          found[slot * 4 + 1] = px;
          found[slot * 4 + 2] = py;
          found[slot * 4 + 3] = pz;
          foundCount++;
        }
      }
    }
    return foundCount;
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
  const count = corners.length / 3;
  let size = 16;
  while (size < count * 2) size *= 2;
  const slots = new Int32Array(size).fill(-1);
  const mask = size - 1;
  const unique = new Float32Array(corners.length);
  const kept: number[] = [];
  for (let index = 0; index < corners.length; index += 3) {
    const x = corners[index]!;
    const y = corners[index + 1]!;
    const z = corners[index + 2]!;
    let slot = decalSeamCornerHash(x, y, z) & mask;
    let repeat = false;
    for (let at = slots[slot]!; at >= 0; slot = (slot + 1) & mask, at = slots[slot]!) {
      if (decalSeamSame(corners[at]!, x) && decalSeamSame(corners[at + 1]!, y) && decalSeamSame(corners[at + 2]!, z)) {
        repeat = true;
        break;
      }
    }
    if (repeat) continue;
    slots[slot] = index;
    kept.push(index);
  }
  for (let entry = 0; entry < kept.length; entry++) {
    const index = kept[entry]!;
    unique[entry * 3] = corners[index]!;
    unique[entry * 3 + 1] = corners[index + 1]!;
    unique[entry * 3 + 2] = corners[index + 2]!;
  }
  return unique.slice(0, kept.length * 3);
}

/** Scratch view for hashing the bits of a coordinate. */
const DECAL_SEAM_HASH_FLOAT = new Float64Array(1);
const DECAL_SEAM_HASH_WORDS = new Uint32Array(DECAL_SEAM_HASH_FLOAT.buffer);

/**
 * Hashes a corner by the bits of its coordinates, with zero and negative zero
 * alike since they print the same and count as one corner.
 *
 * @param x Corner x.
 * @param y Corner y.
 * @param z Corner z.
 * @returns Hash.
 */
function decalSeamCornerHash(x: number, y: number, z: number): number {
  let hash = 2166136261;
  for (const value of [x, y, z]) {
    DECAL_SEAM_HASH_FLOAT[0] = value === 0 ? 0 : value;
    hash = Math.imul(hash ^ DECAL_SEAM_HASH_WORDS[0]!, 16777619);
    hash = Math.imul(hash ^ DECAL_SEAM_HASH_WORDS[1]!, 16777619);
  }
  return hash >>> 0;
}

/**
 * Returns whether two coordinates name the same corner: equal numbers, with
 * not-a-number matching itself.
 *
 * @param a First coordinate.
 * @param b Second coordinate.
 * @returns True when they match.
 */
function decalSeamSame(a: number, b: number): boolean {
  return a === b || (a !== a && b !== b);
}
