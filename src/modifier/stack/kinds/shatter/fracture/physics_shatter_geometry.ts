import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';

/**
 * Measures the volume a closed convex brush encloses.
 *
 * @param brush Convex brush with outward winding.
 * @returns Volume in cubic units; zero for an empty brush.
 */
export function physicsShatterBrushVolume(brush: SolidBrush): number {
  const origin = brush.vertices[0];
  if (!origin) return 0;
  let sixfold = 0;
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();
  const edgeC = new THREE.Vector3();
  for (const face of brush.faces) {
    const ring = brush.getFaceVertices(face);
    for (let index = 1; index + 1 < ring.length; index++) {
      edgeA.subVectors(ring[0] ?? origin, origin);
      edgeB.subVectors(ring[index] ?? origin, origin);
      edgeC.subVectors(ring[index + 1] ?? origin, origin);
      sixfold += edgeA.dot(edgeB.cross(edgeC));
    }
  }
  return Math.abs(sixfold) / 6;
}

/**
 * Returns the average of a brush's vertices.
 *
 * @param brush Brush.
 * @returns Vertex centroid; the origin for an empty brush.
 */
export function physicsShatterVertexCentroid(brush: SolidBrush): THREE.Vector3 {
  const centroid = new THREE.Vector3();
  for (const vertex of brush.vertices) centroid.add(vertex);
  return brush.vertices.length > 0 ? centroid.multiplyScalar(1 / brush.vertices.length) : centroid;
}

/**
 * Returns whether a point lies strictly inside every plane of a brush.
 *
 * @param brush Convex brush.
 * @param point Candidate point.
 * @param margin Distance the point must keep from every face.
 * @returns True when inside.
 */
export function physicsShatterBrushContains(brush: SolidBrush, point: THREE.Vector3, margin: number): boolean {
  return brush.planes.every((plane) => plane.signedDistance(point) < -margin);
}

/**
 * Measures a brush's axis-aligned bounds.
 *
 * @param brush Brush.
 * @returns Bounds of its vertices.
 */
export function physicsShatterBrushBounds(brush: SolidBrush): THREE.Box3 {
  return new THREE.Box3().setFromPoints(brush.vertices);
}
