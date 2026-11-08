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
  /** Accumulated rotation in degrees at this ring. */
  angle?: number;
  /** Whether the piece above changes its rotation. */
  twisted?: boolean;
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
  return flat && Math.abs(end.radius - start.radius) <= GENERATOR_REVOLVE_EPSILON;
}

/**
 * Returns the slope of a piece.
 *
 * @param start Lower station.
 * @param end Upper station.
 * @returns Radius change per height.
 */
function generatorRevolveSlope(start: GeneratorRevolveStation, end: GeneratorRevolveStation): number {
  return (end.radius - start.radius) / (end.height - start.height);
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
  return generatorRevolveSlope(last, end) <= generatorRevolveSlope(before, last) + GENERATOR_REVOLVE_EPSILON;
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
    return Math.abs(generatorRevolveSlope(before, station) - generatorRevolveSlope(station, after)) > 1e-9;
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
    !start.twisted &&
    !first?.twisted &&
    (start.cornerSize ?? 0) === (first?.cornerSize ?? 0) &&
    (start.cornerSides ?? 1) === (first?.cornerSides ?? 1)
  );
}
