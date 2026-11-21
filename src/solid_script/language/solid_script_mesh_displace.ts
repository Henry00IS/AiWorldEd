import * as THREE from 'three';
import { solidScriptMeshPointNormals, type SolidScriptShapeMesh } from './solid_script_mesh.js';
import { SolidScriptMeshPatchGraph } from './solid_script_mesh_patch_graph.js';

/**
 * How far around a point, as a multiple of how far it moves, the surface is
 * looked at to choose the way it moves.
 */
const SOLID_SCRIPT_DISPLACE_REACH_PER_DISTANCE = 4;

/**
 * Fewest patches across a point's reach, which picks how coarse a graph it may
 * use.
 */
const SOLID_SCRIPT_DISPLACE_PATCHES_PER_REACH = 2;

/** One graph of a mesh's surface, with what a walk over it needs. */
class SolidScriptMeshPushLevel {
  readonly seen: Int32Array;
  readonly queue: Int32Array;

  /**
   * Prepares walks over a graph.
   *
   * @param graph Graph.
   */
  constructor(readonly graph: SolidScriptMeshPatchGraph) {
    this.seen = new Int32Array(graph.patchCount).fill(-1);
    this.queue = new Int32Array(graph.patchCount);
  }
}

/**
 * Ways a mesh's points move when pushed: the surface's normal around each
 * point, out to a reach, with nearer parts counting more. A point by a sharp
 * edge leans towards the faces across it, more the closer it is, so pushed
 * points turn smoothly around the edge instead of crossing their neighbours.
 * Points with a long reach look at coarser patches of faces.
 */
export class SolidScriptMeshPushDirections {
  private readonly levels: SolidScriptMeshPushLevel[];
  private readonly finestPatchSize: number;
  private readonly sum = new THREE.Vector3();

  /**
   * Reads the faces of a mesh.
   *
   * @param mesh Mesh.
   */
  constructor(private readonly mesh: SolidScriptShapeMesh) {
    const graph = SolidScriptMeshPatchGraph.fromFaces(mesh);
    this.levels = [new SolidScriptMeshPushLevel(graph)];
    this.finestPatchSize = SolidScriptMeshPushDirections.faceSizeAverage(graph);
  }

  /**
   * Way one point moves.
   *
   * @param pointIndex Point number.
   * @param reach How far around the point to look at the surface, in metres.
   * @param normal The point's own normal, used when nothing around it decides.
   * @returns Unit direction.
   */
  direction(pointIndex: number, reach: number, normal: THREE.Vector3): THREE.Vector3 {
    if (!(reach > 0)) return normal;
    const around = this.surroundingNormalSum(this.levelFor(reach), pointIndex, reach);
    if (around.lengthSq() === 0 || around.dot(normal) <= 0) return normal;
    return around.clone().normalize();
  }

  /**
   * Coarsest graph whose patches still fit enough times across a reach.
   *
   * @param reach Reach in metres.
   * @returns Level.
   */
  private levelFor(reach: number): SolidScriptMeshPushLevel {
    const fits = reach / (SOLID_SCRIPT_DISPLACE_PATCHES_PER_REACH * this.finestPatchSize);
    const wanted = fits >= 2 ? Math.floor(Math.log2(fits)) : 0;
    while (this.levels.length <= wanted) {
      const size = this.finestPatchSize * 2 ** this.levels.length;
      const finer = this.levels[this.levels.length - 1] as SolidScriptMeshPushLevel;
      this.levels.push(new SolidScriptMeshPushLevel(finer.graph.coarser(size)));
    }
    return this.levels[wanted] as SolidScriptMeshPushLevel;
  }

  /**
   * Sum of the area-weighted normals of the patches joined to a point whose
   * centers lie within a reach, each counting less the farther it is.
   *
   * @param level Graph to walk.
   * @param pointIndex Point number.
   * @param reach Reach in metres.
   * @returns Unnormalized sum, reused by the next call.
   */
  private surroundingNormalSum(level: SolidScriptMeshPushLevel, pointIndex: number, reach: number): THREE.Vector3 {
    this.sum.set(0, 0, 0);
    const { pointFaces, facePatch } = level.graph;
    let queued = 0;
    for (let item = pointFaces.starts[pointIndex] ?? 0; item < (pointFaces.starts[pointIndex + 1] ?? 0); item++)
      queued = SolidScriptMeshPushDirections.patchQueue(
        level,
        facePatch[pointFaces.items[item] ?? 0] ?? 0,
        pointIndex,
        queued,
      );
    for (let next = 0; next < queued; next++)
      queued = this.patchVisit(level, level.queue[next] ?? 0, pointIndex, reach, queued);
    return this.sum;
  }

