/** One position sample used by the coincident-vertex grid. */
export interface CoincidentPositionSample {
  x: number;
  y: number;
  z: number;
}

/**
 * Groups sample indices that lie within epsilon of the same seed. Cell size
 * equals epsilon, and each seed only compares nearby cells.
 *
 * @param samples Positions in index order.
 * @param epsilon Maximum distance that still counts as coincident.
 * @returns Index groups with at least two samples.
 */
export function collectCoincidentSampleGroups(
  samples: readonly CoincidentPositionSample[],
  epsilon: number,
): number[][] {
  const inverseCell = inverseCellSize(epsilon);
  const cells = new Map<number, number[]>();
  for (let index = 0; index < samples.length; index++) {
    appendSampleToCell(samples, index, inverseCell, cells);
  }
  return collectGroupsFromCells(samples, epsilon, cells);
}

/**
 * Returns the inverse cell size for a positive epsilon.
 *
 * @param epsilon Requested coincident radius.
 * @returns Multiplier from position to cell coordinate.
 */
function inverseCellSize(epsilon: number): number {
  if (epsilon > 1e-12) {
    return 1 / epsilon;
  }
  return 1e12;
}

/**
 * Inserts one sample into its grid cell.
 *
 * @param samples Position samples.
 * @param index Sample index.
 * @param inverseCell Inverse cell size.
 * @param cells Cell hash to sample indices.
 */
function appendSampleToCell(
  samples: readonly CoincidentPositionSample[],
  index: number,
  inverseCell: number,
  cells: Map<number, number[]>,
): void {
  const sample = samples[index];
  if (!sample) {
    return;
  }
  const key = cellKeyForSample(sample, inverseCell);
  const bucket = cells.get(key);
  if (bucket) {
    bucket.push(index);
    return;
  }
  cells.set(key, [index]);
}

/**
 * Grows clusters from each unvisited seed.
 *
 * @param samples Position samples.
 * @param epsilon Coincident radius.
 * @param cells Occupied cells.
 * @returns Groups with at least two indices.
 */
function collectGroupsFromCells(
  samples: readonly CoincidentPositionSample[],
  epsilon: number,
  cells: Map<number, number[]>,
): number[][] {
  const visited = new Uint8Array(samples.length);
  const groups: number[][] = [];
  for (let seed = 0; seed < samples.length; seed++) {
    appendGroupFromSeed(samples, seed, epsilon, cells, visited, groups);
  }
  return groups;
}

/**
 * Records a cluster when a seed has another sample within epsilon.
 *
 * @param samples Position samples.
 * @param seed Seed index.
 * @param epsilon Coincident radius.
 * @param cells Occupied cells.
 * @param visited Samples already assigned to a seed.
 * @param groups Output groups.
 */
function appendGroupFromSeed(
  samples: readonly CoincidentPositionSample[],
  seed: number,
  epsilon: number,
  cells: Map<number, number[]>,
  visited: Uint8Array,
  groups: number[][],
): void {
  if (visited[seed] === 1) {
    return;
  }
  const seedSample = samples[seed];
  if (!seedSample) {
    return;
  }
  visited[seed] = 1;
  const group = [seed];
  appendNearbySamples(samples, seedSample, epsilon, cells, visited, group);
  if (group.length >= 2) {
    groups.push(group);
  }
}

/**
 * Appends unvisited samples near the seed from neighboring cells.
 *
 * @param samples Position samples.
 * @param seedSample Seed position.
 * @param epsilon Coincident radius.
 * @param cells Occupied cells.
 * @param visited Samples already assigned.
 * @param group Cluster indices.
 */
function appendNearbySamples(
  samples: readonly CoincidentPositionSample[],
  seedSample: CoincidentPositionSample,
  epsilon: number,
  cells: Map<number, number[]>,
  visited: Uint8Array,
  group: number[],
): void {
  const inverseCell = inverseCellSize(epsilon);
  const originX = cellCoordinate(seedSample.x, inverseCell);
  const originY = cellCoordinate(seedSample.y, inverseCell);
  const originZ = cellCoordinate(seedSample.z, inverseCell);
  for (let offsetX = -2; offsetX <= 2; offsetX++) {
    for (let offsetY = -2; offsetY <= 2; offsetY++) {
      for (let offsetZ = -2; offsetZ <= 2; offsetZ++) {
        appendCellSamples(
          samples,
          seedSample,
          epsilon,
          cells.get(cellKey(originX + offsetX, originY + offsetY, originZ + offsetZ)),
          visited,
          group,
        );
      }
    }
  }
}

/**
 * Appends samples in one cell that lie within epsilon of the seed.
 *
 * @param samples Position samples.
 * @param seedSample Seed position.
 * @param epsilon Coincident radius.
 * @param bucket Cell contents, if any.
 * @param visited Samples already assigned.
 * @param group Cluster indices.
 */
function appendCellSamples(
  samples: readonly CoincidentPositionSample[],
  seedSample: CoincidentPositionSample,
  epsilon: number,
  bucket: readonly number[] | undefined,
  visited: Uint8Array,
  group: number[],
): void {
  if (!bucket) {
    return;
  }
  for (const index of bucket) {
    if (visited[index] === 1) {
      continue;
    }
    if (!sampleIsNear(samples[index], seedSample, epsilon)) {
      continue;
    }
    visited[index] = 1;
    group.push(index);
  }
}

/**
 * Returns whether a sample is within epsilon of a seed.
 *
 * @param sample Candidate sample.
 * @param seed Seed position.
 * @param epsilon Coincident radius.
 * @returns True when the distance is within epsilon.
 */
function sampleIsNear(
  sample: CoincidentPositionSample | undefined,
  seed: CoincidentPositionSample,
  epsilon: number,
): boolean {
  if (!sample) {
    return false;
  }
  const dx = sample.x - seed.x;
  const dy = sample.y - seed.y;
  const dz = sample.z - seed.z;
  return dx * dx + dy * dy + dz * dz <= epsilon * epsilon;
}

/**
 * Hashes a sample into its grid cell.
 *
 * @param sample Position sample.
 * @param inverseCell Inverse cell size.
 * @returns Cell hash.
 */
function cellKeyForSample(sample: CoincidentPositionSample, inverseCell: number): number {
  return cellKey(
    cellCoordinate(sample.x, inverseCell),
    cellCoordinate(sample.y, inverseCell),
    cellCoordinate(sample.z, inverseCell),
  );
}

/**
 * Converts one coordinate into a cell index.
 *
 * @param value Position component.
 * @param inverseCell Inverse cell size.
 * @returns Cell coordinate.
 */
function cellCoordinate(value: number, inverseCell: number): number {
  return Math.floor(value * inverseCell);
}

/**
 * Packs three cell coordinates into one hash.
 *
 * @param x Cell X.
 * @param y Cell Y.
 * @param z Cell Z.
 * @returns Hash key.
 */
function cellKey(x: number, y: number, z: number): number {
  return (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
}
