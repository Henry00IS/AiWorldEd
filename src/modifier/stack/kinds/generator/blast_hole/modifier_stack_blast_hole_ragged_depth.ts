import * as THREE from 'three';
import { modifierStackRandomValue } from '@/modifier/stack/kinds/array/modifier_stack_array_random.js';

/** Settings of the Jagged style outline. */
export interface BlastHoleRaggedSettings {
  /** Random seed. */
  seed: number;
  /** 0 is a circle (or stadium), 1 a rectangle. */
  shape: number;
  /** Size of the big broken chunks along the edge, in metres. */
  jagSize: number;
  /** How deep the jags cut in, 0 to 1. */
  roughness: number;
  /** Number of deep bites where wall chunks stay in the hole. */
  bites: number;
  /** Finer layers of teeth and chips on top of the chunks, 0 to 3. */
  detail: number;
}

/** Smallest Jag Size, in metres. */
export const BLAST_HOLE_RAGGED_MIN_JAG = 0.05;

/** Largest Jag Size, in metres. */
export const BLAST_HOLE_RAGGED_MAX_JAG = 3;

/** Most bites. */
export const BLAST_HOLE_RAGGED_MAX_BITES = 12;

/** Most detail layers. */
export const BLAST_HOLE_RAGGED_MAX_DETAIL = 3;

/** Shortest wavelength a detail layer may have, so chips stay buildable. */
const BLAST_HOLE_RAGGED_MIN_WAVE = 0.03;

/** Wavelength and depth of each layer, as multiples of the Jag Size. */
const BLAST_HOLE_RAGGED_LAYERS: readonly { wave: number; depth: number; zigzag: boolean }[] = [
  { wave: 2.2, depth: 1, zigzag: false },
  { wave: 0.7, depth: 0.5, zigzag: true },
  { wave: 0.28, depth: 0.22, zigzag: true },
  { wave: 0.12, depth: 0.09, zigzag: true },
];

/**
 * Bite profile: positions across the bite and depth share at each, with jitter
 * ranges.
 */
const BLAST_HOLE_RAGGED_BITE_KNOTS: readonly { at: number; depth: number; spread: number }[] = [
  { at: -0.5, depth: 0, spread: 0 },
  { at: -0.3, depth: 0.45, spread: 0.35 },
  { at: -0.08, depth: 0.9, spread: 0.1 },
  { at: 0.12, depth: 0.85, spread: 0.15 },
  { at: 0.32, depth: 0.35, spread: 0.35 },
  { at: 0.5, depth: 0, spread: 0 },
];

/** Salt of the Jagged random stream. */
const BLAST_HOLE_RAGGED_SALT = 0x7a66ed;

/** One periodic, piecewise linear depth layer along the outline. */
export interface BlastHoleRaggedLayer {
  /** Arc lengths of the knots, increasing, within one lap. */
  knots: number[];
  /** Depth at each knot. */
  depths: number[];
  /** True for a bite, false for a noise layer. */
  bite?: boolean;
}

/**
 * Returns a deterministic value in [0, 1) for one knot and channel.
 *
 * @param seed Seed.
 * @param index Knot index.
 * @param channel Channel.
 * @returns Uniform value.
 */
function blastHoleRaggedRandom(seed: number, index: number, channel: number): number {
  return modifierStackRandomValue(seed, index, BLAST_HOLE_RAGGED_SALT, channel);
}

/**
 * Returns the depth scale of every layer: 0.15 at roughness 0 up to 1.
 *
 * @param roughness Roughness.
 * @returns Depth scale.
 */
function blastHoleRaggedDepthScale(roughness: number): number {
  return 0.2 + THREE.MathUtils.clamp(roughness, 0, 1);
}

/**
 * Returns the depth share of one knot: uniform for chunks; for teeth and chips
 * every other knot is deep, so the edge zigzags into sharp teeth.
 *
 * @param random Uniform value.
 * @param index Knot index.
 * @param zigzag True for a zigzag layer.
 * @returns Share, 0 to 1.
 */
function blastHoleRaggedKnotShare(random: number, index: number, zigzag: boolean): number {
  if (!zigzag) return random;
  return index % 2 === 1 ? 0.55 + 0.45 * random : 0.4 * random;
}

/**
 * Sorts knots into one lap, keeping each knot with its depth.
 *
 * @param pairs Knots and depths, positions in any lap.
 * @param perimeter Lap length.
 * @returns Layer.
 */
function blastHoleRaggedLayerSorted(pairs: { at: number; depth: number }[], perimeter: number): BlastHoleRaggedLayer {
  const wrapped = pairs
    .map((pair) => ({ at: THREE.MathUtils.euclideanModulo(pair.at, perimeter), depth: pair.depth }))
    .sort((a, b) => a.at - b.at);
  return { knots: wrapped.map((pair) => pair.at), depths: wrapped.map((pair) => pair.depth) };
}

/**
 * Builds one noise layer: knots spaced evenly by a whole number per lap, each
 * nudged along the edge and given a random depth. The spacing is in metres, so
 * long edges get more knots, never wider ones.
 *
 * @param settings Settings.
 * @param layer Layer index.
 * @param perimeter Lap length.
 * @returns Layer.
 */
