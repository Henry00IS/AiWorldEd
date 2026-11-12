import * as THREE from 'three';
import type { SolidPlane } from '@/solid/brush/solid_plane.js';
import { SOLID_FAT_PLANE_EPSILON, SOLID_NORMAL_ALIGN_EPSILON } from '@/solid/algorithm/math/solid_math_constants.js';
import { HashedVertexTable } from '@/solid/algorithm/spatial/hashed_vertex_table.js';
import { SolidAlgorithmCreateIntersectionLoopsOutside } from './solid_algorithm_create_intersection_loops_outside.js';
import { SolidAlgorithmPlaneTripleIntersection } from './solid_algorithm_plane_triple_intersection.js';
import type { SolidAlgorithmPlanePair } from './solid_algorithm_plane_pair.js';
import {
  solidAlgorithmPlaneVertexIndexPairPushUnique,
  type SolidAlgorithmPlaneVertexIndexPair,
} from './solid_algorithm_plane_vertex_index_pair.js';

interface IntersectionCandidate {
  plane2: SolidPlane;
  planeIndex0: number;
  planeIndex1: number;
  planeIndex2: number;
  edgeVertex0: THREE.Vector3;
  edgeVertex1: THREE.Vector3;
  localVertex: THREE.Vector3;
}

/** Finds triple-plane intersection vertices for CreateIntersectionLoops. */
export class SolidAlgorithmCreateIntersectionLoopsFindIntersection {
  /**
   * Appends valid triple intersections into foundIndices for both brushes.
   *
   * @param intersectingPlanes0 Planes of brush0 (local space of brush0).
   * @param intersectingPlanes0Length Face-plane count for brush0.
   * @param intersectingPlanesAndEdges0Length Outside-test plane count brush0.
   * @param intersectingPlanes1 Planes of brush1.
   * @param intersectingPlanes1Length Face-plane count for brush1.
   * @param intersectingPlanesAndEdges1Length Outside-test plane count brush1.
   * @param usedPlanePairs1 Edge plane pairs of brush1.
   * @param intersectingPlaneIndices0 Original face indices for planes0.
   * @param hashedTreeSpaceVertices Output welder.
   * @param snapHashedVertices Snap welder.
   * @param foundIndices0 Accumulator for brush0 faces.
   * @param foundIndices1 Accumulator for brush1 faces.
   */
  static find(
    intersectingPlanes0: readonly SolidPlane[],
    intersectingPlanes0Length: number,
    intersectingPlanesAndEdges0Length: number,
    intersectingPlanes1: readonly SolidPlane[],
    intersectingPlanes1Length: number,
    intersectingPlanesAndEdges1Length: number,
    usedPlanePairs1: readonly SolidAlgorithmPlanePair[],
    intersectingPlaneIndices0: readonly number[],
    hashedTreeSpaceVertices: HashedVertexTable,
    snapHashedVertices: HashedVertexTable,
    foundIndices0: SolidAlgorithmPlaneVertexIndexPair[],
    foundIndices1: SolidAlgorithmPlaneVertexIndexPair[],
  ): void {
    void intersectingPlanes1Length;
    const candidates = this.buildCandidates(
      intersectingPlanes0,
      intersectingPlanes0Length,
      usedPlanePairs1,
      intersectingPlaneIndices0,
    );
    const filtered = this.filterCandidates(
      candidates,
      intersectingPlanes0,
      intersectingPlanesAndEdges0Length,
      intersectingPlanes1,
      intersectingPlanesAndEdges1Length,
    );
    for (const candidate of filtered) {
      this.appendCandidate(candidate, hashedTreeSpaceVertices, snapHashedVertices, foundIndices0, foundIndices1);
    }
  }

