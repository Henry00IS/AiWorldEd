import * as THREE from 'three';
import { modifierBevelProfileSamples } from '@/modifier/bevel/modifier_bevel_round_planes.js';

/**
 * Returns the sharp corners of a square or regular polygon outline in winding
 * order, starting at the first corner past the +X axis.
 *
 * @param polygonSides Polygon face count, or undefined for the square.
 * @returns Outline corners before aspect scaling.
 */
export function generatorRevolveSharpVertices(polygonSides?: number): THREE.Vector2[] {
  if (!polygonSides)
    return [new THREE.Vector2(1, 1), new THREE.Vector2(-1, 1), new THREE.Vector2(-1, -1), new THREE.Vector2(1, -1)];
  return Array.from({ length: polygonSides }, (_, at) => {
    const angle = ((at + 0.5) * Math.PI * 2) / polygonSides;
    return new THREE.Vector2(Math.cos(angle), Math.sin(angle));
  });
}

/**
 * Cuts every corner of a sharp outline with the bevel modifier's round profile:
 * the cut starts and ends `size` of half a side away from the corner and has
 * `sides` faces, so one face is a straight chamfer.
 *
 * @param vertices Sharp corners in winding order.
 * @param size Fraction of half a side, in 0..1.
 * @param sides Faces across each corner.
 * @returns Per corner, the cut from the incoming side to the outgoing side.
 */
export function generatorRevolveCornerCuts(
  vertices: readonly THREE.Vector2[],
  size: number,
  sides: number,
): THREE.Vector2[][] {
  return vertices.map((vertex, index) => {
    const before = vertices[(index + vertices.length - 1) % vertices.length] ?? vertex;
    const after = vertices[(index + 1) % vertices.length] ?? vertex;
    const distance = (size * vertex.distanceTo(after)) / 2;
    const corner = new THREE.Vector3(vertex.x, vertex.y, 0);
    const cut = modifierBevelProfileSamples(
      corner,
      generatorRevolveSideNormal(before, vertex),
      generatorRevolveSideNormal(vertex, after),
      distance,
      sides,
    );
    return cut.length > 0 ? cut.map((point) => new THREE.Vector2(point.x, point.y)) : [vertex.clone()];
  });
}

/**
 * Returns the outward normal of one outline side wound counter-clockwise.
 *
 * @param start Side start.
 * @param end Side end.
 * @returns Unit normal in the outline plane.
 */
export function generatorRevolveSideNormal(start: THREE.Vector2, end: THREE.Vector2): THREE.Vector3 {
  return new THREE.Vector3(end.y - start.y, start.x - end.x, 0).normalize();
}

/**
 * Samples a cut-corner outline at a shared ring index. Every corner owns the
 * same number of ring points: one per corner face, the rest along the side
 * after it. A side with no length left hands its points to the corner faces.
 *
 * @param cuts Corner cuts in winding order.
 * @param ringSides Ring point count, a multiple of the corner count.
 * @param index Ring index.
 * @returns Outline point.
 */
export function generatorRevolveCornerPoint(
  cuts: readonly THREE.Vector2[][],
  ringSides: number,
  index: number,
): THREE.Vector2 {
  const share = ringSides / cuts.length;
  const corner = Math.floor(index / share);
  const cut = cuts[corner % cuts.length] ?? [];
  const next = cuts[(corner + 1) % cuts.length]?.[0];
  const path = next ? [...cut, next] : cut;
  const counts = generatorRevolveCornerCounts(path, share);
  let offset = index - corner * share;
  for (let edge = 0; edge < counts.length; edge++) {
    const count = counts[edge] ?? 0;
    const start = path[edge] ?? new THREE.Vector2();
    if (offset < count) return start.clone().lerp(path[edge + 1] ?? start, offset / count);
    offset -= count;
  }
  return path[0]?.clone() ?? new THREE.Vector2();
}

/**
 * Splits one corner's ring points between its faces and the side after it.
 *
 * @param path Cut points followed by the next corner's first cut point.
 * @param share Ring points per corner.
 * @returns Ring points per path edge.
 */
function generatorRevolveCornerCounts(path: readonly THREE.Vector2[], share: number): number[] {
  const faces = path.length - 2;
  const last = path[path.length - 1];
  const side = last ? (path[path.length - 2]?.distanceTo(last) ?? 0) : 0;
  if (side > 1e-9 || faces < 1) return [...Array<number>(Math.max(faces, 0)).fill(1), share - Math.max(faces, 0)];
  return [
    ...Array.from(
      { length: faces },
      (_, face) => Math.floor(((face + 1) * share) / faces) - Math.floor((face * share) / faces),
    ),
    0,
  ];
}
