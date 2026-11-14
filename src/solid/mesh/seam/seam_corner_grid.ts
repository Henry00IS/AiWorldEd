import { SEAM_CORNER_CELL_ORIGIN, SEAM_CORNER_CELL_SIZE, SEAM_CORNER_ON_EDGE_DISTANCE } from './seam_constants.js';

/** Receives the coordinates of one registered corner. */
export type SeamCornerVisitor = (x: number, y: number, z: number) => void;

/** Number of values stored per corner entry in a bucket. */
const SEAM_CORNER_ENTRY_STRIDE = 4;

/**
 * Uniform spatial hash of output polygon corners. Every corner is filed into
 * each cell its tolerance ball overlaps, so a segment query only has to visit
 * the cells the segment itself passes through.
 */
export class SeamCornerGrid {
  private readonly buckets = new Map<number, number[]>();
  private readonly cellSize: number;
  private readonly reach: number;

  /**
   * Creates an empty corner grid.
   *
   * @param cellSize Edge length of one cell.
   * @param reach Tolerance radius each corner is filed with.
   */
  constructor(cellSize: number = SEAM_CORNER_CELL_SIZE, reach: number = SEAM_CORNER_ON_EDGE_DISTANCE) {
    this.cellSize = cellSize;
    this.reach = reach;
  }

  /** Removes every corner. */
  clear(): void {
    this.buckets.clear();
  }

  /**
   * Files a corner under an owner slot.
   *
   * @param x Corner x.
   * @param y Corner y.
   * @param z Corner z.
   * @param owner Numeric owner slot used to remove the corner again.
   */
  addCorner(x: number, y: number, z: number, owner: number): void {
    this.forEachCoveredCell(x, y, z, (key) => {
      let bucket = this.buckets.get(key);
      if (!bucket) {
        bucket = [];
        this.buckets.set(key, bucket);
      }
      bucket.push(x, y, z, owner);
    });
  }

  /**
   * Removes one previously filed corner of an owner.
   *
   * @param x Corner x.
   * @param y Corner y.
   * @param z Corner z.
   * @param owner Owner slot the corner was filed under.
   */
  removeCorner(x: number, y: number, z: number, owner: number): void {
    this.forEachCoveredCell(x, y, z, (key) => {
      const bucket = this.buckets.get(key);
      if (!bucket) return;
      this.removeEntryFromBucket(bucket, x, y, z, owner);
      if (bucket.length === 0) this.buckets.delete(key);
    });
  }

  /**
   * Visits every corner filed in a cell the segment passes through. A corner
   * may be visited more than once.
   *
   * @param ax Segment start x.
   * @param ay Segment start y.
   * @param az Segment start z.
   * @param bx Segment end x.
   * @param by Segment end y.
   * @param bz Segment end z.
   * @param visitor Receives each corner.
   */
  visitCornersAlongSegment(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    visitor: SeamCornerVisitor,
  ): void {
    const size = this.cellSize;
    const origin = SEAM_CORNER_CELL_ORIGIN;
    const startX = Math.floor((ax - origin) / size);
    const startY = Math.floor((ay - origin) / size);
    const startZ = Math.floor((az - origin) / size);
    if (startX === Math.floor((bx - origin) / size) && startY === Math.floor((by - origin) / size)) {
      if (startZ === Math.floor((bz - origin) / size)) return this.visitBucket(startX, startY, startZ, visitor);
    }
    this.walkSegmentCells(ax - origin, ay - origin, az - origin, bx - origin, by - origin, bz - origin, visitor);
  }

  /**
   * Walks the cells a segment crosses with a 3D digital differential analyser.
   *
   * @param ax Segment start x.
   * @param ay Segment start y.
   * @param az Segment start z.
   * @param bx Segment end x.
   * @param by Segment end y.
   * @param bz Segment end z.
   * @param visitor Receives each corner of each crossed cell.
   */
  private walkSegmentCells(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    visitor: SeamCornerVisitor,
  ): void {
    const walker = new SeamGridSegmentWalker(this.cellSize, ax, ay, az, bx, by, bz);
    let remaining = walker.cellCount;
    while (remaining-- > 0) {
      this.visitBucket(walker.cellX, walker.cellY, walker.cellZ, visitor);
      walker.step();
    }
  }

  /**
   * Visits the corners of one cell.
   *
   * @param cellX Cell x index.
   * @param cellY Cell y index.
   * @param cellZ Cell z index.
   * @param visitor Receives each corner.
   */
  private visitBucket(cellX: number, cellY: number, cellZ: number, visitor: SeamCornerVisitor): void {
    const bucket = this.buckets.get(seamCellKey(cellX, cellY, cellZ));
    if (!bucket) return;
    for (let entry = 0; entry < bucket.length; entry += SEAM_CORNER_ENTRY_STRIDE) {
      visitor(bucket[entry]!, bucket[entry + 1]!, bucket[entry + 2]!);
    }
  }

