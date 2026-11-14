import type { TopologyWorkingGeometry } from './topology_working_geometry.js';
import type { TopologyWorkingFace } from './topology_working_face.js';
import {
  topologyOperatorApplied,
  topologyOperatorRefused,
  type TopologyOperatorResult,
} from './topology_operator_result.js';

/**
 * Insets faces one by one: each face keeps its index but shrinks toward its
 * centre by the amount, and a ring of quads joins it to its old outline. The
 * new faces keep the face's texture, winding and interpolated UVs, and every
 * new vertex stays in the face's plane.
 *
 * @param geometry Working geometry, edited in place.
 * @param faceIndices Faces to inset.
 * @param amount Share of the way to the centre, between 0 and 1.
 * @returns Operator result.
 */
export function insetTopologyWorkingFaces(
  geometry: TopologyWorkingGeometry,
  faceIndices: readonly number[],
  amount: number,
): TopologyOperatorResult {
  if (!(amount > 0 && amount < 1)) return topologyOperatorRefused('Inset amount must be between 0 and 1');
  const faces = [...new Set(faceIndices)].filter((index) => geometry.faces[index] !== undefined);
  if (faces.length === 0) return topologyOperatorRefused('Select faces to inset');
  for (const index of faces) insetOneFace(geometry, index, amount);
  return topologyOperatorApplied(`Inset ${faces.length} ${faces.length === 1 ? 'face' : 'faces'}`);
}

/**
 * Insets one face.
 *
 * @param geometry Working geometry.
 * @param index Face index.
 * @param amount Share of the way to the centre.
 */
function insetOneFace(geometry: TopologyWorkingGeometry, index: number, amount: number): void {
  const face = geometry.faces[index]!;
  const count = face.vertexIndices.length;
  const centre = face.vertexIndices
    .reduce((sum, vertex) => sum.add(geometry.positions[vertex]!), geometry.positions[0]!.clone().set(0, 0, 0))
    .divideScalar(count);
  const centreUv = face.cornerUvs.reduce((sum, uv) => ({ u: sum.u + uv.u / count, v: sum.v + uv.v / count }), {
    u: 0,
    v: 0,
  });
  const inner = face.vertexIndices.map((vertex) => {
    geometry.positions.push(geometry.positions[vertex]!.clone().lerp(centre, amount));
    return geometry.positions.length - 1;
  });
  const innerUvs = face.cornerUvs.map((uv) => ({
    u: uv.u + (centreUv.u - uv.u) * amount,
    v: uv.v + (centreUv.v - uv.v) * amount,
  }));
  for (let corner = 0; corner < count; corner++) {
    const next = (corner + 1) % count;
    const ring: TopologyWorkingFace = {
      vertexIndices: [face.vertexIndices[corner]!, face.vertexIndices[next]!, inner[next]!, inner[corner]!],
      cornerUvs: [face.cornerUvs[corner]!, face.cornerUvs[next]!, innerUvs[next]!, innerUvs[corner]!].map((uv) => ({
        u: uv.u,
        v: uv.v,
      })),
      textureId: face.textureId,
    };
    geometry.faces.push(ring);
  }
  geometry.faces[index] = { vertexIndices: inner, cornerUvs: innerUvs, textureId: face.textureId };
}

/** Share of the way to the centre one Inset Faces step moves the outline. */
export const TOPOLOGY_FACE_INSET_STEP = 0.2;
