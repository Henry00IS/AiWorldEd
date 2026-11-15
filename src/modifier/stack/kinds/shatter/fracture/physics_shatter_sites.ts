import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { PhysicsShatterSettings } from './physics_shatter_types.js';
import { PhysicsShatterRandom } from './physics_shatter_random.js';
import { physicsShatterBrushBounds, physicsShatterBrushContains } from './physics_shatter_geometry.js';

/** Tries per wanted site before the sampler gives up on a crowded brush. */
const PHYSICS_SHATTER_SITE_ATTEMPTS = 40;

/** Closest two sites may lie, as a share of the local piece size. */
const PHYSICS_SHATTER_SITE_SPACING = 0.35;

/** How much finer pieces get right at the impact point at full Impact Detail. */
const PHYSICS_SHATTER_IMPACT_DENSITY = 6;

/** State of one site sampling run. */
interface PhysicsShatterSiteRun {
  brush: SolidBrush;
  settings: PhysicsShatterSettings;
  random: PhysicsShatterRandom;
  bounds: THREE.Box3;
  sites: THREE.Vector3[];
}

/**
 * Scatters Voronoi sites inside a brush. Sites keep a minimum spacing so no
 * sliver cells appear, and gather around the impact point by Impact Detail.
 *
 * @param brush Convex brush in the modifier frame.
 * @param wanted Number of sites to place.
 * @param settings Fracture settings.
 * @param stream Random stream, such as the input index.
 * @returns Sites in placement order.
 */
export function physicsShatterSites(
  brush: SolidBrush,
  wanted: number,
  settings: PhysicsShatterSettings,
  stream: number,
): THREE.Vector3[] {
  const random = new PhysicsShatterRandom(settings.seed, stream);
  const run: PhysicsShatterSiteRun = { brush, settings, random, bounds: physicsShatterBrushBounds(brush), sites: [] };
  const attempts = Math.max(1, wanted) * PHYSICS_SHATTER_SITE_ATTEMPTS;
  for (let attempt = 0; attempt < attempts && run.sites.length < wanted; attempt++) physicsShatterSiteTry(run);
  if (run.sites.length === 0) run.sites.push(run.bounds.getCenter(new THREE.Vector3()));
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
  const candidate = new THREE.Vector3(
    random.between(bounds.min.x, bounds.max.x),
    random.between(bounds.min.y, bounds.max.y),
    random.between(bounds.min.z, bounds.max.z),
  );
  const density = physicsShatterSiteDensity(candidate, run.settings);
  if (random.next() * physicsShatterSiteDensityPeak(run.settings) > density) return;
  if (!physicsShatterBrushContains(run.brush, candidate, 1e-4)) return;
  const spacing = (PHYSICS_SHATTER_SITE_SPACING * run.settings.crackSize) / Math.cbrt(density);
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
