import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { meshDocumentFromBufferGeometryWelded } from '@/edit/mesh/mesh_edit_weld.js';
import { mergeCoplanarMeshDocumentFaces } from '@/mesh/convert/mesh_merge_coplanar_faces.js';
import { createMeshDocumentBox } from '@/mesh/primitive/mesh_primitive_box.js';
import { meshDocumentFromTriangleList } from '@/mesh/convert/mesh_from_triangle_list.js';
import { meshDocumentToBufferGeometry } from '@/mesh/convert/mesh_to_buffer_geometry.js';
import type { MeshDocument } from '@/mesh/document/mesh_document.js';
import { meshTopologyFaceCornerCount, meshTopologyFaceVertexIndices } from '@/mesh/topology/mesh_topology_query.js';

/**
 * Collects corner counts for every face in a document.
 *
 * @param document Mesh document.
 * @returns Corner counts per face.
 */
function faceCornerCounts(document: {
  getTopology: () => import('@/mesh/topology/mesh_topology.js').MeshTopology;
}): number[] {
  const topology = document.getTopology();
  const counts: number[] = [];
  for (let faceIndex = 0; faceIndex < topology.getFaceCount(); faceIndex++) {
    counts.push(meshTopologyFaceCornerCount(topology, faceIndex));
  }
  return counts;
}

/** Square frame 3×3 around a 1×1 hole in the XY plane, as 8 triangles. */
const FRAME_POSITIONS = new Float32Array([0, 0, 0, 3, 0, 0, 3, 3, 0, 0, 3, 0, 1, 1, 0, 2, 1, 0, 2, 2, 0, 1, 2, 0]);
const FRAME_TRIANGLES = [0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];

/**
 * Lists the display triangles of a document.
 *
 * @param document Mesh document.
 * @returns Triangles.
 */
function displayTriangles(document: MeshDocument): THREE.Triangle[] {
  const geometry = meshDocumentToBufferGeometry(document);
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const count = index ? index.count : position.count;
  const corner = (slot: number) => new THREE.Vector3().fromBufferAttribute(position, index ? index.getX(slot) : slot);
  return Array.from(
    { length: count / 3 },
    (_unused, t) => new THREE.Triangle(corner(t * 3), corner(t * 3 + 1), corner(t * 3 + 2)),
  );
}

/**
 * Tells whether two triangle sets cover the same area: equal total area and
 * every triangle's centroid lies on the other set.
 *
 * @param a First set.
 * @param b Second set.
 * @returns True when both cover the same surface.
 */
function sameSurface(a: THREE.Triangle[], b: THREE.Triangle[]): boolean {
  const area = (list: THREE.Triangle[]) => list.reduce((sum, triangle) => sum + triangle.getArea(), 0);
  const onto = (from: THREE.Triangle[], to: THREE.Triangle[]) =>
    from.every((triangle) => {
      const centroid = triangle.getMidpoint(new THREE.Vector3());
      return to.some((other) => other.closestPointToPoint(centroid, new THREE.Vector3()).distanceTo(centroid) < 1e-6);
    });
  return Math.abs(area(a) - area(b)) < 1e-6 && onto(a, b) && onto(b, a);
}

/**
 * Lists each face's outline corners, dropping corners where the outline goes
 * straight on.
 *
 * @param document Mesh document.
 * @returns Corner positions per face.
 */
function faceOutlines(document: MeshDocument): THREE.Vector3[][] {
  const topology = document.getTopology();
  const positions = topology.getPositions();
  return Array.from({ length: topology.getFaceCount() }, (_unused, face) => {
    const corners = meshTopologyFaceVertexIndices(topology, face).map((v) =>
      new THREE.Vector3().fromArray(positions, v * 3),
    );
    return corners.filter((corner, index) => {
      const before = corners[(index + corners.length - 1) % corners.length]!;
      const after = corners[(index + 1) % corners.length]!;
      return corner.clone().sub(before).cross(after.clone().sub(corner)).length() > 1e-9;
    });
  });
}

/**
 * Returns the smallest interior corner angle of a face outline, or a negative
 * value when a corner turns against the +Z winding (not convex).
 *
 * @param outline Face outline corners.
 * @returns Smallest corner angle in degrees.
 */
function smallestConvexCornerAngle(outline: THREE.Vector3[]): number {
  return Math.min(
    ...outline.map((corner, index) => {
      const before = outline[(index + outline.length - 1) % outline.length]!.clone().sub(corner);
      const after = outline[(index + 1) % outline.length]!.clone().sub(corner);
      const turn = corner
        .clone()
        .sub(outline[(index + outline.length - 1) % outline.length]!)
        .cross(after).z;
      return turn < 0 ? -1 : THREE.MathUtils.radToDeg(before.angleTo(after));
    }),
  );
}

