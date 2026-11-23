import { solidScriptNoiseWord } from './solid_script_functions_noise.js';
import { solidScriptExtraNumber } from './solid_script_functions_extra.js';
import { solidScriptMemberRound } from './solid_script_members.js';
import { solidScriptValueNumbers, type SolidScriptValue } from './solid_script_value.js';

/** How to call Gabor, for messages. */
const SOLID_SCRIPT_GABOR_USAGE = 'Gabor(position, scale, frequency, anisotropy, orientation, output)';

/** What Gabor gives. */
const SOLID_SCRIPT_GABOR_OUTPUTS = ['Value', 'Phase', 'Intensity'] as const;

/** Wave bumps scattered in each unit cell. */
const SOLID_SCRIPT_GABOR_BUMPS = 10;

/**
 * Reach of one bump, as a share of a cell, so only the 2 by 2 by 2 nearest
 * cells can touch a point.
 */
const SOLID_SCRIPT_GABOR_REACH = 0.5;

/**
 * Spread of the summed waves that maps to the full 0 to 1 range, measured for
 * this kernel and bump count.
 */
const SOLID_SCRIPT_GABOR_SPREAD = 0.75;

/** One wave bump: where it sits, how strong it is and which way its waves run. */
interface SolidScriptGaborBump {
  at: [number, number, number];
  weight: number;
  way: [number, number, number];
}

/**
 * A small random stream for one cell: each call gives the next number from 0 to
 * 1.
 *
 * @param cell Whole-number cell coordinates.
 * @returns Next random number.
 */
function solidScriptGaborStream(cell: readonly [number, number, number]): () => number {
  let state = (Math.imul(cell[0], 0x1f1f1f1f) ^ Math.imul(cell[1], 0x2c1b3c6d) ^ Math.imul(cell[2], 0x297a2d39)) >>> 0;
  return () => {
    state = (state + 0x9e3779b9) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 0x85ebca6b);
    mixed = Math.imul(mixed ^ (mixed >>> 13), 0xc2b2ae35);
    return ((mixed ^ (mixed >>> 16)) >>> 0) / 4294967296;
  };
}

/**
 * Picks the way one bump's waves run: Orientation blended toward a random way
 * on the sphere, the more the lower Anisotropy is.
 *
 * @param next Random stream.
 * @param orientation Unit Orientation, or zero when none was given.
 * @param anisotropy From 0 to 1.
 * @returns Unit direction.
 */
function solidScriptGaborWay(
  next: () => number,
  orientation: readonly number[],
  anisotropy: number,
): [number, number, number] {
  const z = next() * 2 - 1;
  const turn = next() * Math.PI * 2;
  const ring = Math.sqrt(Math.max(0, 1 - z * z));
  const random = [ring * Math.cos(turn), ring * Math.sin(turn), z];
  const blend = random.map((part, axis) => (orientation[axis] ?? 0) * anisotropy + part * (1 - anisotropy));
  const length = Math.hypot(...blend);
  if (length < 1e-9) return random as [number, number, number];
  return blend.map((part) => part / length) as [number, number, number];
}

/**
 * Scatters the wave bumps of one cell.
 *
 * @param cell Whole-number cell coordinates.
 * @param orientation Unit Orientation.
 * @param anisotropy From 0 to 1.
 * @returns Bumps.
 */
function solidScriptGaborBumps(
  cell: readonly [number, number, number],
  orientation: readonly number[],
  anisotropy: number,
): SolidScriptGaborBump[] {
  const next = solidScriptGaborStream(cell);
  return Array.from({ length: SOLID_SCRIPT_GABOR_BUMPS }, () => ({
    at: [cell[0] + next(), cell[1] + next(), cell[2] + next()],
    weight: next() * 2 - 1,
    way: solidScriptGaborWay(next, orientation, anisotropy),
  }));
}

/**
 * Adds up the waves of every bump that reaches a point, as a cosine part and a
 * sine part.
 *
 * @param point Scaled position.
 * @param frequency Waves across each bump.
 * @param orientation Unit Orientation.
 * @param anisotropy From 0 to 1.
 * @returns Cosine and sine sums.
 */
function solidScriptGaborSum(
  point: readonly [number, number, number],
  frequency: number,
  orientation: readonly number[],
  anisotropy: number,
): [number, number] {
  const near = point.map((part) => Math.round(part) - 1);
  let cosine = 0;
  let sine = 0;
  for (let corner = 0; corner < 8; corner++) {
    const cell: [number, number, number] = [0, 1, 2].map((axis) => (near[axis] ?? 0) + ((corner >> axis) & 1)) as [
      number,
      number,
      number,
    ];
    for (const bump of solidScriptGaborBumps(cell, orientation, anisotropy)) {
      const offset = point.map((part, axis) => part - (bump.at[axis] ?? 0));
      const reach = offset.reduce((sum, part) => sum + part * part, 0) / SOLID_SCRIPT_GABOR_REACH ** 2;
      if (reach >= 1) continue;
      const strength = bump.weight * (1 - reach) ** 3;
      const angle = 2 * Math.PI * frequency * offset.reduce((sum, part, axis) => sum + part * (bump.way[axis] ?? 0), 0);
      cosine += strength * Math.cos(angle);
      sine += strength * Math.sin(angle);
    }
  }
  return [cosine, sine];
}

/**
 * Wavy streaks from many small wave bumps scattered at random: the wave, where
 * along its wave a place lies, or how strong the waves are there.
 *
 * @param args Position, Scale, Frequency, Anisotropy, Orientation and Output.
 * @returns Value or Phase from 0 to 1, or Intensity from 0 up.
 */
function solidScriptGabor(args: readonly SolidScriptValue[]): number {
  const position = solidScriptValueNumbers(args[0]);
  if (position?.length !== 3) throw new Error(`${SOLID_SCRIPT_GABOR_USAGE} needs a position of three numbers`);
  const scale = args.length > 1 ? solidScriptExtraNumber(args, 1, SOLID_SCRIPT_GABOR_USAGE) : 5;
  const frequency = Math.max(0, args.length > 2 ? solidScriptExtraNumber(args, 2, SOLID_SCRIPT_GABOR_USAGE) : 2);
  const anisotropy = Math.min(
    1,
    Math.max(0, args.length > 3 ? solidScriptExtraNumber(args, 3, SOLID_SCRIPT_GABOR_USAGE) : 1),
  );
  const way = args.length > 4 ? solidScriptValueNumbers(args[4]) : [1, 1, 0];
  const length = Math.hypot(...(way ?? []));
  const orientation = length > 1e-9 ? (way ?? []).map((part) => part / length) : [0, 0, 0];
  const output = solidScriptNoiseWord(args[5], SOLID_SCRIPT_GABOR_OUTPUTS, 'Gabor Output');
  const point = position.map((part) => part * scale) as [number, number, number];
  const [cosine, sine] = solidScriptGaborSum(point, frequency, orientation, anisotropy).map(
    (part) => part / SOLID_SCRIPT_GABOR_SPREAD,
  ) as [number, number];
  if (output === 'Intensity') return solidScriptMemberRound(Math.hypot(cosine, sine));
  if (output === 'Phase') return solidScriptMemberRound((Math.atan2(sine, cosine) + Math.PI) / (2 * Math.PI));
  return solidScriptMemberRound(sine * 0.5 + 0.5);
}

/** Gabor streak noise. */
export const SOLID_SCRIPT_FUNCTIONS_GABOR = { gabor: solidScriptGabor };
