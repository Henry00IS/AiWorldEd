import type * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { PhysicsShatterSettings } from './physics_shatter_types.js';
import { physicsShatterBrushVolume } from './physics_shatter_geometry.js';
import { physicsShatterSites } from './physics_shatter_sites.js';
import { PHYSICS_SHATTER_METRIC_EUCLIDEAN, PhysicsShatterVoronoiPattern } from './physics_shatter_voronoi.js';
import {
  physicsShatterMidPlane,
  physicsShatterOntoPlane,
  type PhysicsShatterMidPlane,
} from './physics_shatter_plane.js';
import {
  PHYSICS_SHATTER_RADIAL_GLASS,
  physicsShatterRadialRandom,
  physicsShatterRadialSites,
  type PhysicsShatterRadialShape,
} from './physics_shatter_radial.js';

/**
 * Lloyd rounds that even out random Voronoi sites before carving, so few cells
 * have short edges.
 */
const PHYSICS_SHATTER_RELAX_ROUNDS = 1;

/** How much larger radial shards get on each try to fit the piece allowance. */
const PHYSICS_SHATTER_RADIAL_GROWTH = 1.15;

/** Most tries to fit a radial pattern into its piece allowance. */
const PHYSICS_SHATTER_RADIAL_TRIES = 24;

/** What the settings ask a cell pattern to be. */
export interface PhysicsShatterRecipe {
  /** Random cells or radial shards. */
  pattern: 'cells' | 'radial';
  /** True when the cracks run straight through the thickness. */
  planar: boolean;
  /** Shape of radial shards. */
  radial: PhysicsShatterRadialShape;
}

/**
 * Resolves the settings into a cell pattern recipe. Radial shards are always
 * 2D; random cells are 3D unless 2D is asked for.
 *
 * @param settings Fracture settings.
 * @returns Recipe.
 */
export function physicsShatterRecipeOf(settings: PhysicsShatterSettings): PhysicsShatterRecipe {
  const pattern = settings.mode === 'radial' ? 'radial' : 'cells';
  const planar = pattern === 'radial' || settings.cracks === '2d';
  return { pattern, planar, radial: { ...PHYSICS_SHATTER_RADIAL_GLASS, spokes: settings.radialSpokes } };
}

/** A built cell pattern and whether the allowance made its pieces larger. */
export interface PhysicsShatterCellPatternBuild {
  pattern: PhysicsShatterVoronoiPattern;
  limited: boolean;
}

/**
 * Builds the Voronoi pattern of one input: random cells in 3D or on the
 * mid-plane, or radial shards, which always lie on the mid-plane.
 *
 * @param brush Input brush.
 * @param settings Fracture settings.
 * @param sourceIndex Input index, the random stream.
 * @param allowance Most pieces of this input.
 * @returns Pattern and whether the allowance limited it.
 */
export function physicsShatterCellPattern(
  brush: SolidBrush,
  settings: PhysicsShatterSettings,
  sourceIndex: number,
  allowance: number,
): PhysicsShatterCellPatternBuild {
  const recipe = physicsShatterRecipeOf(settings);
  const plane = recipe.planar ? physicsShatterMidPlane(brush, settings.thicknessAxis) : null;
  if (recipe.pattern === 'radial' && plane)
    return physicsShatterRadialPattern(brush, settings, sourceIndex, allowance, plane, recipe);
  const place = plane ? (site: THREE.Vector3) => physicsShatterOntoPlane(plane, site) : undefined;
  const volume = physicsShatterBrushVolume(brush);
  const size = Math.max(1e-3, settings.crackSize);
  const wanted = Math.round(
    plane ? volume / Math.max(1e-6, plane.thickness) / (size * size) : volume / (size * size * size),
  );
  const count = Math.max(1, Math.min(allowance, wanted));
  const sites = physicsShatterSites(brush, count, settings, sourceIndex, plane);
  const pattern = new PhysicsShatterVoronoiPattern(brush, sites, PHYSICS_SHATTER_METRIC_EUCLIDEAN, place);
  pattern.relax(PHYSICS_SHATTER_RELAX_ROUNDS);
  return { pattern, limited: wanted > allowance };
}

/**
 * Builds radial shards, larger ones when they would not fit the allowance.
 *
 * @param brush Input brush.
 * @param settings Fracture settings.
 * @param sourceIndex Input index.
 * @param allowance Most pieces.
 * @param plane Mid-plane.
 * @param recipe Recipe.
 * @returns Pattern and whether it was made larger.
 */
function physicsShatterRadialPattern(
  brush: SolidBrush,
  settings: PhysicsShatterSettings,
  sourceIndex: number,
  allowance: number,
  plane: PhysicsShatterMidPlane,
  recipe: PhysicsShatterRecipe,
): PhysicsShatterCellPatternBuild {
  let size = Math.max(1e-3, settings.crackSize);
  let sites: THREE.Vector3[] = [];
  let tries = 0;
  for (; tries < PHYSICS_SHATTER_RADIAL_TRIES; tries++, size *= PHYSICS_SHATTER_RADIAL_GROWTH) {
    const random = physicsShatterRadialRandom(settings.seed, sourceIndex);
    sites = physicsShatterRadialSites(brush, plane, settings.impactPoint, size, recipe.radial, random);
    if (sites.length <= allowance) break;
  }
  if (sites.length === 0) sites = [plane.point.clone()];
  const place = (site: THREE.Vector3): THREE.Vector3 => physicsShatterOntoPlane(plane, site);
  const pattern = new PhysicsShatterVoronoiPattern(brush, sites, PHYSICS_SHATTER_METRIC_EUCLIDEAN, place);
  return { pattern, limited: tries > 0 };
}
