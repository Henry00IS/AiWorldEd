/**
 * Convex polygon being cut against the faces of the unit projector box. Each
 * corner stores its projector-space position, its model-space position and its
 * model-space normal, so every attribute stays interpolated along the cut.
 */
export class DecalClipPolygon {
  /** Floats stored per corner: projector xyz, model xyz, normal xyz. */
  static readonly floatsPerCorner = 9;
  /** Most corners a triangle can reach after six cuts. */
  static readonly maximumCorners = 12;

  private corners = new Float64Array(DecalClipPolygon.maximumCorners * DecalClipPolygon.floatsPerCorner);
  private spare = new Float64Array(DecalClipPolygon.maximumCorners * DecalClipPolygon.floatsPerCorner);
  private cornerTotal = 0;

  /**
   * Returns the number of corners the polygon has.
   *
   * @returns Corner count.
   */
  cornerCount(): number {
    return this.cornerTotal;
  }

  /**
   * Returns the backing corner array; corner i starts at i * floatsPerCorner.
   *
   * @returns Corner floats.
   */
  cornerData(): Float64Array {
    return this.corners;
  }

  /** Empties the polygon. */
  reset(): void {
    this.cornerTotal = 0;
  }

  /**
   * Appends a corner.
   *
   * @param source Array holding the corner floats.
   * @param offset Index of the corner's first float in the source.
   */
  cornerAppend(source: Float64Array, offset: number): void {
    const target = this.cornerTotal * DecalClipPolygon.floatsPerCorner;
    for (let index = 0; index < DecalClipPolygon.floatsPerCorner; index++) {
      this.corners[target + index] = source[offset + index] ?? 0;
    }
    this.cornerTotal++;
  }

  /**
   * Keeps the part of the polygon whose projector coordinate on one axis is at
   * most one half on the given side of the box.
   *
   * @param axis Projector axis index: 0 for x, 1 for y, 2 for z.
   * @param side 1 for the positive face, -1 for the negative face.
   */
  cutByBoxFace(axis: number, side: number): void {
    const count = this.cornerTotal;
    let kept = 0;
    for (let index = 0; index < count; index++) {
      const next = (index + 1) % count;
      const reachHere = this.faceClearance(this.corners, index, axis, side);
      const reachNext = this.faceClearance(this.corners, next, axis, side);
      if (reachHere >= 0) kept = this.spareCopy(index, kept);
      if (reachHere >= 0 !== reachNext >= 0) kept = this.spareCrossing(index, next, reachHere, reachNext, kept);
    }
    this.buffersSwap(kept);
  }

  /**
   * Returns how far a corner lies inside one box face; negative when outside.
   *
   * @param data Corner array.
   * @param corner Corner index.
   * @param axis Projector axis index.
   * @param side Face side, 1 or -1.
   * @returns Signed clearance to the face.
   */
  private faceClearance(data: Float64Array, corner: number, axis: number, side: number): number {
    return 0.5 - side * (data[corner * DecalClipPolygon.floatsPerCorner + axis] ?? 0);
  }

  /**
   * Copies one corner into the spare array.
   *
   * @param corner Corner index in the current array.
   * @param kept Corners already in the spare array.
   * @returns New spare corner count.
   */
  private spareCopy(corner: number, kept: number): number {
    const source = corner * DecalClipPolygon.floatsPerCorner;
    const target = kept * DecalClipPolygon.floatsPerCorner;
    for (let index = 0; index < DecalClipPolygon.floatsPerCorner; index++) {
      this.spare[target + index] = this.corners[source + index] ?? 0;
    }
    return kept + 1;
  }

  /**
   * Writes the point where the edge between two corners crosses a box face into
   * the spare array. The edge is always measured from the same end, so two
   * triangles sharing the edge produce the identical point.
   *
   * @param first First corner index.
   * @param second Second corner index.
   * @param reachFirst Clearance of the first corner.
   * @param reachSecond Clearance of the second corner.
   * @param kept Corners already in the spare array.
   * @returns New spare corner count.
   */
  private spareCrossing(first: number, second: number, reachFirst: number, reachSecond: number, kept: number): number {
    const swap = this.cornerOrderedAfter(first, second);
    const from = swap ? second : first;
    const to = swap ? first : second;
    const reachFrom = swap ? reachSecond : reachFirst;
    const reachTo = swap ? reachFirst : reachSecond;
    const fraction = reachFrom / (reachFrom - reachTo);
    const fromOffset = from * DecalClipPolygon.floatsPerCorner;
    const toOffset = to * DecalClipPolygon.floatsPerCorner;
    const target = kept * DecalClipPolygon.floatsPerCorner;
    for (let index = 0; index < DecalClipPolygon.floatsPerCorner; index++) {
      const start = this.corners[fromOffset + index] ?? 0;
      const end = this.corners[toOffset + index] ?? 0;
      this.spare[target + index] = start + (end - start) * fraction;
    }
    return kept + 1;
  }

  /**
   * Returns whether the first corner sorts after the second by model position.
   *
   * @param first First corner index.
   * @param second Second corner index.
   * @returns True when the first corner's model position is greater.
   */
  private cornerOrderedAfter(first: number, second: number): boolean {
    const firstOffset = first * DecalClipPolygon.floatsPerCorner + 3;
    const secondOffset = second * DecalClipPolygon.floatsPerCorner + 3;
    for (let index = 0; index < 3; index++) {
      const difference = (this.corners[firstOffset + index] ?? 0) - (this.corners[secondOffset + index] ?? 0);
      if (difference !== 0) return difference > 0;
    }
    return false;
  }

  /**
   * Makes the spare array the current polygon.
   *
   * @param kept Corner count of the spare array.
   */
  private buffersSwap(kept: number): void {
    const previous = this.corners;
    this.corners = this.spare;
    this.spare = previous;
    this.cornerTotal = kept;
  }
}
