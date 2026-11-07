import { Vector3 } from 'three';
import { SolidPlane } from '@/solid/brush/solid_plane.js';
import { modifierBevelOptionsRead } from '@/modifier/volume/modifier_volume_bevel_options.js';
import type { ModifierBevelTrackedEdge, ModifierBevelEdgeCut } from './modifier_bevel_brush_edges.js';

/** Authored vertex where at least three selected edges meet. */
export interface ModifierBevelCornerGroup {
  /** World vertex. */
  point: Vector3;
  /** Selected incident authored edges. */
  edges: ModifierBevelTrackedEdge[];
}

/**
 * Groups selected edges by their shared endpoints.
 *
 * @param edges Tracked world edges.
 */
export function modifierBevelCornerGroups(edges: readonly ModifierBevelTrackedEdge[]): ModifierBevelCornerGroup[] {
  const groups: ModifierBevelCornerGroup[] = [];
  for (const edge of edges) {
    for (const point of [edge.start, edge.end]) {
      let group = groups.find((entry) => entry.point.distanceToSquared(point) < 1e-12);
      if (!group) {
        group = { point, edges: [] };
        groups.push(group);
      }
      group.edges.push(edge);
    }
  }
  return groups.filter((group) => group.edges.length >= 3);
}

/**
 * Adds optional planar patches solely by intersecting convex half spaces.
 *
 * @param edges Selected world edges.
 */
export function modifierBevelCornerPatchCuts(edges: readonly ModifierBevelTrackedEdge[]): ModifierBevelEdgeCut[] {
  return modifierBevelCornerGroups(edges).flatMap((group) => {
    if (
      !group.edges.some(
        (edge) =>
          edge.segments > 1 &&
          modifierBevelOptionsRead(edge.volume).profile > 0.25 &&
          modifierBevelOptionsRead(edge.volume).corner === 'patch',
      )
    )
      return [];
    const plane = modifierBevelCornerPatchPlane(group);
    return plane ? [{ plane }] : [];
  });
}

/**
 * Cuts a small flat cap between three or more converging rounded strips.
 *
 * @param group Selected incident edges.
 */
function modifierBevelCornerPatchPlane(group: ModifierBevelCornerGroup): SolidPlane | null {
  const normal = new Vector3();
  for (const edge of group.edges) normal.add(edge.normalA).add(edge.normalB);
  if (normal.lengthSq() < 1e-12) return null;
  normal.normalize();
  const retreats = group.edges.map((edge) => modifierBevelCornerRetreat(group.point, normal, edge));
  const depth = Math.min(...retreats);
  return depth > 1e-8 ? new SolidPlane(normal, -normal.dot(group.point) + depth) : null;
}

/**
 * Measures a conservative corner patch retreat along its outward bisector.
 *
 * @param point Corner vertex.
 * @param normal Cap normal.
 * @param edge Incident selected edge.
 */
function modifierBevelCornerRetreat(point: Vector3, normal: Vector3, edge: ModifierBevelTrackedEdge): number {
  const other = edge.start.distanceToSquared(point) < 1e-12 ? edge.end : edge.start;
  const inward = other.clone().sub(point).normalize();
  return 1.5 * edge.distance * Math.abs(normal.dot(inward));
}