function blastHoleRaggedNoiseLayer(
  settings: BlastHoleRaggedSettings,
  layer: number,
  perimeter: number,
): BlastHoleRaggedLayer {
  const shape = BLAST_HOLE_RAGGED_LAYERS[layer]!;
  const even = shape.zigzag ? 2 : 1;
  const count = Math.max(4, even * Math.round(perimeter / (shape.wave * settings.jagSize * even)));
  const spacing = perimeter / count;
  const depth = shape.depth * settings.jagSize * blastHoleRaggedDepthScale(settings.roughness);
  const phase = blastHoleRaggedRandom(settings.seed, 0, layer * 16) * spacing;
  const pairs = Array.from({ length: count }, (_, index) => ({
    at: phase + (index + 0.7 * (blastHoleRaggedRandom(settings.seed, index, layer * 16 + 1) - 0.5)) * spacing,
    depth:
      depth *
      blastHoleRaggedKnotShare(blastHoleRaggedRandom(settings.seed, index, layer * 16 + 2), index, shape.zigzag),
  }));
  return blastHoleRaggedLayerSorted(pairs, perimeter);
}

/**
 * Returns the noise layers the detail asks for, skipping any whose knots would
 * be closer than the shortest wavelength.
 *
 * @param settings Settings.
 * @param perimeter Lap length.
 * @returns Layers, chunks first.
 */
function blastHoleRaggedNoiseLayers(settings: BlastHoleRaggedSettings, perimeter: number): BlastHoleRaggedLayer[] {
  const detail = Math.round(THREE.MathUtils.clamp(settings.detail, 0, BLAST_HOLE_RAGGED_MAX_DETAIL));
  const layers: BlastHoleRaggedLayer[] = [];
  for (let layer = 0; layer <= detail; layer++) {
    const wave = BLAST_HOLE_RAGGED_LAYERS[layer]!.wave * settings.jagSize;
    if (layer === 0 || wave >= BLAST_HOLE_RAGGED_MIN_WAVE)
      layers.push(blastHoleRaggedNoiseLayer(settings, layer, perimeter));
  }
  return layers;
}

/**
 * Builds one bite: a deep, ragged notch a few chunks wide, zero outside it.
 *
 * @param settings Settings.
 * @param bite Bite index.
 * @param count Number of bites.
 * @param perimeter Lap length.
 * @returns Layer.
 */
function blastHoleRaggedBiteLayer(
  settings: BlastHoleRaggedSettings,
  bite: number,
  count: number,
  perimeter: number,
): BlastHoleRaggedLayer {
  const random = (channel: number) => blastHoleRaggedRandom(settings.seed, bite, 200 + channel);
  const slot = perimeter / count;
  const center = (bite + 0.5 + 0.5 * (random(0) - 0.5)) * slot + blastHoleRaggedRandom(settings.seed, 0, 199) * slot;
  const width = Math.min(settings.jagSize * (1.6 + 1.6 * random(1)), slot * 0.8);
  const depth = blastHoleRaggedBiteDepth(settings, random(2));
  const pairs = BLAST_HOLE_RAGGED_BITE_KNOTS.map((knot, index) => ({
    at: center + width * (knot.at + 0.12 * knot.spread * (random(3 + index) - 0.5)),
    depth: depth * Math.max(0, knot.depth + knot.spread * (random(10 + index) - 0.5)),
  }));
  return blastHoleRaggedLayerSorted(pairs, perimeter);
}

/**
 * Returns how deep a bite cuts in.
 *
 * @param settings Settings.
 * @param random Uniform value for this bite.
 * @returns Depth in metres.
 */
function blastHoleRaggedBiteDepth(settings: BlastHoleRaggedSettings, random: number): number {
  return settings.jagSize * (1 + 1.5 * random) * (0.4 + 0.8 * THREE.MathUtils.clamp(settings.roughness, 0, 1));
}

/**
 * Builds every depth layer of a Jagged outline: the noise layers and bites.
 *
 * @param settings Settings.
 * @param perimeter Lap length.
 * @returns Layers.
 */
export function blastHoleRaggedLayers(settings: BlastHoleRaggedSettings, perimeter: number): BlastHoleRaggedLayer[] {
  const bites = Math.round(THREE.MathUtils.clamp(settings.bites, 0, BLAST_HOLE_RAGGED_MAX_BITES));
  const layers = blastHoleRaggedNoiseLayers(settings, perimeter);
  for (let bite = 0; bite < bites; bite++)
    layers.push({ ...blastHoleRaggedBiteLayer(settings, bite, bites, perimeter), bite: true });
  return layers;
}

/**
 * Returns the depth of a layer at an arc length, linear between knots and
 * wrapping around the lap.
 *
 * @param layer Layer.
 * @param distance Arc length within one lap.
 * @param perimeter Lap length.
 * @returns Depth.
 */
export function blastHoleRaggedLayerDepth(layer: BlastHoleRaggedLayer, distance: number, perimeter: number): number {
  const { knots, depths } = layer;
  const count = knots.length;
  let next = knots.findIndex((knot) => knot > distance);
  if (next < 0) next = count;
  const before = (next + count - 1) % count;
  const after = next % count;
  const start = next === 0 ? knots[before]! - perimeter : knots[before]!;
  const end = next === count ? knots[after]! + perimeter : knots[after]!;
  const share = end > start ? (distance - start) / (end - start) : 0;
  return THREE.MathUtils.lerp(depths[before]!, depths[after]!, share);
}
