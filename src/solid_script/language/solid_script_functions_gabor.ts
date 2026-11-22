import { solidScriptNoiseWord } from './solid_script_functions_noise.js';
import { solidScriptExtraNumber, solidScriptExtraSeeded } from './solid_script_functions_extra.js';
import { solidScriptMemberRound } from './solid_script_members.js';
import { solidScriptValueNumbers, type SolidScriptValue } from './solid_script_value.js';

/** Bumps scattered in each unit cell. */
const SOLID_SCRIPT_GABOR_BUMPS = 8;

/** Six spreads of the summed bumps, which brings almost every Value into 0 to 1. */
const SOLID_SCRIPT_GABOR_RANGE = 6 * Math.sqrt(SOLID_SCRIPT_GABOR_BUMPS * 0.5 * (1 / (4 * Math.SQRT2)));

/** What Gabor gives. */
const SOLID_SCRIPT_GABOR_OUTPUTS = ['Value', 'Phase', 'Intensity'] as const;

/** Usage shown in Gabor errors. */
const SOLID_SCRIPT_GABOR_USAGE = 'Gabor(position, scale, frequency, anisotropy, orientation, output)';

/** Settings shared by every bump. */
interface SolidScriptGaborWave {
  /** Waves per unit across each bump. */
  frequency: number;
  /** 0 for every bump along Orientation, up to 1 for every way at random. */
  isotropy: number;
  /** Way the waves run, of length 1. */
  orientation: readonly number[];
}

/**
 * Gives a random number from 0 to 1 for one draw of one bump in one cell.
 *
 * @param cell Whole-number cell.
 * @param draw Draw number.
 * @returns Number.
 */
function solidScriptGaborRandom(cell: readonly number[], draw: number): number {
  const [x = 0, y = 0, z = 0] = cell;
  return solidScriptExtraSeeded(
    (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791) ^ Math.imul(draw, 2654435761)) >>> 0,
  );
}

/**
 * Turns the wave of one bump away from Orientation by a random amount, more as
 * isotropy grows.
 *
 * @param wave Wave settings.
 * @param cell Cell.
 * @param bump Bump number.
 * @returns Way of the waves.
 */
function solidScriptGaborOrientation(wave: SolidScriptGaborWave, cell: readonly number[], bump: number): number[] {
  const [x = 0, y = 0, z = 0] = wave.orientation;
  if (wave.isotropy === 0) return [x, y, z];
  const flat = Math.hypot(x, y);
  const inclination = Math.acos(z) + solidScriptGaborRandom(cell, bump * 4) * Math.PI * wave.isotropy;
  const azimuth =
    (flat === 0 ? 0 : Math.sign(y) * Math.acos(x / flat)) +
    solidScriptGaborRandom(cell, bump * 4 + 1) * Math.PI * wave.isotropy;
  return [Math.sin(inclination) * Math.cos(azimuth), Math.sin(inclination) * Math.sin(azimuth), Math.cos(inclination)];
}

/**
 * Adds one cell's bumps: each a wave fading out within 1 of its random centre,
 * flipped at random.
 *
 * @param wave Wave settings.
 * @param cell Cell.
 * @param local Position relative to the cell's corner.
 * @returns Cosine and sine parts.
 */
function solidScriptGaborCell(wave: SolidScriptGaborWave, cell: readonly number[], local: readonly number[]): number[] {
  const sum = [0, 0];
  for (let bump = 0; bump < SOLID_SCRIPT_GABOR_BUMPS; bump++) {
    const offset = local.map((value, axis) => value - solidScriptGaborRandom(cell, bump * 4 + 2 + axis * 1e3));
    const distance = offset.reduce((total, value) => total + value * value, 0);
    if (distance >= 1) continue;
    const sign = solidScriptGaborRandom(cell, bump * 4 + 3) < 0.5 ? -1 : 1;
    const envelope = Math.exp(-Math.PI * distance) * (0.5 + 0.5 * Math.cos(Math.PI * distance));
    const way = solidScriptGaborOrientation(wave, cell, bump);
    const angle =
      2 * Math.PI * wave.frequency * offset.reduce((total, value, axis) => total + value * (way[axis] ?? 0), 0);
    sum[0] = (sum[0] ?? 0) + sign * envelope * Math.cos(angle);
    sum[1] = (sum[1] ?? 0) + sign * envelope * Math.sin(angle);
  }
  return sum;
}

