import * as THREE from 'three';
import { findSolidBrushWeldedVertexIndex } from '@/solid/brush/solid_brush_vertex_weld.js';

/**
 * Welds face loops at brush precision and removes collapsed edges and faces.
 *
 * @param loops Ordered convex face loops.
 * @returns Loops sharing canonical corners without degenerate faces.
 */
export function generatorRevolveLoopsWeld(loops: readonly THREE.Vector3[][]): THREE.Vector3[][] {
  const vertices: THREE.Vector3[] = [];
  return loops.flatMap((loop) => {
    const welded = loop.map((point) => generatorRevolveCornerWeld(vertices, point));
    const unique = welded.filter((point, index) => welded.indexOf(point) === index);
    return unique.length >= 3 ? [unique] : [];
  });
}

/**
 * Resolves a corner to the existing brush-precision point, or adds it.
 *
 * @param vertices Canonical corners, extended in place.
 * @param point Candidate corner.
 * @returns Shared corner object.
 */
function generatorRevolveCornerWeld(vertices: THREE.Vector3[], point: THREE.Vector3): THREE.Vector3 {
  const index = findSolidBrushWeldedVertexIndex(vertices, point);
  if (index !== null) return vertices[index] ?? point;
  vertices.push(point);
  return point;
}
