import type { CurveSegmentSide } from '@/curve/model/curve_model.js';

/** A station of a revolved profile: height along the axis and radius. */
export interface GeneratorRevolveStation {
  /** Position along the axis. */
  height: number;
  /** Distance from the axis. */
  radius: number;
  /** True when the piece from this station up to the next is square. */
  square?: boolean;
  /**
   * Corner size of the square or polygon piece above, as a fraction of half a
   * side.
   */
  cornerSize?: number;
  /** Faces across each corner of the piece above. */
  cornerSides?: number;
  /** Polygon face count of the piece above. */
  polygonSides?: number;
  /**
   * Arm thickness of the cross piece above, as a fraction of the section width;
   * absent for other sections.
   */
  crossArm?: number;
  /**
   * Thickness of the bar piece above, as a fraction of the section width;
   * absent for other sections.
   */
  barThickness?: number;
  /**
   * Bar thickness of this ring, as a fraction of its width, inside and at the
   * upper end of a tapered bar segment; absent rings use the thickness of the
   * piece they belong to.
   */
  barRing?: number;
  /**
   * Flat side length of the stadium piece above, as a fraction of the section
   * width; absent for other sections.
   */
  stadiumStraight?: number;
  /**
   * Side mode of the flat piece above; absent mirrors the profile on both
   * sides.
   */
  side?: CurveSegmentSide;
  /** True when the piece above keeps a fixed depth. */
  fixedDepth?: boolean;
  /**
   * Shift of this ring's section centre along the section's own X axis, half
   * the difference of its +X and -X extents; `radius` is then half the width.
   * Absent for mirrored rings.
   */
  offset?: number;
  /**
   * Half-width whose depth this ring uses instead of its own, for pieces with a
   * fixed depth.
   */
  depthRadius?: number;
  /** Accumulated rotation in degrees at this ring. */
  angle?: number;
  /** Whether the piece above changes its rotation. */
  twisted?: boolean;
  /**
   * Rigid turn of the piece above in degrees, already included in `angle`;
   * untwisted round pieces turn by this alone.
   */
  rotation?: number;
  /**
   * Index of the curve segment the piece above belongs to; present only on
   * curves where some segment blends.
   */
  segment?: number;
  /**
   * True when the segment of the piece above morphs from the section below its
   * first point.
   */
  blendStart?: boolean;
  /**
   * True when the segment of the piece above morphs into the section above its
   * last point.
   */
  blendEnd?: boolean;
}

/** Smallest height or radius difference that counts, in profile units. */
export const GENERATOR_REVOLVE_EPSILON = 1e-6;

/**
 * Splits a profile polyline into runs whose revolved union is convex. A run is
 * a chain of joined pieces of one cross-section whose slopes never increase
 * (the radius is concave over the run). Vertical steps and zero-radius pieces
 * end a run and make no brush; a change between round and square starts a new
 * run.
 *
 * @param polyline Profile points ordered by height.
 * @returns Runs of stations; each run becomes one convex brush.
 */
export function generatorRevolveRuns(polyline: readonly GeneratorRevolveStation[]): GeneratorRevolveStation[][] {
  const runs: GeneratorRevolveStation[][] = [];
  let current: GeneratorRevolveStation[] | null = null;
  for (let index = 0; index + 1 < polyline.length; index++) {
    const start = polyline[index];
    const end = polyline[index + 1];
    if (start && end && generatorRevolveSameStation(start, end)) continue;
    if (!start || !end || !generatorRevolvePieceSolid(start, end)) {
      current = null;
      continue;
    }
    if (current && generatorRevolveSameSection(start, current[0]) && generatorRevolveContinuesConcave(current, end))
      current.push(end);
    else runs.push((current = [start, end]));
  }
  return runs.map(generatorRevolveRunSimplify);
}

/**
 * Returns whether a piece encloses volume: it rises and is not flat on the
 * axis.
 *
 * @param start Lower station.
 * @param end Upper station.
 * @returns True when the piece makes a brush.
 */
export function generatorRevolvePieceSolid(start: GeneratorRevolveStation, end: GeneratorRevolveStation): boolean {
  if (end.height - start.height <= GENERATOR_REVOLVE_EPSILON) return false;
  return Math.max(start.radius, end.radius) > GENERATOR_REVOLVE_EPSILON;
}

