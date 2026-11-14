import * as THREE from 'three';
import { sketchArea } from './sketch_regions.js';

/**
 * Splits a simple counter-clockwise outline, convex or not, into convex pieces:
 * it triangulates the outline, then joins neighbouring pieces across shared
 * edges for as long as the result stays convex.
 *
 * @param outline Counter-clockwise outline.
 * @returns Convex counter-clockwise pieces covering the outline.
 */
export function sketchConvexPieces(outline: readonly THREE.Vector2[]): THREE.Vector2[][] {
  if (outline.length < 3 || Math.abs(sketchArea(outline)) < 1e-10) return [];
  if (sketchIsConvex(outline)) return [outline.map((point) => point.clone())];
  const triangles = THREE.ShapeUtils.triangulateShape([...outline], []);
  let pieces: number[][] = triangles.map((triangle) =>
    sketchArea(triangle.map((index) => outline[index]!)) < 0 ? [...triangle].reverse() : [...triangle],
  );
  let joined = true;
  while (joined) {
    joined = false;
    for (let a = 0; a < pieces.length && !joined; a++) {
      for (let b = a + 1; b < pieces.length && !joined; b++) {
        const merged = sketchJoin(pieces[a]!, pieces[b]!);
        if (merged && sketchIsConvex(merged.map((index) => outline[index]!))) {
          pieces = pieces.filter((_, index) => index !== a && index !== b);
          pieces.push(merged);
          joined = true;
        }
      }
    }
  }
  return pieces.map((piece) => piece.map((index) => outline[index]!.clone()));
}

/**
 * Joins two counter-clockwise index loops that share exactly one edge.
 *
 * @param first First loop.
 * @param second Second loop.
 * @returns Joined loop, or null without a shared edge.
 */
function sketchJoin(first: readonly number[], second: readonly number[]): number[] | null {
  for (let i = 0; i < first.length; i++) {
    const a = first[i]!;
    const b = first[(i + 1) % first.length]!;
    const j = second.findIndex((index, at) => index === b && second[(at + 1) % second.length] === a);
    if (j < 0) continue;
    const loop: number[] = [];
    for (let step = 1; step <= first.length; step++) loop.push(first[(i + step) % first.length]!);
    for (let step = 2; step < second.length; step++) loop.push(second[(j + step) % second.length]!);
    return loop;
  }
  return null;
}

/**
 * Returns whether a counter-clockwise loop is convex, allowing straight
 * corners.
 *
 * @param loop Loop.
 * @returns True when convex.
 */
export function sketchIsConvex(loop: readonly THREE.Vector2[]): boolean {
  for (let index = 0; index < loop.length; index++) {
    const a = loop[index]!;
    const b = loop[(index + 1) % loop.length]!;
    const c = loop[(index + 2) % loop.length]!;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross < -1e-9) return false;
  }
  return true;
}

/**
 * Keeps the part of a convex loop with U at or above a minimum.
 *
 * @param loop Convex loop.
 * @param minimum Smallest U kept.
 * @returns Clipped loop; empty when nothing remains.
 */
export function sketchClipMinU(loop: readonly THREE.Vector2[], minimum: number): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  loop.forEach((point, index) => {
    const next = loop[(index + 1) % loop.length]!;
    const inside = point.x >= minimum;
    if (inside) out.push(point.clone());
    if (inside !== next.x >= minimum) {
      const t = (minimum - point.x) / (next.x - point.x);
      out.push(new THREE.Vector2(minimum, point.y + (next.y - point.y) * t));
    }
  });
  return out.length >= 3 && Math.abs(sketchArea(out)) > 1e-10 ? out : [];
}
