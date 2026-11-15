import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidPlane } from '@/solid/brush/solid_plane.js';
import { PhysicsShatterPolytope } from './physics_shatter_polytope.js';

/** One Voronoi cell before it becomes a piece. */
export interface PhysicsShatterCell {
  /** Site index the cell belongs to. */
  cellIndex: number;
  /** Cell geometry, or null when the cut failed. */
  brush: SolidBrush | null;
  /** Input face index of each cell face, or -1 for crack faces. */
  origins: number[];
}

/**
 * Cuts a convex brush into the Voronoi cells of its sites. Each cell is the
 * brush clipped by the bisector planes to the nearer sites, so it is convex.
 *
 * @param brush Convex brush.
 * @param sites Voronoi sites inside the brush.
 * @returns One cell per site, in site order.
 */
export function physicsShatterVoronoiCells(brush: SolidBrush, sites: readonly THREE.Vector3[]): PhysicsShatterCell[] {
  const polytope = PhysicsShatterPolytope.fromBrush(brush);
  return sites.map((_, cellIndex) =>
    physicsShatterCellOf(physicsShatterVoronoiCell(polytope, sites, cellIndex), cellIndex),
  );
}

/**
 * Turns a cut polytope into a cell.
 *
 * @param polytope Cut polytope, or null when nothing is left.
 * @param cellIndex Site or brick index.
 * @returns Cell; its brush is null when the shell could not be built.
 */
export function physicsShatterCellOf(polytope: PhysicsShatterPolytope | null, cellIndex: number): PhysicsShatterCell {
  const built = polytope?.toBrush() ?? null;
  return { cellIndex, brush: built?.brush ?? null, origins: built?.origins ?? [] };
}

/**
 * Builds one cell. Neighbours are visited nearest first, and the walk stops as
 * soon as a bisector lies beyond the cell's current radius, since no farther
 * site can cut it.
 *
 * @param polytope Input brush as a polytope.
 * @param sites Every site.
 * @param cellIndex Site whose cell is built.
 * @returns Cell polytope, or null when nothing is left.
 */
function physicsShatterVoronoiCell(
  polytope: PhysicsShatterPolytope,
  sites: readonly THREE.Vector3[],
  cellIndex: number,
): PhysicsShatterPolytope | null {
  const site = sites[cellIndex] ?? new THREE.Vector3();
  let cell: PhysicsShatterPolytope | null = polytope;
  let radius = polytope.radiusAround(site);
  for (const neighbour of physicsShatterNeighboursByDistance(sites, cellIndex)) {
    if (!cell || neighbour.distance * 0.5 > radius) break;
    const cut: PhysicsShatterPolytope | null = cell.clip(physicsShatterBisector(site, neighbour.site));
    if (cut !== cell && cut) radius = cut.radiusAround(site);
    cell = cut;
  }
  return cell;
}

/** A neighbouring site and its distance. */
interface PhysicsShatterNeighbour {
  site: THREE.Vector3;
  distance: number;
}

/**
 * Lists the other sites nearest first; ties keep site order, so the result is
 * deterministic.
 *
 * @param sites Every site.
 * @param cellIndex Site to measure from.
 * @returns Neighbours sorted by distance.
 */
function physicsShatterNeighboursByDistance(
  sites: readonly THREE.Vector3[],
  cellIndex: number,
): PhysicsShatterNeighbour[] {
  const origin = sites[cellIndex] ?? new THREE.Vector3();
  const neighbours: PhysicsShatterNeighbour[] = [];
  sites.forEach((site, index) => {
    if (index !== cellIndex) neighbours.push({ site, distance: site.distanceTo(origin) });
  });
  return neighbours.sort((left, right) => left.distance - right.distance);
}

/**
 * Builds the outward bisector plane between a site and a neighbour; the site's
 * side is kept.
 *
 * @param site Cell site.
 * @param neighbour Neighbouring site.
 * @returns Plane halfway between them, facing the neighbour.
 */
function physicsShatterBisector(site: THREE.Vector3, neighbour: THREE.Vector3): SolidPlane {
  const normal = new THREE.Vector3().subVectors(neighbour, site).normalize();
  const middle = new THREE.Vector3().addVectors(site, neighbour).multiplyScalar(0.5);
  return new SolidPlane(normal, -normal.dot(middle));
}