/**
 * Returns whether two stations coincide, such as a repeated point.
 *
 * @param start First station.
 * @param end Second station.
 * @returns True when they are the same within tolerance.
 */
function generatorRevolveSameStation(start: GeneratorRevolveStation, end: GeneratorRevolveStation): boolean {
  const flat = Math.abs(end.height - start.height) <= GENERATOR_REVOLVE_EPSILON;
  const tracks = generatorRevolveTracks(end);
  const same = generatorRevolveTracks(start).every(
    (value, index) => Math.abs(value - (tracks[index] ?? value)) <= GENERATOR_REVOLVE_EPSILON,
  );
  return flat && same;
}

/**
 * Returns the extents a piece's convexity depends on: the +X and -X extents,
 * the depth half-width and the bar thickness. The first three are all the
 * radius for mirrored rings.
 *
 * @param station Station.
 * @param bar Bar thickness of the piece, for rings without their own.
 * @returns Right extent, left extent, depth half-width and bar half-thickness.
 */
export function generatorRevolveTracks(
  station: GeneratorRevolveStation,
  bar?: number,
): [number, number, number, number] {
  const offset = station.offset ?? 0;
  const thickness = (station.barRing ?? bar ?? 0) * station.radius;
  return [station.radius + offset, station.radius - offset, station.depthRadius ?? station.radius, thickness];
}

/**
 * Returns the slopes of a piece's extents.
 *
 * @param start Lower station.
 * @param end Upper station.
 * @returns Change per height of the right extent, left extent and depth.
 */
function generatorRevolveSlopes(start: GeneratorRevolveStation, end: GeneratorRevolveStation): number[] {
  const lower = generatorRevolveTracks(start, start.barThickness);
  const rise = end.height - start.height;
  return generatorRevolveTracks(end, start.barThickness).map(
    (value, index) => (value - (lower[index] ?? value)) / rise,
  );
}

/**
 * Returns whether extending a run to a station keeps it concave.
 *
 * @param run Current run.
 * @param end Next station.
 * @returns True when the slope does not increase.
 */
function generatorRevolveContinuesConcave(
  run: readonly GeneratorRevolveStation[],
  end: GeneratorRevolveStation,
): boolean {
  const last = run[run.length - 1];
  const before = run[run.length - 2];
  if (!last || !before) return false;
  const previous = generatorRevolveSlopes(before, last);
  return generatorRevolveSlopes(last, end).every(
    (slope, index) => slope <= (previous[index] ?? slope) + GENERATOR_REVOLVE_EPSILON,
  );
}

/**
 * Drops stations that lie on a straight line between their neighbours.
 *
 * @param run Run of stations.
 * @returns Run without collinear interior stations.
 */
function generatorRevolveRunSimplify(run: GeneratorRevolveStation[]): GeneratorRevolveStation[] {
  return run.filter((station, index) => {
    const before = run[index - 1];
    const after = run[index + 1];
    if (!before || !after) return true;
    const above = generatorRevolveSlopes(station, after);
    return generatorRevolveSlopes(before, station).some((slope, at) => Math.abs(slope - (above[at] ?? slope)) > 1e-9);
  });
}

/**
 * Compares the normalized cross-sections of consecutive pieces.
 *
 * @param start Next piece's starting station.
 * @param first First station of the current run.
 * @returns Whether homothetic rings can share one convex run.
 */
function generatorRevolveSameSection(
  start: GeneratorRevolveStation,
  first: GeneratorRevolveStation | undefined,
): boolean {
  return (
    !!start.square === !!first?.square &&
    start.polygonSides === first?.polygonSides &&
    start.crossArm === first?.crossArm &&
    start.barThickness === first?.barThickness &&
    start.stadiumStraight === first?.stadiumStraight &&
    start.side === first?.side &&
    !!start.fixedDepth === !!first?.fixedDepth &&
    !start.twisted &&
    !first?.twisted &&
    (start.rotation ?? 0) === (first?.rotation ?? 0) &&
    (start.cornerSize ?? 0) === (first?.cornerSize ?? 0) &&
    (start.cornerSides ?? 1) === (first?.cornerSides ?? 1)
  );
}
