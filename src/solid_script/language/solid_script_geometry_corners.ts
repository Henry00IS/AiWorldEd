import * as THREE from 'three';
import { solidScriptBodyClip } from './solid_script_body_clip.js';
import type { SolidScriptBody } from './solid_script_body.js';

/** A corner of a solid to cut off, and how far along its edges. */
export interface SolidScriptCornerCut {
  at: THREE.Vector3;
  distance: number;
}

/** A plane a cut made: its outward direction and a point on it. */
export interface SolidScriptCornerPlane {
  normal: THREE.Vector3;
  point: THREE.Vector3;
}

/**
 * The far ends of the edges that meet a corner of a body.
 *
 * @param body Corners and faces.
 * @param at Corner.
 * @returns One point per edge.
 */
function solidScriptCornerNeighbours(body: SolidScriptBody, at: THREE.Vector3): THREE.Vector3[] {
  const found: THREE.Vector3[] = [];
  for (const loop of body.faces)
    loop.forEach((index, place) => {
      if ((body.points[index]?.distanceTo(at) ?? Infinity) > 1e-6) return;
      const after = body.points[loop[(place + 1) % loop.length] ?? -1];
      if (after && found.every((point) => point.distanceTo(after) > 1e-6)) found.push(after);
    });
  return found;
}

/**
 * The plane that cuts one corner off: square to the average direction of its
 * edges, Distance along the edge that reaches it first, so no edge is cut
 * further than Distance. On a box corner it passes through the point Distance
 * along every edge.
 *
 * @param body Corners and faces.
 * @param cut Corner and distance.
 * @returns Plane.
 */
function solidScriptCornerPlane(body: SolidScriptBody, cut: SolidScriptCornerCut): SolidScriptCornerPlane {
  const ends = solidScriptCornerNeighbours(body, cut.at);
  const shortest = Math.min(...ends.map((end) => end.distanceTo(cut.at)));
  if (ends.length < 3 || cut.distance >= shortest)
    throw new Error(
      `Bevel Distance ${cut.distance} is too long for an edge of ${Math.round(shortest * 1e4) / 1e4} m; try a Distance below the shortest edge`,
    );
  const directions = ends.map((end) => end.clone().sub(cut.at).normalize());
  const normal = directions.reduce((sum, direction) => sum.sub(direction), new THREE.Vector3()).normalize();
  const reach = Math.max(...directions.map((direction) => normal.dot(direction)));
  return { normal, point: cut.at.clone().addScaledVector(normal, reach * cut.distance) };
}

/**
 * Cuts corners of a convex solid off flat. Every plane is worked out on the
 * solid as given, so the order of the corners does not matter.
 *
 * @param body Corners and faces of the solid.
 * @param cuts Corners and distances.
 * @returns The cut body and the planes of its new faces.
 */
export function solidScriptGeometryCornerBevel(
  body: SolidScriptBody,
  cuts: readonly SolidScriptCornerCut[],
): { body: SolidScriptBody; planes: SolidScriptCornerPlane[] } {
  const planes = cuts.map((cut) => solidScriptCornerPlane(body, cut));
  const cutBody = planes.reduce(
    (done, plane) => solidScriptBodyClip(done, plane.normal, plane.normal.dot(plane.point)),
    body,
  );
  return { body: cutBody, planes };
}
