import type { SnapHit } from '@/snap/hit/snap_hit.js';

/**
 * Picks one snap hit. Vertex and edge hits inside the radius beat a face hit.
 * Among those, the smallest screen distance wins. A face is used only when no
 * vertex or edge is inside the radius.
 *
 * @param hits Candidate hits.
 * @param screenRadiusPixels Maximum screen distance for a vertex or edge.
 * @returns Winning hit, or null when nothing qualifies.
 */
export function chooseSnapHit(hits: readonly SnapHit[], screenRadiusPixels: number): SnapHit | null {
  const nearestPoint = nearestVertexOrEdge(hits, screenRadiusPixels);
  if (nearestPoint) {
    return nearestPoint;
  }
  return nearestFace(hits);
}

/**
 * Returns the closest vertex or edge inside the radius.
 *
 * @param hits Candidate hits.
 * @param screenRadiusPixels Maximum screen distance.
 * @returns Closest hit, or null.
 */
function nearestVertexOrEdge(hits: readonly SnapHit[], screenRadiusPixels: number): SnapHit | null {
  let best: SnapHit | null = null;
  for (const hit of hits) {
    if (!vertexOrEdgeInsideRadius(hit, screenRadiusPixels)) {
      continue;
    }
    best = closerHit(best, hit);
  }
  return best;
}

/**
 * Returns the closest face hit.
 *
 * @param hits Candidate hits.
 * @returns Closest face, or null.
 */
function nearestFace(hits: readonly SnapHit[]): SnapHit | null {
  let best: SnapHit | null = null;
  for (const hit of hits) {
    if (hit.kind !== 'face') {
      continue;
    }
    best = closerHit(best, hit);
  }
  return best;
}

/**
 * Returns whether a hit is a vertex or edge inside the radius.
 *
 * @param hit Candidate hit.
 * @param screenRadiusPixels Maximum screen distance.
 * @returns True when the hit can beat a face.
 */
function vertexOrEdgeInsideRadius(hit: SnapHit, screenRadiusPixels: number): boolean {
  if (hit.kind === 'face') {
    return false;
  }
  return hit.screenDistancePixels <= screenRadiusPixels;
}

/**
 * Keeps the hit with the smaller screen distance.
 *
 * @param current Current best, or null.
 * @param candidate Next hit.
 * @returns The closer hit.
 */
function closerHit(current: SnapHit | null, candidate: SnapHit): SnapHit {
  if (!current) {
    return candidate;
  }
  if (candidate.screenDistancePixels < current.screenDistancePixels) {
    return candidate;
  }
  return current;
}
