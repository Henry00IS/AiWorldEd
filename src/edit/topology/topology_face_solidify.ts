import type * as THREE from 'three';
import { collectTopologyBorderEdges } from './topology_edge_extrude.js';
import { flipTopologyWorkingFaces } from './topology_face_copy.js';
import { extrudeTopologyWorkingFaces } from './topology_face_extrude.js';
import {
  topologyOperatorApplied,
  topologyOperatorRefused,
  type TopologyOperatorResult,
} from './topology_operator_result.js';
import { cloneTopologyWorkingFace } from './topology_working_face.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';

/**
 * Gives an open sheet of faces a thickness, turning it into a closed slab: the
 * faces move along their averaged normal, walls close the outline, and a back
 * side is left where the faces were. A negative thickness grows the slab behind
 * the faces instead of in front. The front faces keep their indices.
 *
 * @param geometry Working geometry mutated in place.
 * @param faces Faces of the sheet.
 * @param thickness Signed thickness, in the units normalScale reports.
 * @param normalScale Length of one local unit along a local normal.
 * @returns Operator result.
 */
export function solidifyTopologyWorkingFaces(
  geometry: TopologyWorkingGeometry,
  faces: readonly number[],
  thickness: number,
  normalScale: (localNormal: THREE.Vector3) => number = () => 1,
): TopologyOperatorResult {
  const sheet = [...new Set(faces)].filter((index) => geometry.faces[index] !== undefined);
  if (sheet.length === 0) return topologyOperatorRefused('Solidify needs selected faces');
  if (!sheetEndsInOpenBorders(geometry, sheet)) {
    return topologyOperatorRefused('Solidify needs faces whose outline is an open border, such as a loose panel');
  }
  if (thickness < 0) flipTopologyWorkingFaces(geometry, sheet);
  const back = sheet.map((index) => cloneTopologyWorkingFace(geometry.faces[index]!));
  const extruded = extrudeTopologyWorkingFaces(geometry, sheet, Math.abs(thickness), 'region', normalScale);
  if (!extruded.applied) return extruded;
  for (const face of back) {
    face.vertexIndices.reverse();
    face.cornerUvs.reverse();
    geometry.faces.push(face);
  }
  return topologyOperatorApplied(`Solidified ${sheet.length} face(s)`);
}

/**
 * Returns whether the sheet has an outline and every outline edge is used by no
 * face outside the sheet.
 *
 * @param geometry Working geometry.
 * @param sheet Sheet faces.
 * @returns True when the sheet's outline is all open border.
 */
function sheetEndsInOpenBorders(geometry: TopologyWorkingGeometry, sheet: readonly number[]): boolean {
  const counts = new Map<string, { vertexA: number; vertexB: number; count: number }>();
  for (const index of sheet) {
    const loop = geometry.faces[index]!.vertexIndices;
    loop.forEach((vertex, corner) => {
      const next = loop[(corner + 1) % loop.length]!;
      const key = vertex < next ? `${vertex}:${next}` : `${next}:${vertex}`;
      const entry = counts.get(key) ?? { vertexA: vertex, vertexB: next, count: 0 };
      counts.set(key, { ...entry, count: entry.count + 1 });
    });
  }
  const outline = [...counts.values()].filter((entry) => entry.count === 1);
  return outline.length > 0 && collectTopologyBorderEdges(geometry, outline).length === outline.length;
}