  /**
   * Builds raw triple-plane candidates before filtering.
   *
   * @param intersectingPlanes0 Brush0 planes.
   * @param intersectingPlanes0Length Brush0 face plane count.
   * @param usedPlanePairs1 Brush1 plane pairs.
   * @param intersectingPlaneIndices0 Brush0 original plane indices.
   * @returns Candidate list.
   */
  private static buildCandidates(
    intersectingPlanes0: readonly SolidPlane[],
    intersectingPlanes0Length: number,
    usedPlanePairs1: readonly SolidAlgorithmPlanePair[],
    intersectingPlaneIndices0: readonly number[],
  ): IntersectionCandidate[] {
    const candidates: IntersectionCandidate[] = [];
    for (const pair of usedPlanePairs1) {
      for (let planeSlot = 0; planeSlot < intersectingPlanes0Length; planeSlot++) {
        const plane2 = intersectingPlanes0[planeSlot]!;
        const planeIndex2 = intersectingPlaneIndices0[planeSlot]!;
        const candidate = this.tryBuildCandidate(pair, plane2, planeIndex2);
        if (candidate) {
          candidates.push(candidate);
        }
      }
    }
    return candidates;
  }

  /**
   * Builds one candidate when the three planes are not aligned.
   *
   * @param pair Brush1 edge plane pair.
   * @param plane2 Brush0 plane.
   * @param planeIndex2 Brush0 plane index.
   * @returns Candidate or null.
   */
  private static tryBuildCandidate(
    pair: SolidAlgorithmPlanePair,
    plane2: SolidPlane,
    planeIndex2: number,
  ): IntersectionCandidate | null {
    const localVertex = this.localVertexForEdge(pair, plane2);
    if (!localVertex) {
      return null;
    }
    return {
      plane2,
      planeIndex0: pair.planeIndex0,
      planeIndex1: pair.planeIndex1,
      planeIndex2,
      edgeVertex0: pair.edgeVertex0,
      edgeVertex1: pair.edgeVertex1,
      localVertex,
    };
  }

  /**
   * Finds where a plane crosses an edge. The edge line comes from its two face
   * planes, or from the edge segment itself when those planes coincide.
   *
   * @param pair Edge plane pair.
   * @param plane2 Crossing plane.
   * @returns Crossing point, or null when there is none.
   */
  private static localVertexForEdge(pair: SolidAlgorithmPlanePair, plane2: SolidPlane): THREE.Vector3 | null {
    if (!this.planesAligned(pair.plane0, pair.plane1, plane2)) {
      return SolidAlgorithmPlaneTripleIntersection.intersect(plane2, pair.plane0, pair.plane1);
    }
    if (!this.edgePlanesCoincide(pair)) {
      return null;
    }
    return this.flatEdgeIntersectSegment(pair, plane2);
  }

  /**
   * Returns true when both face planes of an edge are the same plane, so the
   * edge is a seam inside one flat surface.
   *
   * @param pair Edge plane pair.
   * @returns True when the edge planes coincide.
   */
  private static edgePlanesCoincide(pair: SolidAlgorithmPlanePair): boolean {
    return (
      pair.plane0.normal.dot(pair.plane1.normal) >= SOLID_NORMAL_ALIGN_EPSILON &&
      Math.abs(pair.plane0.offset - pair.plane1.offset) <= SOLID_FAT_PLANE_EPSILON
    );
  }

  /**
   * Intersects a plane with the segment of a flat edge.
   *
   * @param pair Edge plane pair whose planes coincide.
   * @param plane2 Crossing plane.
   * @returns Point on the edge segment, or null when the plane is parallel to
   *   the edge surface or does not reach the segment.
   */
  private static flatEdgeIntersectSegment(pair: SolidAlgorithmPlanePair, plane2: SolidPlane): THREE.Vector3 | null {
    if (Math.abs(plane2.normal.dot(pair.plane0.normal)) >= SOLID_NORMAL_ALIGN_EPSILON) {
      return null;
    }
    const distance0 = plane2.signedDistance(pair.edgeVertex0);
    const distance1 = plane2.signedDistance(pair.edgeVertex1);
    const denominator = distance0 - distance1;
    if (distance0 * distance1 > 0 || Math.abs(denominator) < 1e-12) {
      return null;
    }
    return new THREE.Vector3().lerpVectors(pair.edgeVertex0, pair.edgeVertex1, distance0 / denominator);
  }