  /**
   * Queues a patch once per point.
   *
   * @param level Graph being walked.
   * @param patch Patch number.
   * @param pointIndex Point being looked around.
   * @param queued Patches queued so far.
   * @returns Patches queued now.
   */
  private static patchQueue(
    level: SolidScriptMeshPushLevel,
    patch: number,
    pointIndex: number,
    queued: number,
  ): number {
    if (level.seen[patch] === pointIndex) return queued;
    level.seen[patch] = pointIndex;
    level.queue[queued] = patch;
    return queued + 1;
  }

  /**
   * Adds a patch within reach to the sum and queues the patches next to it.
   *
   * @param level Graph being walked.
   * @param patch Patch number.
   * @param pointIndex Point being looked around.
   * @param reach Reach in metres.
   * @param queued Patches queued so far.
   * @returns Patches queued now.
   */
  private patchVisit(
    level: SolidScriptMeshPushLevel,
    patch: number,
    pointIndex: number,
    reach: number,
    queued: number,
  ): number {
    const { areas, neighbours } = level.graph;
    const distance = this.patchDistance(level, patch, pointIndex);
    if (distance >= reach) return queued;
    const weight = 1 - distance / reach;
    const at = patch * 3;
    this.sum.set(
      this.sum.x + (areas[at] ?? 0) * weight,
      this.sum.y + (areas[at + 1] ?? 0) * weight,
      this.sum.z + (areas[at + 2] ?? 0) * weight,
    );
    for (let item = neighbours.starts[patch] ?? 0; item < (neighbours.starts[patch + 1] ?? 0); item++)
      queued = SolidScriptMeshPushDirections.patchQueue(level, neighbours.items[item] ?? 0, pointIndex, queued);
    return queued;
  }

  /**
   * Distance from a point to a patch's center.
   *
   * @param level Graph being walked.
   * @param patch Patch number.
   * @param pointIndex Point number.
   * @returns Distance in metres.
   */
  private patchDistance(level: SolidScriptMeshPushLevel, patch: number, pointIndex: number): number {
    const point = this.mesh.points[pointIndex] as THREE.Vector3;
    const { centers } = level.graph;
    const at = patch * 3;
    const dx = (centers[at] ?? 0) - point.x;
    const dy = (centers[at + 1] ?? 0) - point.y;
    const dz = (centers[at + 2] ?? 0) - point.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Typical edge length of a graph's patches, from their average area.
   *
   * @param graph Graph.
   * @returns Length in metres.
   */
  private static faceSizeAverage(graph: SolidScriptMeshPatchGraph): number {
    let total = 0;
    for (let patch = 0; patch < graph.patchCount; patch++)
      total += Math.hypot(
        graph.areas[patch * 3] ?? 0,
        graph.areas[patch * 3 + 1] ?? 0,
        graph.areas[patch * 3 + 2] ?? 0,
      );
    return Math.sqrt(total / 2 / Math.max(1, graph.patchCount));
  }
}

/**
 * Moves every point by a distance along the surface's normal. Points by sharp
 * edges move in a direction that turns smoothly around the edge, over a stretch
 * that grows with the distance, so the moved surface does not fold into
 * itself.
 *
 * @param mesh Mesh.
 * @param distance Distance per point, from the point, its normal and number.
 * @returns Displaced mesh.
 */
export function solidScriptMeshDisplace(
  mesh: SolidScriptShapeMesh,
  distance: (point: THREE.Vector3, normal: THREE.Vector3, index: number) => number,
): SolidScriptShapeMesh {
  const normals = solidScriptMeshPointNormals(mesh);
  const distances = mesh.points.map((point, index) => distance(point, normals[index] as THREE.Vector3, index));
  const directions = new SolidScriptMeshPushDirections(mesh);
  return {
    ...mesh,
    points: mesh.points.map((point, index) => {
      const moved = distances[index] as number;
      const reach = Math.abs(moved) * SOLID_SCRIPT_DISPLACE_REACH_PER_DISTANCE;
      return point.clone().addScaledVector(directions.direction(index, reach, normals[index] as THREE.Vector3), moved);
    }),
  };
}
