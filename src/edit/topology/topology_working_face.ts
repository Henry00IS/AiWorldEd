/** One polygonal face in working topology, with per-corner UVs. */
export interface TopologyWorkingFace {
  /** Corner vertex indices in winding order. */
  vertexIndices: number[];
  /** Corner UVs aligned with {@link vertexIndices}. */
  cornerUvs: Array<{ u: number; v: number }>;
  /** Texture identity copied from the source face. */
  textureId: string;
}

/**
 * Deep-clones one working face.
 *
 * @param face Source face.
 * @returns Independent copy.
 */
export function cloneTopologyWorkingFace(face: TopologyWorkingFace): TopologyWorkingFace {
  return {
    vertexIndices: face.vertexIndices.slice(),
    cornerUvs: face.cornerUvs.map((uv) => ({ u: uv.u, v: uv.v })),
    textureId: face.textureId,
  };
}

/**
 * Returns the corner count of a working face.
 *
 * @param face Face to measure.
 * @returns Corner count.
 */
export function topologyWorkingFaceCornerCount(face: TopologyWorkingFace): number {
  return face.vertexIndices.length;
}

/**
 * Returns whether a face still has enough corners to remain a polygon.
 *
 * @param face Face to test.
 * @returns True when the face has at least three corners.
 */
export function topologyWorkingFaceIsPolygon(face: TopologyWorkingFace): boolean {
  return face.vertexIndices.length >= 3;
}