  /**
   * Returns true when any pair of the three planes is nearly parallel.
   *
   * @param plane0 First plane.
   * @param plane1 Second plane.
   * @param plane2 Third plane.
   * @returns True when triple intersection is invalid.
   */
  private static planesAligned(plane0: SolidPlane, plane1: SolidPlane, plane2: SolidPlane): boolean {
    if (Math.abs(plane2.normal.dot(plane0.normal)) >= SOLID_NORMAL_ALIGN_EPSILON) {
      return true;
    }
    if (Math.abs(plane2.normal.dot(plane1.normal)) >= SOLID_NORMAL_ALIGN_EPSILON) {
      return true;
    }
    return Math.abs(plane0.normal.dot(plane1.normal)) >= SOLID_NORMAL_ALIGN_EPSILON;
  }

  /**
   * Drops candidates coplanar with their edge or outside either brush.
   *
   * @param candidates Raw candidates.
   * @param planes0 Brush0 planes.
   * @param planes0Length Brush0 outside-test count.
   * @param planes1 Brush1 planes.
   * @param planes1Length Brush1 outside-test count.
   * @returns Filtered candidates.
   */
  private static filterCandidates(
    candidates: IntersectionCandidate[],
    planes0: readonly SolidPlane[],
    planes0Length: number,
    planes1: readonly SolidPlane[],
    planes1Length: number,
  ): IntersectionCandidate[] {
    return candidates.filter((candidate) => {
      if (this.edgeLiesOnPlane(candidate)) {
        return false;
      }
      if (SolidAlgorithmCreateIntersectionLoopsOutside.isOutsidePlanes(planes0, planes0Length, candidate.localVertex)) {
        return false;
      }
      return !SolidAlgorithmCreateIntersectionLoopsOutside.isOutsidePlanes(
        planes1,
        planes1Length,
        candidate.localVertex,
      );
    });
  }

  /**
   * Returns true when both edge endpoints lie on plane2 (grazing edge).
   *
   * @param candidate Candidate.
   * @returns True when the edge is coplanar with plane2.
   */
  private static edgeLiesOnPlane(candidate: IntersectionCandidate): boolean {
    const d0 = Math.abs(candidate.plane2.signedDistance(candidate.edgeVertex0));
    const d1 = Math.abs(candidate.plane2.signedDistance(candidate.edgeVertex1));
    return d0 <= SOLID_FAT_PLANE_EPSILON && d1 <= SOLID_FAT_PLANE_EPSILON;
  }

  /**
   * Snaps and records one candidate into both found-index lists.
   *
   * @param candidate Valid candidate.
   * @param hashedTreeSpaceVertices Output welder.
   * @param snapHashedVertices Snap welder.
   * @param foundIndices0 Brush0 accumulator.
   * @param foundIndices1 Brush1 accumulator.
   */
  private static appendCandidate(
    candidate: IntersectionCandidate,
    hashedTreeSpaceVertices: HashedVertexTable,
    snapHashedVertices: HashedVertexTable,
    foundIndices0: SolidAlgorithmPlaneVertexIndexPair[],
    foundIndices1: SolidAlgorithmPlaneVertexIndexPair[],
  ): void {
    const snapped = snapHashedVertices.snap(candidate.localVertex);
    const treeSpaceVertexIndex = hashedTreeSpaceVertices.add(snapped);
    solidAlgorithmPlaneVertexIndexPairPushUnique(foundIndices0, candidate.planeIndex2, treeSpaceVertexIndex);
    solidAlgorithmPlaneVertexIndexPairPushUnique(foundIndices1, candidate.planeIndex0, treeSpaceVertexIndex);
    solidAlgorithmPlaneVertexIndexPairPushUnique(foundIndices1, candidate.planeIndex1, treeSpaceVertexIndex);
  }
}
