import * as THREE from 'three';
import { topologyFaceAreaVector } from './topology_face_region.js';
import type { TopologyFaceSplitOutcome } from './topology_face_triangulate.js';
import { topologyOperatorApplied, topologyOperatorRefused } from './topology_operator_result.js';
import type { TopologyWorkingFace } from './topology_working_face.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';

/** Smallest cosine between two triangle normals that still counts as flat. */
const JOIN_TRIANGLES_MIN_NORMAL_COSINE = Math.cos(THREE.MathUtils.degToRad(1));

/** Two selected triangles that could become one quad. */
interface TrianglePair {
  /** Triangle that keeps its index. */
  keep: number;
  /** Triangle that is removed. */
  drop: number;
  /** The merged quad. */
  quad: TopologyWorkingFace;
  /** How square the quad is; higher joins first. */
  score: number;
}

/**
 * Joins pairs of selected triangles that share an edge, lie flat against each
 * other and form a convex quad. The squarest pairs join first. Removed
 * triangles shift later face indices down; the returned faces use the new
 * numbering.
 *
 * @param geometry Working geometry mutated in place.
 * @param faces Selected faces.
 * @returns Outcome with the faces that were selected, renumbered.
 */
export function joinTopologyWorkingTriangles(
  geometry: TopologyWorkingGeometry,
  faces: readonly number[],
): TopologyFaceSplitOutcome {
  const selected = new Set(faces.filter((index) => geometry.faces[index]?.vertexIndices.length === 3));
  const used = new Set<number>();
  const dropped = new Set<number>();
  for (const pair of collectTrianglePairs(geometry, selected).sort((a, b) => b.score - a.score)) {
    if (used.has(pair.keep) || used.has(pair.drop)) continue;
    used.add(pair.keep).add(pair.drop);
    dropped.add(pair.drop);
    geometry.faces[pair.keep] = pair.quad;
  }
  if (dropped.size === 0)
    return { result: topologyOperatorRefused('Join Triangles found no flat triangle pairs'), faces: [] };
  const renumber = removeFaces(geometry, dropped);
  const kept = faces.filter((index) => !dropped.has(index)).map((index) => renumber.get(index)!);
  return { result: topologyOperatorApplied(`Joined ${dropped.size} triangle pair(s)`), faces: kept };
}

/**
 * Lists every joinable pair among the selected triangles.
 *
 * @param geometry Working geometry.
 * @param selected Selected triangle indices.
 * @returns Candidate pairs.
 */
function collectTrianglePairs(geometry: TopologyWorkingGeometry, selected: ReadonlySet<number>): TrianglePair[] {
  const byEdge = new Map<string, number>();
  const pairs: TrianglePair[] = [];
  for (const index of selected) {
    const loop = geometry.faces[index]!.vertexIndices;
    loop.forEach((from, corner) => {
      const to = loop[(corner + 1) % 3]!;
      const other = byEdge.get(`${to}>${from}`);
      if (other !== undefined) {
        const pair = buildPair(geometry, other, index, to, from);
        if (pair) pairs.push(pair);
      }
      byEdge.set(`${from}>${to}`, index);
    });
  }
  return pairs;
}

/**
 * Builds the quad of two triangles across their shared edge.
 *
 * @param geometry Working geometry.
 * @param keep Triangle running from u to v.
 * @param drop Triangle running from v to u.
 * @param u Shared edge start in the kept triangle.
 * @param v Shared edge end in the kept triangle.
 * @returns Pair, or null when the triangles are not flat or the quad is not
 *   convex.
 */
function buildPair(
  geometry: TopologyWorkingGeometry,
  keep: number,
  drop: number,
  u: number,
  v: number,
): TrianglePair | null {
  const first = topologyFaceAreaVector(geometry, keep).normalize();
  const second = topologyFaceAreaVector(geometry, drop).normalize();
  if (first.dot(second) < JOIN_TRIANGLES_MIN_NORMAL_COSINE) return null;
  const keepFace = geometry.faces[keep]!;
  const dropFace = geometry.faces[drop]!;
  const a = keepFace.vertexIndices.find((vertex) => vertex !== u && vertex !== v)!;
  const b = dropFace.vertexIndices.find((vertex) => vertex !== u && vertex !== v)!;
  const loop = [u, b, v, a];
  const points = loop.map((vertex) => geometry.positions[vertex]!);
  if (!isConvexQuad(points, first)) return null;
  const uvOf = (face: TopologyWorkingFace, vertex: number) => face.cornerUvs[face.vertexIndices.indexOf(vertex)]!;
  const shift = { u: uvOf(keepFace, u).u - uvOf(dropFace, u).u, v: uvOf(keepFace, u).v - uvOf(dropFace, u).v };
  const bUv = { u: uvOf(dropFace, b).u + shift.u, v: uvOf(dropFace, b).v + shift.v };
  const quad = {
    vertexIndices: loop,
    cornerUvs: [{ ...uvOf(keepFace, u) }, bUv, { ...uvOf(keepFace, v) }, { ...uvOf(keepFace, a) }],
    textureId: keepFace.textureId,
  };
  return { keep, drop, quad, score: quadSquareness(points) };
}

/**
 * Returns whether four points turn the same way at every corner.
 *
 * @param points Quad corners in order.
 * @param normal Facing direction.
 * @returns True when convex.
 */
function isConvexQuad(points: readonly THREE.Vector3[], normal: THREE.Vector3): boolean {
  return points.every((point, corner) => {
    const next = points[(corner + 1) % 4]!;
    const after = points[(corner + 2) % 4]!;
    const turn = next.clone().sub(point).cross(after.clone().sub(next));
    return turn.dot(normal) > 1e-12;
  });
}

/**
 * Scores how close a quad's corners are to right angles.
 *
 * @param points Quad corners in order.
 * @returns Score, 0 for a perfect rectangle and lower for skewed quads.
 */
function quadSquareness(points: readonly THREE.Vector3[]): number {
  return -points.reduce((sum, point, corner) => {
    const before = points[(corner + 3) % 4]!.clone().sub(point).normalize();
    const after = points[(corner + 1) % 4]!.clone().sub(point).normalize();
    return sum + Math.abs(before.dot(after));
  }, 0);
}

/**
 * Removes faces and returns how the remaining indices moved.
 *
 * @param geometry Working geometry.
 * @param dropped Faces to remove.
 * @returns Old index to new index for the remaining faces.
 */
function removeFaces(geometry: TopologyWorkingGeometry, dropped: ReadonlySet<number>): Map<number, number> {
  const renumber = new Map<number, number>();
  const remaining: TopologyWorkingFace[] = [];
  geometry.faces.forEach((face, index) => {
    if (dropped.has(index)) return;
    renumber.set(index, remaining.length);
    remaining.push(face);
  });
  geometry.faces = remaining;
  return renumber;
}
