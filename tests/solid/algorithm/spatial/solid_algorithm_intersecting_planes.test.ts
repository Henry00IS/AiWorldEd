import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidAlgorithmIntersectingPlanes } from '@/solid/algorithm/spatial/solid_algorithm_intersecting_planes.js';
import { SolidAlgorithmIntersectionType } from '@/solid/algorithm/routing/solid_algorithm_intersection_type.js';

/** Intersecting-plane lookup for local plane tables. */
describe('SolidAlgorithmIntersectingPlanes', () => {
  it('returns every plane index when the pair type is not Intersection', () => {
    const brush = SolidBrushFactory.createCenteredBox(2, 2, 2);
    const indices = SolidAlgorithmIntersectingPlanes.collectIndices(
      SolidAlgorithmIntersectionType.AInsideB,
      brush.planes,
      brush.computeLocalBounds(),
      brush.vertices,
    );
    expect(indices).toEqual(brush.planes.map((_, index) => index));
  });

  it('keeps planes that straddle an overlapping peer volume', () => {
    const subject = SolidBrushFactory.createCenteredBox(2, 2, 2);
    const peer = SolidBrushFactory.createCenteredBox(2, 2, 2);
    const peerOffset = new THREE.Vector3(1.5, 0, 0);
    const peerVertices = peer.vertices.map((vertex) => vertex.clone().add(peerOffset));
    const peerBounds = {
      min: new THREE.Vector3(0.5, -1, -1),
      max: new THREE.Vector3(2.5, 1, 1),
    };
    const indices = SolidAlgorithmIntersectingPlanes.collectIndices(
      SolidAlgorithmIntersectionType.Intersection,
      subject.planes,
      peerBounds,
      peerVertices,
    );
    expect(indices.length).toBeGreaterThan(0);
    expect(indices.length).toBeLessThan(subject.planes.length);
  });

  it('returns empty when any plane fully separates the other bounds', () => {
    const subject = SolidBrushFactory.createCenteredBox(2, 2, 2);
    const farBounds = {
      min: new THREE.Vector3(50, -1, -1),
      max: new THREE.Vector3(52, 1, 1),
    };
    const farVertices = [
      new THREE.Vector3(50, -1, -1),
      new THREE.Vector3(52, -1, -1),
      new THREE.Vector3(52, 1, 1),
      new THREE.Vector3(50, 1, 1),
    ];
    const indices = SolidAlgorithmIntersectingPlanes.collectIndices(
      SolidAlgorithmIntersectionType.Intersection,
      subject.planes,
      farBounds,
      farVertices,
    );
    expect(indices).toEqual([]);
  });
});
