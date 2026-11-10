import * as THREE from 'three';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackNumber } from '@/modifier/stack/modifier_stack_fields.js';
import type { ModifierStackStairsSlabFlight } from './modifier_stack_stairs_slab.js';

/** Default height of the vertical nose front, in metres. */
const MODIFIER_STACK_STAIRS_NOSE_HEIGHT = 0.025;

/** Default depth of the chamfer under the nose, in metres. */
const MODIFIER_STACK_STAIRS_NOSE_BEVEL = 0.025;

/** Distance under which two profile points count as one. */
const MODIFIER_STACK_STAIRS_POINT_EPSILON = 1e-7;

/** Largest nosing as a share of one step's run. */
const MODIFIER_STACK_STAIRS_NOSING_MAX_RUN = 0.5;

/** Measurements of the nosing of every step, already clamped to the flight. */
export interface ModifierStackStairsNosing {
  /** How far the nose overhangs the recessed riser; 0 when off. */
  depth: number;
  /** Height of the vertical nose front. */
  height: number;
  /** Drop of the chamfer from the nose front back into the riser. */
  bevel: number;
  /** Leg of the 45° chamfer on the top front edge of the nose. */
  edge: number;
}

/**
 * Returns whether the steps have a nosing.
 *
 * @param parameters Normalized parameters.
 * @returns True when the nosing depth is above zero.
 */
function modifierStackStairsNosingOn(parameters: Record<string, unknown>): boolean {
  return Number(parameters['nosing']) > 0;
}

/** Nosing fields: the overhang, then the nose height and the bevel it reveals. */
export const MODIFIER_STACK_STAIRS_NOSING_FIELDS: readonly ModifierStackField[] = [
  {
    key: 'nosing',
    label: 'Nosing',
    type: 'number',
    default: 0,
    min: 0,
    max: 10,
    step: 0.0125,
    hint: 'How far each tread overhangs its recessed riser, in metres. 0 keeps plain steps.',
  },
  {
    key: 'noseHeight',
    label: 'Nose Height',
    type: 'number',
    default: MODIFIER_STACK_STAIRS_NOSE_HEIGHT,
    min: 0,
    max: 10,
    step: 0.0125,
    visible: modifierStackStairsNosingOn,
    hint: 'Height of the vertical front edge of each tread, in metres.',
  },
  {
    key: 'noseBevel',
    label: 'Nose Bevel',
    type: 'number',
    default: MODIFIER_STACK_STAIRS_NOSE_BEVEL,
    min: 0,
    max: 10,
    step: 0.0125,
    visible: modifierStackStairsNosingOn,
    hint: 'Drop of the chamfer under the nose back into the riser, in metres. 0 gives a square nose; the full step height rakes the whole riser.',
  },
  {
    key: 'noseEdge',
    label: 'Edge Chamfer',
    type: 'number',
    default: 0,
    min: 0,
    max: 10,
    step: 0.005,
    visible: modifierStackStairsNosingOn,
    hint: 'Size of a 45° chamfer on the top front edge of each tread, in metres. Stays within the Nose Height.',
  },
];

/**
 * Leaves the nosing parameters out while they hold their defaults, so files
 * that never used them stay unchanged.
 *
 * @param parameters Normalized parameters, modified in place.
 * @returns The same parameters.
 */
export function modifierStackStairsNosingOmitDefaults(parameters: Record<string, unknown>): Record<string, unknown> {
  for (const field of MODIFIER_STACK_STAIRS_NOSING_FIELDS)
    if (parameters[field.key] === field.default) delete parameters[field.key];
  return parameters;
}

/**
 * Measures the nosing. The overhang stays within half a run and the nose, bevel
 * included, never reaches below the tread of the step beneath, nor below a
 * floating tread.
 *
 * @param parameters Normalized parameters.
 * @param flight Flight measurements.
 * @param thickness Depth of the tread the nose hangs from.
 * @returns Clamped nosing; depth 0 when off.
 */
export function modifierStackStairsNosingOf(
  parameters: Record<string, unknown>,
  flight: ModifierStackStairsSlabFlight,
  thickness: number,
): ModifierStackStairsNosing {
  const wanted = modifierStackNumber(parameters['nosing'], 0, 0, 10);
  const depth = Math.min(wanted, flight.run * MODIFIER_STACK_STAIRS_NOSING_MAX_RUN);
  const limit = Math.min(flight.rise, thickness);
  const height = Math.min(
    modifierStackNumber(parameters['noseHeight'], MODIFIER_STACK_STAIRS_NOSE_HEIGHT, 0, 10),
    limit,
  );
  const bevel = Math.min(
    modifierStackNumber(parameters['noseBevel'], MODIFIER_STACK_STAIRS_NOSE_BEVEL, 0, 10),
    limit - height,
  );
  const edge = Math.min(modifierStackNumber(parameters['noseEdge'], 0, 0, 10), height, depth);
  return { depth, height, bevel, edge };
}

/**
 * Returns the convex side profile of the nose of one step, as (run distance,
 * height) points: the vertical front on the step line, then the chamfer back
 * down into the riser, which sits one nosing depth behind, and an optional 45°
 * chamfer on the top front edge. Points that coincide are merged.
 *
 * @param index Step index from the bottom.
 * @param flight Flight measurements.
 * @param nosing Clamped nosing.
 * @param floor Floor height.
 * @returns Convex polygon, counter-clockwise; empty when the nose is flat.
 */
export function modifierStackStairsNoseProfile(
  index: number,
  flight: ModifierStackStairsSlabFlight,
  nosing: ModifierStackStairsNosing,
  floor: number,
): THREE.Vector2[] {
  if (nosing.depth <= 0 || nosing.height + nosing.bevel <= 0) return [];
  const front = index * flight.run;
  const back = front + nosing.depth;
  const top = floor + (index + 1) * flight.rise;
  const profile = [
    new THREE.Vector2(front, top - nosing.height),
    new THREE.Vector2(back, top - nosing.height - nosing.bevel),
    new THREE.Vector2(back, top),
    new THREE.Vector2(front + nosing.edge, top),
    new THREE.Vector2(front, top - nosing.edge),
  ];
  return modifierStackStairsDistinctPoints(profile);
}

/**
 * Drops points of a closed polygon that coincide with the point before them.
 *
 * @param polygon Closed polygon.
 * @returns Polygon without repeated points.
 */
function modifierStackStairsDistinctPoints(polygon: readonly THREE.Vector2[]): THREE.Vector2[] {
  return polygon.filter((point, index) => {
    const previous = polygon[(index + polygon.length - 1) % polygon.length];
    return previous === undefined || point.distanceTo(previous) > MODIFIER_STACK_STAIRS_POINT_EPSILON;
  });
}
