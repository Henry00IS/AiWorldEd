import * as THREE from 'three';
import type { SolidScriptShapeMesh } from '@/solid_script/language/solid_script_mesh.js';

/**
 * Counts every directed edge of a mesh.
 *
 * @param mesh Mesh.
 * @returns Use count per "from:to" key.
 */
export function meshDirectedEdges(mesh: SolidScriptShapeMesh): Map<string, number> {
  const edges = new Map<string, number>();
  for (const face of mesh.faces)
    face.forEach((from, corner) => {
      const key = `${from}:${face[(corner + 1) % face.length]}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    });
  return edges;
}

/**
 * Counts edges whose two sides are not matched by exactly one face each, which
 * are cracks, open borders or folded seams.
 *
 * @param mesh Mesh.
 * @returns Number of unmatched directed edges.
 */
export function meshUnmatchedEdges(mesh: SolidScriptShapeMesh): number {
  const edges = meshDirectedEdges(mesh);
  let unmatched = 0;
  for (const [key, count] of edges) {
    const [from, to] = key.split(':');
    if (count !== 1 || edges.get(`${to}:${from}`) !== 1) unmatched += 1;
  }
  return unmatched;
}

/**
 * Euler characteristic of a mesh: 2 for one closed piece without handles.
 *
 * @param mesh Mesh.
 * @returns Points minus edges plus faces.
 */
export function meshEulerCharacteristic(mesh: SolidScriptShapeMesh): number {
  return mesh.points.length - meshDirectedEdges(mesh).size / 2 + mesh.faces.length;
}

/** One triangle of a mesh, with its corner numbers and bounds. */
interface MeshTriangle {
  corners: [number, number, number];
  triangle: THREE.Triangle;
  bounds: THREE.Box3;
}

/**
 * Splits every face into a fan of triangles around its first corner.
 *
 * @param mesh Mesh.
 * @returns Triangles.
 */
export function meshTriangles(mesh: SolidScriptShapeMesh): MeshTriangle[] {
  const triangles: MeshTriangle[] = [];
  for (const face of mesh.faces)
    for (let corner = 1; corner + 1 < face.length; corner++) {
      const corners: [number, number, number] = [face[0]!, face[corner]!, face[corner + 1]!];
      const [a, b, c] = corners.map((index) => mesh.points[index]!);
      triangles.push({
        corners,
        triangle: new THREE.Triangle(a, b, c),
        bounds: new THREE.Box3().setFromPoints([a!, b!, c!]),
      });
    }
  return triangles;
}

/**
 * Whether a segment passes through a triangle, away from its own ends.
 *
 * @param from Segment start.
 * @param to Segment end.
 * @param triangle Triangle.
 * @returns True when it crosses.
 */
function segmentCrossesTriangle(from: THREE.Vector3, to: THREE.Vector3, triangle: THREE.Triangle): boolean {
  const length = from.distanceTo(to);
  const hit = new THREE.Vector3();
  const ray = new THREE.Ray(from, to.clone().sub(from).normalize());
  if (!ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, hit)) return false;
  const along = hit.distanceTo(from);
  return along > 1e-7 && along < length - 1e-7;
}

/**
 * Whether two triangles pass through each other, from either one's edges
 * crossing the other.
 *
 * @param first Triangle.
 * @param second Triangle.
 * @returns True when they cross.
 */
function trianglesCross(first: THREE.Triangle, second: THREE.Triangle): boolean {
  const edges = (triangle: THREE.Triangle): [THREE.Vector3, THREE.Vector3][] => [
    [triangle.a, triangle.b],
    [triangle.b, triangle.c],
    [triangle.c, triangle.a],
  ];
  return (
    edges(first).some(([from, to]) => segmentCrossesTriangle(from, to, second)) ||
    edges(second).some(([from, to]) => segmentCrossesTriangle(from, to, first))
  );
}

/**
 * Counts pairs of triangles that share no corner yet pass through each other,
 * which is a surface folding into itself.
 *
 * @param mesh Mesh.
 * @returns Crossing pairs.
 */
export function meshSelfCrossings(mesh: SolidScriptShapeMesh): number {
  const triangles = meshTriangles(mesh).sort((a, b) => a.bounds.min.x - b.bounds.min.x);
  let crossings = 0;
  for (let index = 0; index < triangles.length; index++) {
    const first = triangles[index]!;
    for (let other = index + 1; other < triangles.length; other++) {
      const second = triangles[other]!;
      if (second.bounds.min.x > first.bounds.max.x) break;
      if (!first.bounds.intersectsBox(second.bounds)) continue;
      if (first.corners.some((corner) => second.corners.includes(corner))) continue;
      if (trianglesCross(first.triangle, second.triangle)) crossings++;
    }
  }
  return crossings;
}
