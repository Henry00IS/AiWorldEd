import * as THREE from 'three';
import { solidScriptExtraNumber, solidScriptExtraVector } from './solid_script_functions_extra.js';
import { solidScriptMeshMergeNear } from './solid_script_mesh_merge.js';
import { solidScriptValueNumbers, solidScriptValueText, type SolidScriptValue } from './solid_script_value.js';

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
 * @returns Points.
 */
function solidScriptClusterPoints(value: SolidScriptValue | undefined): THREE.Vector3[] {
  if (!Array.isArray(value)) throw new Error(`${SOLID_SCRIPT_CLUSTER_USAGE} needs a list of points`);
  return value.map((entry) => {
    const numbers = solidScriptValueNumbers(entry);
    if (numbers?.length !== 3)
      throw new Error(
        `${SOLID_SCRIPT_CLUSTER_USAGE} needs points of three numbers, not ${solidScriptValueText(entry)}`,
      );
    return new THREE.Vector3(numbers[0], numbers[1], numbers[2]);
  });
}

/** Cluster functions: group points that lie close together. */
export const SOLID_SCRIPT_FUNCTIONS_CLUSTER = {
  cluster: solidScriptCluster,
} satisfies Readonly<Record<string, (args: SolidScriptValue[]) => SolidScriptValue>>;
