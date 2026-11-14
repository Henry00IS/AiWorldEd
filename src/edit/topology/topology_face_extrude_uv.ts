import type { TopologyWorkingFace } from './topology_working_face.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';

/** One texture coordinate pair. */
export interface TopologyCornerUv {
  /** Horizontal coordinate. */
  u: number;
  /** Vertical coordinate. */
  v: number;
}

/**
 * Builds the four corner UVs of a side wall raised from one face edge. The wall
 * continues the face's texture outward from the edge at the face's own texel
 * density so walls do not smear.
 *
 * @param geometry Working geometry before the extrusion.
 * @param face Face the edge belongs to.
 * @param corner Corner index where the edge starts.
 * @param height Wall height in world units.
 * @returns UVs for edge start, edge end, raised end and raised start.
 */
export function topologyExtrudeSideWallUvs(
  geometry: TopologyWorkingGeometry,
  face: TopologyWorkingFace,
  corner: number,
  height: number,
): TopologyCornerUv[] {
  const next = (corner + 1) % face.vertexIndices.length;
  const start = face.cornerUvs[corner] ?? { u: 0, v: 0 };
  const end = face.cornerUvs[next] ?? { u: 0, v: 0 };
  const offset = sideWallUvOffset(geometry, face, corner, height);
  return [
    { u: start.u, v: start.v },
    { u: end.u, v: end.v },
    { u: end.u + offset.u, v: end.v + offset.v },
    { u: start.u + offset.u, v: start.v + offset.v },
  ];
}

/**
 * Returns the UV step from an edge to the raised edge.
 *
 * @param geometry Working geometry.
 * @param face Face the edge belongs to.
 * @param corner Corner index where the edge starts.
 * @param height Wall height in world units.
 * @returns UV offset perpendicular to the edge, pointing away from the face.
 */
function sideWallUvOffset(
  geometry: TopologyWorkingGeometry,
  face: TopologyWorkingFace,
  corner: number,
  height: number,
): TopologyCornerUv {
  const next = (corner + 1) % face.vertexIndices.length;
  const start = face.cornerUvs[corner] ?? { u: 0, v: 0 };
  const end = face.cornerUvs[next] ?? { u: 0, v: 0 };
  const uvLength = Math.hypot(end.u - start.u, end.v - start.v);
  const worldLength = geometry.positions[face.vertexIndices[corner]!]!.distanceTo(
    geometry.positions[face.vertexIndices[next]!]!,
  );
  if (uvLength < 1e-12 || worldLength < 1e-12) return { u: 0, v: 0 };
  const scale = Math.abs(height) / worldLength;
  const perpendicular = { u: -(end.v - start.v) * scale, v: (end.u - start.u) * scale };
  return pointAwayFromFaceCentre(face, start, end, perpendicular);
}

/**
 * Flips a UV offset when it points into the face's UV island.
 *
 * @param face Face the edge belongs to.
 * @param start Edge start UV.
 * @param end Edge end UV.
 * @param offset Candidate offset.
 * @returns Offset pointing away from the face's UV centre.
 */
function pointAwayFromFaceCentre(
  face: TopologyWorkingFace,
  start: TopologyCornerUv,
  end: TopologyCornerUv,
  offset: TopologyCornerUv,
): TopologyCornerUv {
  const count = Math.max(1, face.cornerUvs.length);
  const centreU = face.cornerUvs.reduce((sum, uv) => sum + uv.u, 0) / count;
  const centreV = face.cornerUvs.reduce((sum, uv) => sum + uv.v, 0) / count;
  const outwardU = (start.u + end.u) / 2 - centreU;
  const outwardV = (start.v + end.v) / 2 - centreV;
  return outwardU * offset.u + outwardV * offset.v < 0 ? { u: -offset.u, v: -offset.v } : offset;
}
