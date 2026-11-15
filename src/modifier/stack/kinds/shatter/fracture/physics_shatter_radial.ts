import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { PhysicsShatterRandom } from './physics_shatter_random.js';
import { physicsShatterBrushContains } from './physics_shatter_geometry.js';
import { physicsShatterOntoPlane, type PhysicsShatterMidPlane } from './physics_shatter_plane.js';

/** Shape of a radial crack pattern, all lengths as shares of the crack size. */
export interface PhysicsShatterRadialShape {
  /** Radial cracks leaving the impact point. */
  spokes: number;
  /**
   * How much each ring of shards is farther out than the one before, at least
   * 1.
   */
  growth: number;
  /** Widest a shard may get across, before a new radial crack splits it. */
  maxWidth: number;
  /** Longest a shard may get along its spoke. */
  maxLength: number;
  /** Radius of the first ring around the crushed centre. */
  firstRing: number;
}

/** Shards of annealed glass: many spokes, rings ever farther apart. */
export const PHYSICS_SHATTER_RADIAL_GLASS: PhysicsShatterRadialShape = {
  spokes: 10,
  growth: 1.75,
  maxWidth: 1.1,
  maxLength: 6,
  firstRing: 0.45,
};

/** Random stream offset of the radial pattern, apart from the site sampler. */
const PHYSICS_SHATTER_RADIAL_STREAM = 0x2d1;

/** Share of a ring's spacing a site may move along its spoke. */
const PHYSICS_SHATTER_RADIAL_JITTER = 0.1;

/** Share of a spoke's angular gap a whole spoke may turn. */
const PHYSICS_SHATTER_SPOKE_JITTER = 0.35;

/** Share of a spoke's angular gap one site may turn off its spoke. */
const PHYSICS_SHATTER_SITE_TURN = 0.08;

/**
 * Places the Voronoi sites of radial shards on a mid-plane: one at the impact
 * point, then rings of sites on shared spokes. Neighbours on a ring meet along
 * radial cracks and neighbours on a spoke along concentric ones, so the cells
 * are shards that point away from the impact. Rings get farther apart outwards,
 * so shards grow longer; when a ring gets too wide a spoke is added between
 * two, so they stay narrow.
 *
 * @param brush Convex input brush.
 * @param plane Mid-plane the sites lie on.
 * @param impact Impact point; projected onto the plane.
 * @param crackSize Typical shard width in metres.
 * @param shape Pattern shape.
 * @param random Seeded random values.
 * @returns Sites inside the brush.
 */
export function physicsShatterRadialSites(
  brush: SolidBrush,
  plane: PhysicsShatterMidPlane,
  impact: THREE.Vector3,
  crackSize: number,
  shape: PhysicsShatterRadialShape,
  random: PhysicsShatterRandom,
): THREE.Vector3[] {
  const centre = physicsShatterOntoPlane(plane, impact);
  const reach = brush.vertices.reduce(
    (far, vertex) => Math.max(far, physicsShatterOntoPlane(plane, vertex).distanceTo(centre)),
    0,
  );
  const sites: THREE.Vector3[] = [];
  const keep = (site: THREE.Vector3): void => {
    if (physicsShatterBrushContains(brush, site, 1e-4)) sites.push(site);
  };
  keep(centre.clone());
  const angles = physicsShatterSpokeAngles(Math.max(3, Math.round(shape.spokes)), random);
  let radius = shape.firstRing * crackSize;
  for (let ring = 0; radius < reach + crackSize && ring < 256; ring++) {
    const step = Math.min(shape.maxLength * crackSize, Math.max(0.6 * crackSize, radius * (shape.growth - 1)));
    while (angles.length < 4096 && (2 * Math.PI * radius) / angles.length > shape.maxWidth * crackSize)
      physicsShatterSplitSpokes(angles, random);
    const gap = (2 * Math.PI) / angles.length;
    for (const angle of angles) {
      const turned = angle + random.between(-1, 1) * PHYSICS_SHATTER_SITE_TURN * gap;
      const distance = radius + random.between(-1, 1) * PHYSICS_SHATTER_RADIAL_JITTER * step;
      const site = centre.clone();
      site.addScaledVector(plane.u, Math.cos(turned) * distance).addScaledVector(plane.v, Math.sin(turned) * distance);
      keep(site);
    }
    radius += step;
  }
  return sites;
}

/**
 * Returns evenly spread spoke angles, each turned a little.
 *
 * @param count Number of spokes.
 * @param random Random values.
 * @returns Angles in radians, ascending.
 */
function physicsShatterSpokeAngles(count: number, random: PhysicsShatterRandom): number[] {
  const gap = (2 * Math.PI) / count;
  const start = random.between(0, gap);
  return Array.from(
    { length: count },
    (_, index) => start + gap * (index + random.between(-1, 1) * PHYSICS_SHATTER_SPOKE_JITTER),
  );
}

/**
 * Adds a spoke between every two neighbouring ones, a little off the middle.
 *
 * @param angles Spoke angles, ascending; extended in place.
 * @param random Random values.
 */
function physicsShatterSplitSpokes(angles: number[], random: PhysicsShatterRandom): void {
  const split: number[] = [];
  angles.forEach((angle, index) => {
    const next = index + 1 < angles.length ? (angles[index + 1] ?? angle) : (angles[0] ?? angle) + 2 * Math.PI;
    split.push(angle, angle + (next - angle) * (0.5 + random.between(-0.15, 0.15)));
  });
  angles.splice(0, angles.length, ...split);
}

/**
 * Makes the radial random stream of one input.
 *
 * @param seed Fracture seed.
 * @param stream Input index.
 * @returns Random values.
 */
export function physicsShatterRadialRandom(seed: number, stream: number): PhysicsShatterRandom {
  return new PhysicsShatterRandom(seed, stream + PHYSICS_SHATTER_RADIAL_STREAM);
}
