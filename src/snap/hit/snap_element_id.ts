/**
 * Builds a stable id for a vertex on a mesh or brush.
 *
 * @param ownerId Mesh uuid or brush id.
 * @param index Vertex index.
 * @returns Element id.
 */
export function snapVertexElementId(ownerId: string, index: number): string {
  return `${ownerId}:vertex:${index}`;
}

/**
 * Builds a stable id for an edge on a mesh or brush.
 *
 * @param ownerId Mesh uuid or brush id.
 * @param firstIndex Lower vertex index.
 * @param secondIndex Higher vertex index.
 * @returns Element id.
 */
export function snapEdgeElementId(ownerId: string, firstIndex: number, secondIndex: number): string {
  return `${ownerId}:edge:${firstIndex}:${secondIndex}`;
}

/**
 * Builds a stable id for a face on a mesh or brush.
 *
 * @param ownerId Mesh uuid or brush id.
 * @param index Face or triangle index.
 * @returns Element id.
 */
export function snapFaceElementId(ownerId: string, index: number): string {
  return `${ownerId}:face:${index}`;
}
