import * as THREE from 'three';
import { SolidBrush } from './solid_brush.js';
import { createSolidFace, createWingEdge } from '../types/wing_edge.js';

/**
 * Builds convex solid brushes with correct wing-edge topology.
 */
export class SolidBrushFactory {
  /**
   * Creates an axis-aligned box brush from min/max corners.
   * @param min Inclusive minimum corner.
   * @param max Inclusive maximum corner.
   * @returns Convex box solid brush with six faces.
   */
  static createBox(min: THREE.Vector3, max: THREE.Vector3): SolidBrush {
    const lo = new THREE.Vector3(
      Math.min(min.x, max.x),
      Math.min(min.y, max.y),
      Math.min(min.z, max.z)
    );
    const hi = new THREE.Vector3(
      Math.max(min.x, max.x),
      Math.max(min.y, max.y),
      Math.max(min.z, max.z)
    );
    const brush = new SolidBrush();
    brush.vertices = [
      new THREE.Vector3(lo.x, lo.y, hi.z),
      new THREE.Vector3(lo.x, lo.y, lo.z),
      new THREE.Vector3(hi.x, lo.y, lo.z),
      new THREE.Vector3(hi.x, lo.y, hi.z),
      new THREE.Vector3(lo.x, hi.y, hi.z),
      new THREE.Vector3(lo.x, hi.y, lo.z),
      new THREE.Vector3(hi.x, hi.y, lo.z),
      new THREE.Vector3(hi.x, hi.y, hi.z)
    ];
    this.buildBoxWingEdges(brush);
    this.buildBoxFaces(brush);
    brush.rebuildEdgeFaceIndices();
    brush.recalculatePlanes();
    return brush;
  }

  /**
   * Creates a box brush centered at the origin with the given size.
   * @param width Size along X.
   * @param height Size along Y.
   * @param depth Size along Z.
   * @returns Centered box brush.
   */
  static createCenteredBox(
    width: number,
    height: number,
    depth: number
  ): SolidBrush {
    const half = new THREE.Vector3(width * 0.5, height * 0.5, depth * 0.5);
    return this.createBox(half.clone().negate(), half);
  }

  /**
   * Builds a convex brush from ordered face polygon loops.
   * Vertices are welded; each loop must be convex and share edges with neighbors.
   * @param faceLoops Ordered vertex rings (CCW along outward normals).
   * @returns Solid brush, or null when topology cannot be formed.
   */
  static createFromFaceLoops(
    faceLoops: THREE.Vector3[][]
  ): SolidBrush | null {
    if (faceLoops.length < 4) return null;
    const brush = new SolidBrush();
    const faceVertexIndices: number[][] = [];
    for (const loop of faceLoops) {
      if (loop.length < 3) return null;
      const indices = loop.map((point) =>
        this.weldVertex(brush.vertices, point)
      );
      faceVertexIndices.push(indices);
    }
    try {
      this.buildWingEdgesFromFaces(brush, faceVertexIndices);
    } catch {
      return null;
    }
    this.buildFacesFromIndexLoops(brush, faceVertexIndices);
    brush.rebuildEdgeFaceIndices();
    brush.recalculatePlanes();
    return brush;
  }

  /**
   * Welds a point into the brush vertex list.
   * @param vertices Existing vertices (mutated when a new point is added).
   * @param point Candidate position.
   * @returns Vertex index of the welded point.
   */
  private static weldVertex(
    vertices: THREE.Vector3[],
    point: THREE.Vector3
  ): number {
    const epsilon = 1e-4;
    for (let index = 0; index < vertices.length; index++) {
      if (vertices[index].distanceTo(point) <= epsilon) return index;
    }
    vertices.push(point.clone());
    return vertices.length - 1;
  }

  /**
   * Builds mutual wing edges from face vertex-index loops.
   * @param brush Brush receiving wing edges.
   * @param faceVertexIndices Per-face ordered vertex indices.
   */
  private static buildWingEdgesFromFaces(
    brush: SolidBrush,
    faceVertexIndices: number[][]
  ): void {
    brush.wingEdges = [];
    const edgeKeyToIndex = new Map<string, number>();
    for (const faceVerts of faceVertexIndices) {
      const count = faceVerts.length;
      for (let i = 0; i < count; i++) {
        const from = faceVerts[i];
        const to = faceVerts[(i + 1) % count];
        const edgeIndex = brush.wingEdges.length;
        brush.wingEdges.push(createWingEdge(to, -1));
        edgeKeyToIndex.set(`${from}->${to}`, edgeIndex);
      }
    }
    this.linkTwinEdges(brush, edgeKeyToIndex);
  }

  /**
   * Links each directed edge to its opposite twin.
   * @param brush Brush with wing edges allocated.
   * @param edgeKeyToIndex Map of "from->to" keys to edge indices.
   */
  private static linkTwinEdges(
    brush: SolidBrush,
    edgeKeyToIndex: Map<string, number>
  ): void {
    for (const [key, edgeIndex] of edgeKeyToIndex) {
      const [fromText, toText] = key.split('->');
      const twinIndex = edgeKeyToIndex.get(`${toText}->${fromText}`);
      if (twinIndex === undefined) {
        throw new Error(`Missing twin edge for ${key}`);
      }
      brush.wingEdges[edgeIndex].twinIndex = twinIndex;
    }
  }

  /**
   * Creates face descriptors covering contiguous wing-edge ranges.
   * @param brush Brush with wing edges already built in face order.
   * @param faceVertexIndices Per-face vertex index loops.
   */
  private static buildFacesFromIndexLoops(
    brush: SolidBrush,
    faceVertexIndices: number[][]
  ): void {
    brush.faces = [];
    let firstEdge = 0;
    for (let faceIndex = 0; faceIndex < faceVertexIndices.length; faceIndex++) {
      const edgeCount = faceVertexIndices[faceIndex].length;
      brush.faces.push(createSolidFace(firstEdge, edgeCount, faceIndex));
      firstEdge += edgeCount;
    }
  }

  /**
   * Fills wing edges for a unit-topology box (24 half-edges, 6 quads).
   * @param brush Brush receiving edge data (must already have 8 vertices).
   */
  private static buildBoxWingEdges(brush: SolidBrush): void {
    const faces: number[][] = [
      [0, 1, 2, 3],
      [4, 7, 6, 5],
      [0, 4, 5, 1],
      [1, 5, 6, 2],
      [2, 6, 7, 3],
      [3, 7, 4, 0]
    ];
    this.buildWingEdgesFromFaces(brush, faces);
  }

  /**
   * Creates six quad faces over the box wing-edge layout.
   * @param brush Brush with 24 wing edges already built.
   */
  private static buildBoxFaces(brush: SolidBrush): void {
    brush.faces = [];
    for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
      brush.faces.push(createSolidFace(faceIndex * 4, 4, faceIndex));
    }
  }
}
