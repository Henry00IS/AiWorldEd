import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { physicsShatterBrushContains } from './physics_shatter_geometry.js';
import type { PhysicsShatterMidPlane } from './physics_shatter_plane.js';
import type { PhysicsShatterRandom } from './physics_shatter_random.js';
import { physicsShatterPlaneBounds } from './physics_shatter_sites.js';

/** Share of the spacing a grid site may move each way. */
const PHYSICS_SHATTER_GRID_JITTER = 0.4;

/**
 * Lays sites on a jittered square grid on a mid-plane, so the cells come out as
 * small, even, roughly square bits: tempered glass dice.
 *
 * @param brush Convex input brush.
 * @param plane Mid-plane the sites lie on.
 * @param spacing Grid spacing in metres.
 * @param random Seeded random values.
 * @returns Sites inside the brush, row by row.
 */
export function physicsShatterGridSites(
  brush: SolidBrush,
  plane: PhysicsShatterMidPlane,
  spacing: number,
  random: PhysicsShatterRandom,
): THREE.Vector3[] {
  const bounds = physicsShatterPlaneBounds(brush, plane);
  const step = Math.max(1e-3, spacing);
  const start = new THREE.Vector2(bounds.min.x + random.between(0, step), bounds.min.y + random.between(0, step));
  const sites: THREE.Vector3[] = [];
  for (let v = start.y - step; v <= bounds.max.y + step; v += step)
    for (let u = start.x - step; u <= bounds.max.x + step; u += step) {
      const jitterU = random.between(-1, 1) * PHYSICS_SHATTER_GRID_JITTER * step;
      const jitterV = random.between(-1, 1) * PHYSICS_SHATTER_GRID_JITTER * step;
      const site = plane.point
        .clone()
        .addScaledVector(plane.u, u + jitterU)
        .addScaledVector(plane.v, v + jitterV);
      if (physicsShatterBrushContains(brush, site, 1e-4)) sites.push(site);
    }
  return sites;
}
