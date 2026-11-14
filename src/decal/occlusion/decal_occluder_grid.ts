/** Floats per occluder bound: minimum x, maximum x, minimum z, maximum z, top. */
const DECAL_OCCLUDER_BOUND_STRIDE = 5;

/**
 * Uniform grid over the image plane of a projector that lists, per cell, the
 * occluding triangles whose footprint reaches it. Projector space runs from
 * -0.5 to 0.5 on x and z, and the image travels down y.
 */
export class DecalOccluderGrid {
  /** Cells along each image axis. */
  static readonly resolution = 16;

  private triangles = new Float32Array(0);
  private bounds = new Float32Array(0);
  private cellStarts = new Int32Array(DecalOccluderGrid.resolution * DecalOccluderGrid.resolution + 1);
  private cellItems = new Int32Array(0);
  private stamps = new Uint32Array(0);
  private stamp = 0;

  /**
   * Rebuilds the grid from triangle lists in projector space.
   *
   * @param lists Triangle lists, nine floats per triangle, indexed in order.
   */
  build(lists: readonly Float32Array[]): void {
    const total = lists.reduce((sum, list) => sum + list.length, 0);
    this.triangles = new Float32Array(total);
    let offset = 0;
    for (const list of lists) {
      this.triangles.set(list, offset);
      offset += list.length;
    }
    const count = total / 9;
    this.bounds = new Float32Array(count * DECAL_OCCLUDER_BOUND_STRIDE);
    for (let triangle = 0; triangle < count; triangle++) this.boundStore(triangle);
    this.cellsFill(count);
    this.stamps = new Uint32Array(count);
    this.stamp = 0;
  }

  /**
   * Returns the stored triangles, nine floats per triangle.
   *
   * @returns Triangle list.
   */
  trianglesAll(): Float32Array {
    return this.triangles;
  }

  /**
   * Lists the triangles whose footprint meets a box and that rise above a
   * height somewhere, each once.
   *
   * @param box Minimum x, maximum x, minimum z, maximum z.
   * @param floor Height the triangles must rise above.
   * @param skip Triangle index to leave out.
   * @param out List receiving triangle indices.
   */
  near(box: readonly number[], floor: number, skip: number, out: number[]): void {
    out.length = 0;
    this.stamp++;
    const [minX = 0, maxX = 0, minZ = 0, maxZ = 0] = box;
    const [c0, c1, r0, r1] = [cellOf(minX), cellOf(maxX), cellOf(minZ), cellOf(maxZ)];
    for (let row = r0; row <= r1; row++) {
      for (let column = c0; column <= c1; column++) {
        const cell = row * DecalOccluderGrid.resolution + column;
        const end = this.cellStarts[cell + 1] ?? 0;
        for (let item = this.cellStarts[cell] ?? 0; item < end; item++) {
          const triangle = this.cellItems[item] ?? 0;
          if (triangle === skip || this.stamps[triangle] === this.stamp) continue;
          this.stamps[triangle] = this.stamp;
          if (this.reaches(triangle, minX, maxX, minZ, maxZ, floor)) out.push(triangle);
        }
      }
    }
  }

  /**
   * Returns whether a triangle's bound meets a box and rises above a height.
   *
   * @param triangle Triangle index.
   * @param minX Box minimum x.
   * @param maxX Box maximum x.
   * @param minZ Box minimum z.
   * @param maxZ Box maximum z.
   * @param floor Height to rise above.
   * @returns True when it may shield part of the box.
   */
  private reaches(triangle: number, minX: number, maxX: number, minZ: number, maxZ: number, floor: number): boolean {
    const base = triangle * DECAL_OCCLUDER_BOUND_STRIDE;
    const b = this.bounds;
    return (
      (b[base] ?? 0) <= maxX &&
      (b[base + 1] ?? 0) >= minX &&
      (b[base + 2] ?? 0) <= maxZ &&
      (b[base + 3] ?? 0) >= minZ &&
      (b[base + 4] ?? 0) > floor
    );
  }

  /**
   * Stores the bound of one triangle.
   *
   * @param triangle Triangle index.
   */
  private boundStore(triangle: number): void {
    const t = this.triangles;
    const base = triangle * 9;
    const xs = [t[base] ?? 0, t[base + 3] ?? 0, t[base + 6] ?? 0];
    const ys = [t[base + 1] ?? 0, t[base + 4] ?? 0, t[base + 7] ?? 0];
    const zs = [t[base + 2] ?? 0, t[base + 5] ?? 0, t[base + 8] ?? 0];
    this.bounds.set(
      [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs), Math.max(...ys)],
      triangle * DECAL_OCCLUDER_BOUND_STRIDE,
    );
  }

  /**
   * Lists every triangle in the cells its bound covers, by counting first and
   * then filling one flat array.
   *
   * @param count Triangle count.
   */
  private cellsFill(count: number): void {
    const starts = this.cellStarts;
    starts.fill(0);
    this.cellsVisit(count, (cell) => starts[cell + 1]++);
    for (let cell = 1; cell < starts.length; cell++) starts[cell] = (starts[cell] ?? 0) + (starts[cell - 1] ?? 0);
    this.cellItems = new Int32Array(starts[starts.length - 1] ?? 0);
    const cursor = starts.slice(0, starts.length - 1);
    this.cellsVisit(count, (cell, triangle) => {
      this.cellItems[cursor[cell]!++] = triangle;
    });
  }

  /**
   * Calls a visitor for every cell each triangle's bound covers.
   *
   * @param count Triangle count.
   * @param visit Visitor receiving the cell and triangle index.
   */
  private cellsVisit(count: number, visit: (cell: number, triangle: number) => void): void {
    const b = this.bounds;
    for (let triangle = 0; triangle < count; triangle++) {
      const base = triangle * DECAL_OCCLUDER_BOUND_STRIDE;
      const [c0, c1] = [cellOf(b[base] ?? 0), cellOf(b[base + 1] ?? 0)];
      const [r0, r1] = [cellOf(b[base + 2] ?? 0), cellOf(b[base + 3] ?? 0)];
      for (let row = r0; row <= r1; row++) {
        for (let column = c0; column <= c1; column++) visit(row * DecalOccluderGrid.resolution + column, triangle);
      }
    }
  }
}

/**
 * Returns the grid cell of an image coordinate, clamped to the grid.
 *
 * @param coordinate Projector-space x or z.
 * @returns Cell index along that axis.
 */
function cellOf(coordinate: number): number {
  const resolution = DecalOccluderGrid.resolution;
  return Math.min(resolution - 1, Math.max(0, Math.floor((coordinate + 0.5) * resolution)));
}
