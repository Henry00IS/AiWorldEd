import * as THREE from 'three';
import { solidScriptExtraNumber, solidScriptExtraVector } from './solid_script_functions_extra.js';
import { solidScriptMeshMergeNear } from './solid_script_mesh_merge.js';
import { solidScriptValueText, type SolidScriptValue } from './solid_script_value.js';
import { solidScriptVectorThreeRequire } from './solid_script_vector.js';

/** How the usage of Cluster reads in messages. */
const SOLID_SCRIPT_CLUSTER_USAGE = 'Cluster(points, distance, groups)';

/**
 * Groups points that lie close together: in list order, each point not yet in a
 * cluster starts one, and later points within Distance of it join it.
 *
 * @param args Points, optional Distance (0.001) and optional Groups.
 * @returns For each point, the index of the point its cluster started from.
 */
function solidScriptCluster(args: readonly SolidScriptValue[]): number[] {
  const points = solidScriptClusterPoints(args[0]);
  const distance = args.length > 1 ? solidScriptExtraNumber(args, 1, SOLID_SCRIPT_CLUSTER_USAGE) : 0.001;
  if (!(distance >= 0)) throw new Error(`${SOLID_SCRIPT_CLUSTER_USAGE} needs a Distance of 0 or more`);
  const groups = args.length > 2 ? solidScriptExtraVector(args, 2, SOLID_SCRIPT_CLUSTER_USAGE) : points.map(() => 0);
  if (groups.length !== points.length)
    throw new Error(`${SOLID_SCRIPT_CLUSTER_USAGE} needs one group per point, ${points.length} in all`);
  const clusters = points.map((_, index) => index);
  for (const group of new Set(groups)) {
    const members = groups.flatMap((value, index) => (value === group ? [index] : []));
    const roots = solidScriptMeshMergeNear(
      members.map((index) => points[index] ?? new THREE.Vector3()),
      distance,
      () => true,
    );
    members.forEach((index, at) => (clusters[index] = members[roots[at] ?? at] ?? index));
  }
  return clusters;
}

/**
 * Reads the points to cluster.
 *
 * @param value List of points.
 * @param usage How to call the function, for messages.
 * @returns Points.
 */
function solidScriptClusterPoints(
  value: SolidScriptValue | undefined,
  usage = SOLID_SCRIPT_CLUSTER_USAGE,
): THREE.Vector3[] {
  if (!Array.isArray(value)) throw new Error(`${usage} needs a list of points`);
  return value.map((entry) => {
    return solidScriptVectorThreeRequire(entry, `${usage} needs points as vectors, not ${solidScriptValueText(entry)}`);
  });
}

/** How the usage of ClusterConnected reads in messages. */
const SOLID_SCRIPT_CLUSTER_CONNECTED_USAGE = 'ClusterConnected(points, starts, ends, distance)';

/**
 * Groups points joined by edges: in edge order, the clusters at an edge's two
 * ends join when their middles are closer than Distance, and the joined
 * cluster's middle is the average of all its points.
 *
 * @param args Points, edge Starts, edge Ends and optional Distance (0.001).
 * @returns For each point, the smallest index of the points in its cluster.
 */
function solidScriptClusterConnected(args: readonly SolidScriptValue[]): number[] {
  const usage = SOLID_SCRIPT_CLUSTER_CONNECTED_USAGE;
  const points = solidScriptClusterPoints(args[0], usage);
  const starts = solidScriptClusterPoints(args[1], usage);
  const ends = solidScriptClusterPoints(args[2], usage);
  if (starts.length !== ends.length) throw new Error(`${usage} needs one End per Start, ${starts.length} in all`);
  const distance = args.length > 3 ? solidScriptExtraNumber(args, 3, usage) : 0.001;
  const numberOf = (at: THREE.Vector3): number => points.findIndex((point) => point.distanceTo(at) < 1e-9);
  const pairs = starts.map((start, edge): [number, number] => [numberOf(start), numberOf(ends[edge] ?? start)]);
  return solidScriptClusterJoin(points, pairs, distance);
}

/**
 * Joins the clusters at the ends of each pair of points, in order, when their
 * middles are closer than Distance.
 *
 * @param points Points.
 * @param pairs Point numbers at the two ends of each edge; -1 for a point not
 *   in the list.
 * @param distance How close the middles must be.
 * @returns For each point, the smallest index of the points in its cluster.
 */
function solidScriptClusterJoin(
  points: readonly THREE.Vector3[],
  pairs: readonly [number, number][],
  distance: number,
): number[] {
  const root = points.map((_, index) => index);
  const find = (index: number): number => (root[index] === index ? index : (root[index] = find(root[index] ?? index)));
  const middles = points.map((point) => point.clone());
  const sizes = points.map(() => 1);
  for (const pair of pairs) {
    if (pair.some((index) => index < 0)) continue;
    const [a = 0, b = 0] = pair.map(find);
    const [keep, gone] = a < b ? [a, b] : [b, a];
    if (keep === gone || (middles[keep]?.distanceTo(middles[gone] ?? new THREE.Vector3()) ?? Infinity) >= distance)
      continue;
    const total = (sizes[keep] ?? 1) + (sizes[gone] ?? 1);
    middles[keep]?.lerp(middles[gone] ?? new THREE.Vector3(), (sizes[gone] ?? 1) / total);
    sizes[keep] = total;
    root[gone] = keep;
  }
  return points.map((_, index) => find(index));
}

/** Cluster functions: group points that lie close together. */
export const SOLID_SCRIPT_FUNCTIONS_CLUSTER = {
  cluster: solidScriptCluster,
  cluster_connected: solidScriptClusterConnected,
} satisfies Readonly<Record<string, (args: SolidScriptValue[]) => SolidScriptValue>>;
