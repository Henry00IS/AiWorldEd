import * as THREE from 'three';
import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';
import { SolidPlane } from '@/solid/brush/solid_plane.js';
import { SOLID_NORMAL_ALIGN_EPSILON, SOLID_PLANE_CUT_EPSILON } from '@/solid/algorithm/math/solid_math_constants.js';
import { ConvexPolygonClipper } from './convex_polygon_clipper.js';
import { solidAlgorithmSurfaceInfoBase } from './solid_algorithm_surface_info.js';
import { solidAlgorithmSurfaceLoopCreate, type SolidAlgorithmSurfaceLoop } from './solid_algorithm_surface_loop.js';

/** Signed distance range of a polygon's vertices to one plane. */
interface SolidAlgorithmFatFootprintDistanceRange {
  minimum: number;
  maximum: number;
}

/**
 * Builds fat footprint loops: the part of a subject face that lies inside a
 * peer brush grown outward by the fat-plane width. Such a loop is only made for
 * faces that a nearly parallel peer plane crosses or tilts through within the
 * fat band, so the face also gets cut where the fat peer volume ends and every
 * fragment lies either fully within the fat peer or clearly outside it.
 */
export class SolidAlgorithmFatFootprintLoops {
  /**
   * Appends a fat footprint loop for every subject face that needs one against
   * the peer.
   *
   * @param subject Subject prepared brush that owns the faces.
   * @param subjectIndex Subject prepared index.
   * @param peer Peer prepared brush.
   * @param peerIndex Peer prepared index.
   * @param fatPlaneEpsilon Fat-plane width the peer volume is grown by.
   * @param output Loop accumulator.
   */
  static appendForPair(
    subject: PreparedBrush,
    subjectIndex: number,
    peer: PreparedBrush,
    peerIndex: number,
    fatPlaneEpsilon: number,
    output: SolidAlgorithmSurfaceLoop[],
  ): void {
    const faces = subject.brush.faces;
    for (let faceIndex = 0; faceIndex < faces.length; faceIndex++) {
      const face = faces[faceIndex];
      const facePlane = subject.brush.planes[faceIndex];
      if (!face || !facePlane) continue;
      const faceVertices = subject.brush.getFaceVertices(face);
      if (!this.faceNeedsFatFootprint(faceVertices, facePlane, peer, fatPlaneEpsilon)) continue;
      const footprint = this.fatFootprintPolygon(faceVertices, peer, fatPlaneEpsilon);
      if (footprint.length < 3) continue;
      const surfaceInfo = solidAlgorithmSurfaceInfoBase(subjectIndex, faceIndex);
      output.push(solidAlgorithmSurfaceLoopCreate(subjectIndex, peerIndex, surfaceInfo, footprint));
    }
  }

  /**
   * Returns whether a peer has a plane nearly parallel to the face that comes
   * within the fat band of the face without lying exactly on it, so the fat
   * band boundary or the exact crossing line runs through the face.
   *
   * @param faceVertices Ordered face polygon.
   * @param facePlane Plane of the face.
   * @param peer Peer prepared brush.
   * @param fatPlaneEpsilon Fat-plane width.
   * @returns True when the face needs a fat footprint loop.
   */
  static faceNeedsFatFootprint(
    faceVertices: readonly THREE.Vector3[],
    facePlane: SolidPlane,
    peer: PreparedBrush,
    fatPlaneEpsilon: number,
  ): boolean {
    for (const peerPlane of peer.brush.planes) {
      if (Math.abs(peerPlane.normal.dot(facePlane.normal)) < SOLID_NORMAL_ALIGN_EPSILON) continue;
      const range = this.distanceRange(faceVertices, peerPlane);
      const reachesFatBand = range.minimum <= fatPlaneEpsilon && range.maximum >= -fatPlaneEpsilon;
      if (reachesFatBand && range.maximum - range.minimum > SOLID_PLANE_CUT_EPSILON) return true;
    }
    return false;
  }

  /**
   * Returns the smallest and largest signed distance of the vertices to a
   * plane.
   *
   * @param vertices Polygon vertices.
   * @param plane Plane to measure against.
   * @returns Distance range.
   */
  private static distanceRange(
    vertices: readonly THREE.Vector3[],
    plane: SolidPlane,
  ): SolidAlgorithmFatFootprintDistanceRange {
    const range = { minimum: Number.POSITIVE_INFINITY, maximum: Number.NEGATIVE_INFINITY };
    for (const vertex of vertices) {
      const distance = plane.signedDistance(vertex);
      range.minimum = Math.min(range.minimum, distance);
      range.maximum = Math.max(range.maximum, distance);
    }
    return range;
  }

  /**
   * Clips the face polygon to the peer volume grown outward by the fat-plane
   * width.
   *
   * @param faceVertices Ordered face polygon.
   * @param peer Peer prepared brush.
   * @param fatPlaneEpsilon Fat-plane width.
   * @returns Clipped polygon, or an empty array when nothing remains.
   */
  static fatFootprintPolygon(
    faceVertices: readonly THREE.Vector3[],
    peer: PreparedBrush,
    fatPlaneEpsilon: number,
  ): THREE.Vector3[] {
    let footprint = faceVertices.map((vertex) => vertex.clone());
    for (const peerPlane of peer.brush.planes) {
      const grownPlane = new SolidPlane(peerPlane.normal, peerPlane.offset - fatPlaneEpsilon);
      footprint = ConvexPolygonClipper.clipByPlane(footprint, grownPlane, SOLID_PLANE_CUT_EPSILON).inside;
      if (footprint.length < 3) return [];
    }
    return footprint;
  }
}
