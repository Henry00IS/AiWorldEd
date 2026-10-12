import { cloneTopologyWorkingFace, type TopologyWorkingFace } from './topology_working_face.js';

/**
 * Splits a face into two loops between two existing corner vertices.
 *
 * @param face Face to split (left as the first loop).
 * @param vertexP First split vertex.
 * @param vertexQ Second split vertex.
 * @returns The second loop, or null when the split is illegal.
 */
export function splitWorkingFaceBetweenVertices(
  face: TopologyWorkingFace,
  vertexP: number,
  vertexQ: number,
): TopologyWorkingFace | null {
  const indexP = face.vertexIndices.indexOf(vertexP);
  const indexQ = face.vertexIndices.indexOf(vertexQ);
  if (indexP < 0 || indexQ < 0 || indexP === indexQ) {
    return null;
  }
  const first = walkFaceInclusive(face, indexP, indexQ);
  const second = walkFaceInclusive(face, indexQ, indexP);
  if (first.vertexIndices.length < 3 || second.vertexIndices.length < 3) {
    return null;
  }
  face.vertexIndices = first.vertexIndices;
  face.cornerUvs = first.cornerUvs;
  return second;
}

/**
 * Walks a face from start to end inclusive.
 *
 * @param face Face to walk.
 * @param startIndex Start corner.
 * @param endIndex End corner.
 * @returns Walked loop.
 */
function walkFaceInclusive(face: TopologyWorkingFace, startIndex: number, endIndex: number): TopologyWorkingFace {
  const walk = cloneTopologyWorkingFace({
    vertexIndices: [],
    cornerUvs: [],
    textureId: face.textureId,
  });
  const count = face.vertexIndices.length;
  let cursor = startIndex;
  for (let step = 0; step < count; step++) {
    appendFaceCorner(face, cursor, walk);
    if (cursor === endIndex) {
      break;
    }
    cursor = (cursor + 1) % count;
  }
  return walk;
}

/**
 * Appends one face corner onto a walk.
 *
 * @param face Source face.
 * @param corner Corner index.
 * @param walk Destination walk.
 */
function appendFaceCorner(face: TopologyWorkingFace, corner: number, walk: TopologyWorkingFace): void {
  const vertexIndex = face.vertexIndices[corner];
  const uv = face.cornerUvs[corner];
  if (vertexIndex === undefined || !uv) {
    return;
  }
  walk.vertexIndices.push(vertexIndex);
  walk.cornerUvs.push({ u: uv.u, v: uv.v });
}