  /**
   * Calls back with the key of every cell the corner's tolerance ball overlaps.
   *
   * @param x Corner x.
   * @param y Corner y.
   * @param z Corner z.
   * @param receive Receives each cell key.
   */
  private forEachCoveredCell(x: number, y: number, z: number, receive: (key: number) => void): void {
    const size = this.cellSize;
    const reach = this.reach;
    const origin = SEAM_CORNER_CELL_ORIGIN;
    const minimumX = Math.floor((x - origin - reach) / size);
    const maximumX = Math.floor((x - origin + reach) / size);
    const minimumY = Math.floor((y - origin - reach) / size);
    const maximumY = Math.floor((y - origin + reach) / size);
    const minimumZ = Math.floor((z - origin - reach) / size);
    const maximumZ = Math.floor((z - origin + reach) / size);
    for (let cellX = minimumX; cellX <= maximumX; cellX++) {
      for (let cellY = minimumY; cellY <= maximumY; cellY++) {
        for (let cellZ = minimumZ; cellZ <= maximumZ; cellZ++) receive(seamCellKey(cellX, cellY, cellZ));
      }
    }
  }

  /**
   * Swap-removes the first entry matching a corner and owner.
   *
   * @param bucket Flat bucket entries.
   * @param x Corner x.
   * @param y Corner y.
   * @param z Corner z.
   * @param owner Owner slot.
   */
  private removeEntryFromBucket(bucket: number[], x: number, y: number, z: number, owner: number): void {
    for (let entry = 0; entry < bucket.length; entry += SEAM_CORNER_ENTRY_STRIDE) {
      if (bucket[entry] !== x || bucket[entry + 1] !== y || bucket[entry + 2] !== z) continue;
      if (bucket[entry + 3] !== owner) continue;
      const last = bucket.length - SEAM_CORNER_ENTRY_STRIDE;
      for (let offset = 0; offset < SEAM_CORNER_ENTRY_STRIDE; offset++) bucket[entry + offset] = bucket[last + offset]!;
      bucket.length = last;
      return;
    }
  }
}

/**
 * Mixes three integer cell indices into one numeric map key. Distinct cells may
 * share a key, which only adds candidates.
 *
 * @param cellX Cell x index.
 * @param cellY Cell y index.
 * @param cellZ Cell z index.
 * @returns Numeric cell key.
 */
export function seamCellKey(cellX: number, cellY: number, cellZ: number): number {
  return (Math.imul(cellX, 0x9e3779b1) ^ Math.imul(cellY, 0x85ebca77) ^ Math.imul(cellZ, 0xc2b2ae3d)) | 0;
}

/** Steps cell by cell along a segment through a uniform grid. */
class SeamGridSegmentWalker {
  cellX: number;
  cellY: number;
  cellZ: number;
  readonly cellCount: number;
  private readonly stepX: number;
  private readonly stepY: number;
  private readonly stepZ: number;
  private readonly deltaX: number;
  private readonly deltaY: number;
  private readonly deltaZ: number;
  private nextX: number;
  private nextY: number;
  private nextZ: number;

  /**
   * Starts a walk at the segment start cell.
   *
   * @param size Cell edge length.
   * @param ax Segment start x.
   * @param ay Segment start y.
   * @param az Segment start z.
   * @param bx Segment end x.
   * @param by Segment end y.
   * @param bz Segment end z.
   */
  constructor(size: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    this.cellX = Math.floor(ax / size);
    this.cellY = Math.floor(ay / size);
    this.cellZ = Math.floor(az / size);
    this.cellCount =
      Math.abs(Math.floor(bx / size) - this.cellX) +
      Math.abs(Math.floor(by / size) - this.cellY) +
      Math.abs(Math.floor(bz / size) - this.cellZ) +
      1;
    this.stepX = Math.sign(bx - ax);
    this.stepY = Math.sign(by - ay);
    this.stepZ = Math.sign(bz - az);
    this.deltaX = seamAxisDelta(size, bx - ax);
    this.deltaY = seamAxisDelta(size, by - ay);
    this.deltaZ = seamAxisDelta(size, bz - az);
    this.nextX = seamAxisFirstCrossing(size, ax, bx - ax, this.cellX);
    this.nextY = seamAxisFirstCrossing(size, ay, by - ay, this.cellY);
    this.nextZ = seamAxisFirstCrossing(size, az, bz - az, this.cellZ);
  }

  /** Moves into the next cell across the nearest cell boundary. */
  step(): void {
    if (this.nextX <= this.nextY && this.nextX <= this.nextZ) {
      this.cellX += this.stepX;
      this.nextX += this.deltaX;
    } else if (this.nextY <= this.nextZ) {
      this.cellY += this.stepY;
      this.nextY += this.deltaY;
    } else {
      this.cellZ += this.stepZ;
      this.nextZ += this.deltaZ;
    }
  }
}

/**
 * Segment parameter distance between two boundary crossings along one axis.
 *
 * @param size Cell edge length.
 * @param span Segment extent along the axis.
 * @returns Parameter step, infinite when the segment does not move on the axis.
 */
function seamAxisDelta(size: number, span: number): number {
  return span === 0 ? Infinity : Math.abs(size / span);
}

/**
 * Segment parameter of the first cell boundary crossing along one axis.
 *
 * @param size Cell edge length.
 * @param start Segment start coordinate.
 * @param span Segment extent along the axis.
 * @param cell Start cell index on the axis.
 * @returns Parameter of the first crossing, infinite when there is none.
 */
function seamAxisFirstCrossing(size: number, start: number, span: number, cell: number): number {
  if (span === 0) return Infinity;
  const boundary = span > 0 ? (cell + 1) * size : cell * size;
  return (boundary - start) / span;
}
