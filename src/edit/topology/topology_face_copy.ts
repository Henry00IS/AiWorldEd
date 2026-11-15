import {
  topologyOperatorApplied,
  topologyOperatorRefused,
  type TopologyOperatorResult,
} from './topology_operator_result.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';

/** Outcome of duplicating faces, with the indices of the copies. */
export interface TopologyFaceCopyOutcome {
  /** Whether anything changed, and why not. */
  result: TopologyOperatorResult;
  /** Index of each copy, in the order of the source faces. */
  copies: number[];
}

/**
 * Turns the selected faces inside out by reversing their winding.
 *
 * @param geometry Working geometry mutated in place.
 * @param faces Faces to flip.
 * @returns Operator result.
 */
export function flipTopologyWorkingFaces(
  geometry: TopologyWorkingGeometry,
  faces: readonly number[],
): TopologyOperatorResult {
  const targets = [...new Set(faces)].filter((index) => geometry.faces[index] !== undefined);
  if (targets.length === 0) return topologyOperatorRefused('Flip Faces needs selected faces');
  for (const index of targets) {
    const face = geometry.faces[index]!;
    face.vertexIndices.reverse();
    face.cornerUvs.reverse();
  }
  return topologyOperatorApplied(`Flipped ${targets.length} face(s)`);
}

/**
 * Copies the selected faces onto new vertices of their own, so the copy can be
 * moved away without tearing the original. Faces that share corners in the
 * selection share them in the copy too.
 *
 * @param geometry Working geometry mutated in place.
 * @param faces Faces to copy.
 * @returns Outcome with the copies' indices.
 */
export function duplicateTopologyWorkingFaces(
  geometry: TopologyWorkingGeometry,
  faces: readonly number[],
): TopologyFaceCopyOutcome {
  const sources = [...new Set(faces)].filter((index) => geometry.faces[index] !== undefined);
  if (sources.length === 0) return { result: topologyOperatorRefused('Duplicate needs selected faces'), copies: [] };
  const copied = new Map<number, number>();
  const copyVertex = (vertex: number) => {
    if (!copied.has(vertex)) copied.set(vertex, geometry.positions.push(geometry.positions[vertex]!.clone()) - 1);
    return copied.get(vertex)!;
  };
  const copies = sources.map((index) => {
    const face = geometry.faces[index]!;
    return (
      geometry.faces.push({
        vertexIndices: face.vertexIndices.map(copyVertex),
        cornerUvs: face.cornerUvs.map((uv) => ({ u: uv.u, v: uv.v })),
        textureId: face.textureId,
      }) - 1
    );
  });
  return { result: topologyOperatorApplied(`Duplicated ${copies.length} face(s)`), copies };
}

/**
 * Splits the selected faces off the rest of the mesh: every corner they share
 * with an unselected face gets its own copy, so the faces can be moved away on
 * their own. Corners shared between selected faces stay shared.
 *
 * @param geometry Working geometry mutated in place.
 * @param faces Faces to split off.
 * @returns Operator result.
 */
export function splitTopologyWorkingFaces(
  geometry: TopologyWorkingGeometry,
  faces: readonly number[],
): TopologyOperatorResult {
  const selected = new Set(faces.filter((index) => geometry.faces[index] !== undefined));
  if (selected.size === 0) return topologyOperatorRefused('Split Faces needs selected faces');
  const outside = new Set(geometry.faces.flatMap((face, index) => (selected.has(index) ? [] : face.vertexIndices)));
  const copied = new Map<number, number>();
  const copyVertex = (vertex: number) => {
    if (!outside.has(vertex)) return vertex;
    if (!copied.has(vertex)) copied.set(vertex, geometry.positions.push(geometry.positions[vertex]!.clone()) - 1);
    return copied.get(vertex)!;
  };
  for (const index of selected) {
    const face = geometry.faces[index]!;
    face.vertexIndices = face.vertexIndices.map(copyVertex);
  }
  if (copied.size === 0) return topologyOperatorRefused('The selected faces are already apart from the rest');
  return topologyOperatorApplied(`Split ${selected.size} face(s) off`);
}
