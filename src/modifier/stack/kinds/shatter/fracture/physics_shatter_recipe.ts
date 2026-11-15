import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { PhysicsShatterAxis, PhysicsShatterSettings } from './physics_shatter_types.js';
import { physicsShatterBrushBounds, physicsShatterBrushVolume } from './physics_shatter_geometry.js';
import { physicsShatterGridSites } from './physics_shatter_grid.js';
import { physicsShatterPatternSpec } from './physics_shatter_patterns.js';
import { physicsShatterSites } from './physics_shatter_sites.js';
import {
  PHYSICS_SHATTER_METRIC_EUCLIDEAN,
  PhysicsShatterVoronoiPattern,
  physicsShatterMetricStretched,
} from './physics_shatter_voronoi.js';
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
 * How much larger radial shards or grid bits get on each try to fit the piece
 * allowance.
 */
const PHYSICS_SHATTER_FIT_GROWTH = 1.15;

/** Most tries to fit a radial or grid pattern into its piece allowance. */
const PHYSICS_SHATTER_FIT_TRIES = 24;

/** What the settings ask a cell pattern to be. */
export interface PhysicsShatterRecipe {
  /** Random cells, radial shards, or cells on a jittered grid. */
  pattern: 'cells' | 'radial' | 'grid';
  /** True when the cracks run straight through the thickness. */
  planar: boolean;
  /** Shape of radial shards. */
  radial: PhysicsShatterRadialShape;
  /** Lloyd rounds that even out random sites; 0 keeps them irregular. */
  relaxRounds: number;
  /** Cell length along the grain over its width; 1 for no grain. */
  grainStretch: number;
}

/**
 * Resolves material-applied settings into a cell pattern recipe from the
 * pattern's spec. Radial shards and grid bits are always 2D; random cells are
 * 3D unless 2D is asked for.
 *
 * @param settings Fracture settings after physicsShatterMaterialApply.
 * @returns Recipe.
 */
export function physicsShatterRecipeOf(settings: PhysicsShatterSettings): PhysicsShatterRecipe {
  const spec = physicsShatterPatternSpec(settings.mode);
  const pattern = spec.sites === 'grid' || spec.sites === 'radial' ? spec.sites : 'cells';
  const planar = pattern !== 'cells' || settings.cracks === '2d';
  const radial = spec.radial ?? { ...PHYSICS_SHATTER_RADIAL_GLASS, spokes: settings.radialSpokes };
  const grainStretch = Math.max(1, settings.grainStretch);
  return { pattern, planar, radial, relaxRounds: spec.relaxRounds, grainStretch };
}

/** A built cell pattern and whether the allowance made its pieces larger. */
export interface PhysicsShatterCellPatternBuild {
  pattern: PhysicsShatterVoronoiPattern;
  limited: boolean;
}

/**
 * Returns the grain direction of an input: a frame axis, or for 'auto' its
 * longest side.
 *
 * @param brush Input brush.
 * @param axis Grain axis setting.
 * @returns Unit direction.
 */
export function physicsShatterGrainOf(brush: SolidBrush, axis: PhysicsShatterAxis): THREE.Vector3 {
  if (axis !== 'auto') return new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0);
  const size = physicsShatterBrushBounds(brush).getSize(new THREE.Vector3());
  if (size.x >= size.y && size.x >= size.z) return new THREE.Vector3(1, 0, 0);
  return size.y >= size.z ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
}

/**
 * Builds the Voronoi pattern of one input: random cells in 3D or on the
 * mid-plane, stretched along a grain when asked, radial shards or grid bits,
 * which always lie on the mid-plane.
 *
 * @param brush Input brush.
 * @param settings Fracture settings after physicsShatterMaterialApply.
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
  if (recipe.pattern !== 'cells' && plane)
    return physicsShatterFittedPattern(brush, settings, sourceIndex, allowance, plane, recipe);
  const place = plane ? (site: THREE.Vector3) => physicsShatterOntoPlane(plane, site) : undefined;
  const grain = physicsShatterGrainOf(brush, settings.grainAxis);
  const across = plane ? Math.abs(grain.dot(plane.normal)) > 0.9 : false;
  const stretch = across ? 1 : recipe.grainStretch;
  const metric = stretch > 1 ? physicsShatterMetricStretched(grain, stretch) : PHYSICS_SHATTER_METRIC_EUCLIDEAN;
  const volume = physicsShatterBrushVolume(brush);
  const size = Math.max(1e-3, settings.crackSize);
  const cells = plane ? volume / Math.max(1e-6, plane.thickness) / (size * size) : volume / (size * size * size);
  const wanted = Math.round(cells / stretch);
  const count = Math.max(1, Math.min(allowance, wanted));
  const sites = physicsShatterSites(brush, count, settings, sourceIndex, plane);
  const pattern = new PhysicsShatterVoronoiPattern(brush, sites, metric, place);
  pattern.relax(recipe.relaxRounds);
  return { pattern, limited: wanted > allowance };
}

/**
 * Builds radial shards or grid bits, larger ones when they would not fit the
 * allowance.
 *
 * @param brush Input brush.
 * @param settings Fracture settings.
 * @param sourceIndex Input index.
 * @param allowance Most pieces.
 * @param plane Mid-plane.
 * @param recipe Recipe.
 * @returns Pattern and whether it was made larger.
 */
function physicsShatterFittedPattern(
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
  for (; tries < PHYSICS_SHATTER_FIT_TRIES; tries++, size *= PHYSICS_SHATTER_FIT_GROWTH) {
    const random = physicsShatterRadialRandom(settings.seed, sourceIndex);
    sites =
      recipe.pattern === 'grid'
        ? physicsShatterGridSites(brush, plane, size, random)
        : physicsShatterRadialSites(brush, plane, settings.impactPoint, size, recipe.radial, random);
    if (sites.length <= allowance) break;
  }
  if (sites.length === 0) sites = [plane.point.clone()];
  const place = (site: THREE.Vector3): THREE.Vector3 => physicsShatterOntoPlane(plane, site);
  const pattern = new PhysicsShatterVoronoiPattern(brush, sites, PHYSICS_SHATTER_METRIC_EUCLIDEAN, place);
  return { pattern, limited: tries > 0 };
}
