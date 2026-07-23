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
    brush.wingEdges = [];
    const edgeKeyToIndex = new Map<string, number>();
    for (const faceVerts of faces) {
      for (let i = 0; i < 4; i++) {
        const from = faceVerts[i];
        const to = faceVerts[(i + 1) % 4];
        const edgeIndex = brush.wingEdges.length;
        brush.wingEdges.push(createWingEdge(to, -1));
        edgeKeyToIndex.set(`${from}->${to}`, edgeIndex);
      }
    }
    for (const [key, edgeIndex] of edgeKeyToIndex) {
      const [fromText, toText] = key.split('->');
      const twinKey = `${toText}->${fromText}`;
      const twinIndex = edgeKeyToIndex.get(twinKey);
      if (twinIndex === undefined) {
        throw new Error(`Missing twin edge for ${key}`);
      }
      brush.wingEdges[edgeIndex].twinIndex = twinIndex;
    }
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