describe('mergeCoplanarMeshDocumentFaces', () => {
  it('leaves welded BoxGeometry as triangle faces until merge is applied', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const document = meshDocumentFromBufferGeometryWelded(geometry);
    expect(document.getTopology().getVertexCount()).toBe(8);
    expect(document.getTopology().getFaceCount()).toBe(12);
    expect(faceCornerCounts(document).every((count) => count === 3)).toBe(true);
    geometry.dispose();
  });

  it('leaves authored box n-gons unchanged', () => {
    const box = createMeshDocumentBox(1, 1, 1);
    const merged = mergeCoplanarMeshDocumentFaces(box);
    expect(merged.getTopology().getFaceCount()).toBe(6);
    expect(faceCornerCounts(merged).every((count) => count === 4)).toBe(true);
  });

  it('can still merge welded box triangles into six quads when requested', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const triangles = meshDocumentFromBufferGeometryWelded(geometry);
    expect(triangles.getTopology().getFaceCount()).toBe(12);
    const merged = mergeCoplanarMeshDocumentFaces(triangles);
    expect(merged.getTopology().getFaceCount()).toBe(6);
    expect(faceCornerCounts(merged).every((count) => count === 4)).toBe(true);
    geometry.dispose();
  });

  it('merges coplanar triangles only where their UVs continue the same mapping', () => {
    const positions = new Float32Array([0, 0, 0, 2, 0, 0, 2, 1, 0, 0, 1, 0]);
    const indices = [0, 1, 2, 0, 2, 3];
    const continuous = new Float32Array([0, 0, 1, 0, 1, 0.5, 0, 0, 1, 0.5, 0, 0.5]);
    const seam = new Float32Array([0, 0, 1, 0, 1, 0.5, 0.3, 0, 1.3, 0.5, 0.3, 0.5]);
    const merged = mergeCoplanarMeshDocumentFaces(meshDocumentFromTriangleList(positions, indices, continuous));
    const split = mergeCoplanarMeshDocumentFaces(meshDocumentFromTriangleList(positions, indices, seam));
    expect(faceCornerCounts(merged)).toEqual([4]);
    expect(faceCornerCounts(split)).toEqual([3, 3]);
  });

  it('keeps every triangle of a coplanar region with a hole', () => {
    const source = meshDocumentFromTriangleList(FRAME_POSITIONS, FRAME_TRIANGLES);
    const merged = mergeCoplanarMeshDocumentFaces(source);
    expect(sameSurface(displayTriangles(merged), displayTriangles(source))).toBe(true);
    expect(merged.getTopology().getFaceCount()).toBeLessThan(8);
  });

  it('splits a frame into its four convex trapezoid strips without slivers', () => {
    const merged = mergeCoplanarMeshDocumentFaces(meshDocumentFromTriangleList(FRAME_POSITIONS, FRAME_TRIANGLES));
    const outlines = faceOutlines(merged);
    expect(outlines.map((outline) => outline.length)).toEqual([4, 4, 4, 4]);
    expect(Math.min(...outlines.map(smallestConvexCornerAngle))).toBeGreaterThanOrEqual(45 - 1e-6);
  });

  it('keeps every triangle of a coplanar region whose outline touches itself', () => {
    const pinched = FRAME_TRIANGLES.slice(0, 3).concat(FRAME_TRIANGLES.slice(6));
    const source = meshDocumentFromTriangleList(FRAME_POSITIONS, pinched);
    const merged = mergeCoplanarMeshDocumentFaces(source);
    expect(sameSurface(displayTriangles(merged), displayTriangles(source))).toBe(true);
    expect(merged.getTopology().getFaceCount()).toBeLessThan(7);
    expect(Math.min(...faceOutlines(merged).map(smallestConvexCornerAngle))).toBeGreaterThan(0);
  });

  it('keeps a concave coplanar patch without holes as one polygon', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 2, 0, 2, 2, 0, 2, 0, 0, 3, 0, 0, 3, 3, 0, 0, 3, 0]);
    const source = meshDocumentFromTriangleList(positions, [0, 1, 2, 0, 2, 7, 2, 3, 7, 3, 6, 7, 3, 4, 5, 3, 5, 6]);
    const merged = mergeCoplanarMeshDocumentFaces(source);
    expect(faceCornerCounts(merged)).toEqual([8]);
    expect(sameSurface(displayTriangles(merged), displayTriangles(source))).toBe(true);
  });
});