/**
 * Sums the bumps of the cell a position lies in and its 26 neighbours.
 *
 * @param wave Wave settings.
 * @param position Scaled position.
 * @returns Cosine and sine parts.
 */
function solidScriptGaborSum(wave: SolidScriptGaborWave, position: readonly number[]): number[] {
  const corner = position.map(Math.floor);
  const sum = [0, 0];
  for (let index = 0; index < 27; index++) {
    const step = [(index % 3) - 1, (Math.floor(index / 3) % 3) - 1, Math.floor(index / 9) - 1];
    const cell = corner.map((value, axis) => value + (step[axis] ?? 0));
    const local = position.map((value, axis) => value - (cell[axis] ?? 0));
    const [cosine = 0, sine = 0] = solidScriptGaborCell(wave, cell, local);
    sum[0] = (sum[0] ?? 0) + cosine;
    sum[1] = (sum[1] ?? 0) + sine;
  }
  return sum;
}

/**
 * Reads a vector argument of three numbers, or a fallback when left off.
 *
 * @param args Arguments.
 * @param index Argument number.
 * @param fallback Value when left off.
 * @returns Vector.
 */
function solidScriptGaborVector(args: readonly SolidScriptValue[], index: number, fallback: number[]): number[] {
  if (args.length <= index) return fallback;
  const vector = solidScriptValueNumbers(args[index]);
  if (vector?.length !== 3) throw new Error(`${SOLID_SCRIPT_GABOR_USAGE} needs vectors of three numbers`);
  return vector;
}

/**
 * Reads the wave settings of a Gabor call.
 *
 * @param args Arguments.
 * @returns Wave settings.
 */
function solidScriptGaborWave(args: readonly SolidScriptValue[]): SolidScriptGaborWave {
  const number = (index: number, fallback: number): number =>
    args.length > index ? solidScriptExtraNumber(args, index, SOLID_SCRIPT_GABOR_USAGE) : fallback;
  const orientation = solidScriptGaborVector(args, 4, [1, 1, 0]);
  const length = Math.hypot(...orientation);
  return {
    frequency: Math.max(0.001, number(2, 2)),
    isotropy: 1 - Math.min(1, Math.max(0, number(3, 1))),
    orientation: length === 0 ? [0, 0, 0] : orientation.map((value) => value / length),
  };
}

/**
 * Samples Gabor noise: wavy bumps scattered at random, whose waves run along
 * Orientation or, with less Anisotropy, every way.
 *
 * @param args Position, Scale, Frequency, Anisotropy, Orientation and Output.
 * @returns Value or Phase from 0 to 1, or Intensity of at least 0.
 */
function solidScriptGabor(args: readonly SolidScriptValue[]): number {
  const position = solidScriptGaborVector(args, 0, []);
  if (position.length === 0) throw new Error(`${SOLID_SCRIPT_GABOR_USAGE} needs a position vector`);
  const scale = args.length > 1 ? solidScriptExtraNumber(args, 1, SOLID_SCRIPT_GABOR_USAGE) : 5;
  const output = solidScriptNoiseWord(args[5] ?? 'Value', SOLID_SCRIPT_GABOR_OUTPUTS, 'Gabor Output');
  const [cosine = 0, sine = 0] = solidScriptGaborSum(
    solidScriptGaborWave(args),
    position.map((value) => value * scale),
  );
  if (output === 'Phase') return solidScriptMemberRound((Math.atan2(sine, cosine) + Math.PI) / (2 * Math.PI));
  if (output === 'Intensity') return solidScriptMemberRound(Math.hypot(cosine, sine) / SOLID_SCRIPT_GABOR_RANGE);
  return solidScriptMemberRound((sine / SOLID_SCRIPT_GABOR_RANGE) * 0.5 + 0.5);
}

/** The Gabor noise function. */
export const SOLID_SCRIPT_FUNCTIONS_GABOR = { gabor: solidScriptGabor };
