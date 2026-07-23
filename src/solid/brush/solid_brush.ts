import * as THREE from 'three';
import {
  SolidFace,
  WingEdge,
  createSolidFace,
  createWingEdge
} from '../types/wing_edge.js';
import { SolidPlane } from './solid_plane.js';

/**
 * Convex solid brush stored with wing-edge topology.
 * Faces are convex polygons; half-edges form a closed manifold shell.
 */
export class SolidBrush {
  vertices: THREE.Vector3[];
  wingEdges: WingEdge[];
  edgeFaceIndices: number[];
  faces: SolidFace[];
  planes: SolidPlane[];

  /**
   * Creates an empty solid brush.
   */
  constructor() {
    this.vertices = [];
    this.wingEdges = [];
    this.edgeFaceIndices = [];
    this.faces = [];
    this.planes = [];
  }

  /**
   * Deep-clones this brush.
   * @returns Independent copy of all topology and geometry.
   */
  clone(): SolidBrush {
    const copy = new SolidBrush();
    copy.vertices = this.vertices.map((vertex) => vertex.clone());
    copy.wingEdges = this.wingEdges.map((edge) =>
      createWingEdge(edge.vertexIndex, edge.twinIndex)
    );
    copy.edgeFaceIndices = this.edgeFaceIndices.slice();
    copy.faces = this.faces.map((face) =>
      createSolidFace(face.firstEdge, face.edgeCount, face.surfaceIndex)
    );
    copy.planes = this.planes.map((plane) => plane.clone());
    return copy;
  }

  /**
   * Rebuilds face planes from current vertex positions using Newell's method.
   */
  recalculatePlanes(): void {
    this.planes = this.faces.map((face) => {
      const points = this.getFaceVertices(face);
      return SolidPlane.fromPolygon(points);
    });
  }

  /**
   * Rebuilds the edge → face index table from face edge ranges.
   */
  rebuildEdgeFaceIndices(): void {
    this.edgeFaceIndices = new Array(this.wingEdges.length).fill(0);
    for (let faceIndex = 0; faceIndex < this.faces.length; faceIndex++) {
      const face = this.faces[faceIndex];
      const lastEdge = face.firstEdge + face.edgeCount;
      for (let edgeIndex = face.firstEdge; edgeIndex < lastEdge; edgeIndex++) {
        this.edgeFaceIndices[edgeIndex] = faceIndex;
      }
    }
  }

  /**
   * Returns ordered vertices for a face (one vertex per wing edge).
   * @param face Face descriptor.
   * @returns Vertex positions in winding order.
   */
  getFaceVertices(face: SolidFace): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    const lastEdge = face.firstEdge + face.edgeCount;
    for (let edgeIndex = face.firstEdge; edgeIndex < lastEdge; edgeIndex++) {
      const vertexIndex = this.wingEdges[edgeIndex].vertexIndex;
      points.push(this.vertices[vertexIndex].clone());
    }
    return points;
  }

  /**
   * Returns ordered vertex indices for a face.
   * @param face Face descriptor.
   * @returns Vertex indices in winding order.
   */
  getFaceVertexIndices(face: SolidFace): number[] {
    const indices: number[] = [];
    const lastEdge = face.firstEdge + face.edgeCount;
    for (let edgeIndex = face.firstEdge; edgeIndex < lastEdge; edgeIndex++) {
      indices.push(this.wingEdges[edgeIndex].vertexIndex);
    }
    return indices;
  }

  /**
   * Axis-aligned bounds of brush vertices in local space.
   * @returns Bounding box, or empty box when the brush has no vertices.
   */
  computeLocalBounds(): THREE.Box3 {
    const bounds = new THREE.Box3();
    if (this.vertices.length === 0) return bounds;
    bounds.setFromPoints(this.vertices);
    return bounds;
  }

  /**
   * Transforms all vertices by a matrix and rebuilds planes.
   * @param matrix Affine transform applied to vertices.
   */
  transformVertices(matrix: THREE.Matrix4): void {
    for (const vertex of this.vertices) {
      vertex.applyMatrix4(matrix);
    }
    this.recalculatePlanes();
  }
}
