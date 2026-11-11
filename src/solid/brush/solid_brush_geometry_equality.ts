import type { SolidBrush } from './solid_brush.js';

/** Exact structural comparison of two brush geometries. */
export class SolidBrushGeometryEquality {
  /**
   * Returns whether two brushes have bit-identical vertices, planes, edges,
   * and faces.
   *
   * @param first First brush.
   * @param second Second brush.
   * @returns True when every geometric field matches exactly.
   */
  static equals(first: SolidBrush, second: SolidBrush): boolean {
    return (
      this.verticesEqual(first, second) &&
      this.planesEqual(first, second) &&
      this.wingEdgesEqual(first, second) &&
      this.facesEqual(first, second) &&
      this.edgeFaceIndicesEqual(first, second)
    );
  }

  /**
   * Compares vertex positions exactly.
   *
   * @param first First brush.
   * @param second Second brush.
   * @returns True when all vertices match.
   */
  private static verticesEqual(first: SolidBrush, second: SolidBrush): boolean {
    if (first.vertices.length !== second.vertices.length) {
      return false;
    }
    for (let index = 0; index < first.vertices.length; index++) {
      const firstVertex = first.vertices[index];
      const secondVertex = second.vertices[index];
      if (!firstVertex || !secondVertex || !firstVertex.equals(secondVertex)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Compares plane normals and offsets exactly.
   *
   * @param first First brush.
   * @param second Second brush.
   * @returns True when all planes match.
   */
  private static planesEqual(first: SolidBrush, second: SolidBrush): boolean {
    if (first.planes.length !== second.planes.length) {
      return false;
    }
    for (let index = 0; index < first.planes.length; index++) {
      const firstPlane = first.planes[index];
      const secondPlane = second.planes[index];
      if (!firstPlane || !secondPlane) {
        return false;
      }
      if (firstPlane.offset !== secondPlane.offset || !firstPlane.normal.equals(secondPlane.normal)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Compares wing edges exactly.
   *
   * @param first First brush.
   * @param second Second brush.
   * @returns True when all wing edges match.
   */
  private static wingEdgesEqual(first: SolidBrush, second: SolidBrush): boolean {
    if (first.wingEdges.length !== second.wingEdges.length) {
      return false;
    }
    for (let index = 0; index < first.wingEdges.length; index++) {
      const firstEdge = first.wingEdges[index];
      const secondEdge = second.wingEdges[index];
      if (!firstEdge || !secondEdge) {
        return false;
      }
      if (firstEdge.vertexIndex !== secondEdge.vertexIndex || firstEdge.twinIndex !== secondEdge.twinIndex) {
        return false;
      }
    }
    return true;
  }

  /**
   * Compares face edge ranges and surface indices exactly.
   *
   * @param first First brush.
   * @param second Second brush.
   * @returns True when all faces match.
   */
  private static facesEqual(first: SolidBrush, second: SolidBrush): boolean {
    if (first.faces.length !== second.faces.length) {
      return false;
    }
    for (let index = 0; index < first.faces.length; index++) {
      const firstFace = first.faces[index];
      const secondFace = second.faces[index];
      if (!firstFace || !secondFace) {
        return false;
      }
      if (
        firstFace.firstEdge !== secondFace.firstEdge ||
        firstFace.edgeCount !== secondFace.edgeCount ||
        firstFace.surfaceIndex !== secondFace.surfaceIndex
      ) {
        return false;
      }
    }
    return true;
  }

  /**
   * Compares the edge-to-face index tables exactly.
   *
   * @param first First brush.
   * @param second Second brush.
   * @returns True when the tables match.
   */
  private static edgeFaceIndicesEqual(first: SolidBrush, second: SolidBrush): boolean {
    if (first.edgeFaceIndices.length !== second.edgeFaceIndices.length) {
      return false;
    }
    for (let index = 0; index < first.edgeFaceIndices.length; index++) {
      if (first.edgeFaceIndices[index] !== second.edgeFaceIndices[index]) {
        return false;
      }
    }
    return true;
  }
}
