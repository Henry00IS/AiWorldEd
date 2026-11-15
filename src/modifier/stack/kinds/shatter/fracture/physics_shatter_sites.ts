import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { PhysicsShatterSettings } from './physics_shatter_types.js';
import { PhysicsShatterRandom } from './physics_shatter_random.js';
import { physicsShatterBrushBounds, physicsShatterBrushContains } from './physics_shatter_geometry.js';
import type { PhysicsShatterMidPlane } from './physics_shatter_plane.js';

/** Tries per wanted site before the sampler gives up on a crowded brush. */
const PHYSICS_SHATTER_SITE_ATTEMPTS = 40;

/** Closest two sites may lie, as a share of the local piece size. */
const PHYSICS_SHATTER_SITE_SPACING = 0.35;

/** How much finer pieces get right at the impact point at full Impact Detail. */
const PHYSICS_SHATTER_IMPACT_DENSITY = 6;

/**
 * Returns the extent of a brush in a mid-plane's u and v coordinates, as a box
 * whose x is u and y is v.
 *
 * @param brush Brush.
 * @param plane Mid-plane.
 * @returns Box in plane coordinates; z is zero.
 */
export function physicsShatterPlaneBounds(brush: SolidBrush, plane: PhysicsShatterMidPlane): THREE.Box3 {
  const box = new THREE.Box3();
  const offset = new THREE.Vector3();
  for (const vertex of brush.vertices) {
    offset.subVectors(vertex, plane.point);
    box.expandByPoint(new THREE.Vector3(offset.dot(plane.u), offset.dot(plane.v), 0));
  }
  return box;
}

/**
 * Draws a uniform point on a mid-plane inside plane-coordinate bounds.
 *
 * @param plane Mid-plane.
 * @param bounds Bounds in plane coordinates.
 * @param random Random stream.
 * @returns Point on the plane.
 */
function physicsShatterPlaneSample(
  plane: PhysicsShatterMidPlane,
  bounds: THREE.Box3,
  random: PhysicsShatterRandom,
): THREE.Vector3 {
  const u = random.between(bounds.min.x, bounds.max.x);
  const v = random.between(bounds.min.y, bounds.max.y);
  return plane.point.clone().addScaledVector(plane.u, u).addScaledVector(plane.v, v);
}

/** State of one site sampling run. */
interface PhysicsShatterSiteRun {
  brush: SolidBrush;
  settings: PhysicsShatterSettings;
  random: PhysicsShatterRandom;
  bounds: THREE.Box3;
  sites: THREE.Vector3[];
  plane: PhysicsShatterMidPlane | null;
}

/**
 * Scatters Voronoi sites inside a brush. Sites keep a minimum spacing so no
 * sliver cells appear, and gather around the impact point by Impact Detail.
 * With a mid-plane every site lies on it, so all cracks run straight through
 * the thickness and the cells are prisms.
 *
 * @param brush Convex brush in the modifier frame.
 * @param wanted Number of sites to place.
 * @param settings Fracture settings.
 * @param stream Random stream, such as the input index.
 * @param plane Mid-plane for 2D cracks, or null for 3D.
 * @returns Sites in placement order.
 */
export function physicsShatterSites(
  brush: SolidBrush,
  wanted: number,
  settings: PhysicsShatterSettings,
  stream: number,
  plane: PhysicsShatterMidPlane | null = null,
): THREE.Vector3[] {
  const random = new PhysicsShatterRandom(settings.seed, stream);
  const bounds = plane ? physicsShatterPlaneBounds(brush, plane) : physicsShatterBrushBounds(brush);
  const run: PhysicsShatterSiteRun = { brush, settings, random, bounds, sites: [], plane };
  const attempts = Math.max(1, wanted) * PHYSICS_SHATTER_SITE_ATTEMPTS;
  for (let attempt = 0; attempt < attempts && run.sites.length < wanted; attempt++) physicsShatterSiteTry(run);
  if (run.sites.length === 0) run.sites.push(plane ? plane.point.clone() : run.bounds.getCenter(new THREE.Vector3()));
  return run.sites;
}

/**
 * Draws one candidate site and keeps it when it is inside, wanted by the
 * density, and far enough from the sites already placed.
 *
 * @param run Sampling state.
 */
function physicsShatterSiteTry(run: PhysicsShatterSiteRun): void {
  const { bounds, random } = run;
  const candidate = run.plane
    ? physicsShatterPlaneSample(run.plane, bounds, random)
    : new THREE.Vector3(
        random.between(bounds.min.x, bounds.max.x),
        random.between(bounds.min.y, bounds.max.y),
        random.between(bounds.min.z, bounds.max.z),
      );
  const density = physicsShatterSiteDensity(candidate, run.settings);
  if (random.next() * physicsShatterSiteDensityPeak(run.settings) > density) return;
  if (!physicsShatterBrushContains(run.brush, candidate, 1e-4)) return;
  const spread = run.plane ? Math.sqrt(density) : Math.cbrt(density);
  const spacing = (PHYSICS_SHATTER_SITE_SPACING * run.settings.crackSize) / spread;
  if (run.sites.some((site) => site.distanceToSquared(candidate) < spacing * spacing)) return;
  run.sites.push(candidate);
}

/**
 * Returns the relative site density at a point: one far from the impact, up to
 * the impact density right at it at full Impact Detail.
 *
 * @param point Candidate point.
 * @param settings Fracture settings.
 * @returns Density from one to PHYSICS_SHATTER_IMPACT_DENSITY.
 */
export function physicsShatterSiteDensity(point: THREE.Vector3, settings: PhysicsShatterSettings): number {
  const radius = Math.max(1e-3, settings.impactRadius);
  const falloff = Math.exp(-point.distanceToSquared(settings.impactPoint) / (radius * radius));
  return 1 + settings.impactDetail * (PHYSICS_SHATTER_IMPACT_DENSITY - 1) * falloff;
}

/**
 * Returns the highest site density the settings reach, at the impact point.
 *
 * @param settings Fracture settings.
 * @returns Peak density, at least one.
 */
function physicsShatterSiteDensityPeak(settings: PhysicsShatterSettings): number {
  return 1 + settings.impactDetail * (PHYSICS_SHATTER_IMPACT_DENSITY - 1);
}
