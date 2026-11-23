import type { SolidScriptFunctionDoc } from './solid_script_function_docs.js';
import { solidScriptFunctionDocSummary } from './solid_script_function_docs_math.js';
import type { SolidScriptBuiltinName } from './solid_script_functions_builtin.js';

/** Docs of the brick, swirl, streak and fade texture functions. */
export const SOLID_SCRIPT_FUNCTION_DOCS_TEXTURE = {
  brick: {
    usage: 'Brick(position, scale, seed, output, mortar, width, height, offset, smooth)',
    summary: solidScriptFunctionDocSummary(
      'A wall of bricks laid in rows across X and Y, with Scale multiplying the position. Output Mortar (the default) is 1 on the gaps between bricks and 0 inside them; Tint is one random value from 0 to 1 per brick, changed by Seed. Mortar is the gap size (0.02), Width and Height the brick size (0.5 by 0.25), Offset how far every other row shifts, as part of a brick (0.5), and Smooth how softly the gap fades into the brick, from 0 to 1 (0.1).',
      [
        'Brick(Vector(0, 0.125, 0)) is 0.',
        'Brick(Vector(0, 0.25, 0)) is 1.',
        'Brick(Vector([$X], [$Y], 0), 1, 3, "Tint") gives one value per brick.',
      ],
      'Use it to pick the mortar faces of a wall, or give each brick its own colour or depth.',
    ),
    group: 'Random',
    gives: ['Number'],
  },
  magic: {
    usage: 'Magic(position, scale, depth, distortion)',
    summary: solidScriptFunctionDocSummary(
      'Swirling colour bands made of nested waves, with Scale multiplying the position. Gives a vector of three values, mostly from 0 to 1. Depth, from 0 to 10, is how many times the waves fold into each other (2), and Distortion how strongly they bend (1). The average of the three values is a single pattern number.',
      [
        'Magic(Vector(0, 0, 0), 1, 0) is [0.5, 1, 0.5].',
        'Average(Magic(Vector([$X], [$Y], [$Z]), 2)) gives one number.',
      ],
      'Use it for psychedelic tints or to scatter values in a busy but smooth way.',
    ),
    group: 'Random',
    gives: ['Vector'],
  },
  gabor: {
    usage: 'Gabor(position, scale, frequency, anisotropy, orientation, output)',
    summary: solidScriptFunctionDocSummary(
      'Wavy streaks: many small wave bumps scattered at random, with Scale multiplying the position (5). Frequency is how many waves run across each bump (2). Anisotropy from 0 to 1 is how closely the waves follow Orientation (1, all of them; 0 turns each a random way), and Orientation is the way they run (1, 1, 0). Output Value (the default) is the wave, mostly from 0 to 1 around 0.5; Phase, from 0 to 1, is where along its wave a place lies; Intensity, from 0 up, is how strong the waves are there.',
      [
        'Gabor(Vector([$X], [$Y], [$Z])) gives streaks running diagonally across X and Y.',
        'Gabor(Vector([$X], [$Y], 0), 5, 2, 0) gives a tangle of waves going every way.',
      ],
      'Use it for brushed metal, wood grain, fibres or ripples.',
    ),
    group: 'Random',
    gives: ['Number'],
  },
  gradient: {
    usage: 'Gradient(position, type)',
    summary: solidScriptFunctionDocSummary(
      'A fade from 0 to 1 across space, always held between 0 and 1. Type Linear (the default) runs along X from 0 to 1; Quadratic is that squared; Easing starts and ends gently; Diagonal runs along X and Y together; Spherical is 1 in the middle and 0 a metre away; Quadratic Sphere is that squared; Radial turns once around Z, 0.5 along +X.',
      [
        'Gradient(Vector(0.25, 0, 0)) is 0.25.',
        'Gradient(Vector(0.5, 0, 0), "Quadratic") is 0.25.',
        'Gradient(Vector([$X], [$Y], 0), "Radial") gives a sweep around the middle.',
      ],
      'Use it to fade a height, size or chance across an object, or to make a ramp for Remap.',
    ),
    group: 'Random',
    gives: ['Number'],
  },
} as const satisfies Partial<Record<SolidScriptBuiltinName, SolidScriptFunctionDoc>>;

/** Inputs of Brick, Magic, Gabor and Gradient that mean something of their own. */
export const SOLID_SCRIPT_TEXTURE_ARGUMENTS = {
  gabor: {
    position: {
      type: ['Vector'],
      about: 'Where to read the streaks, such as Vector([$X], [$Y], [$Z]).',
      start: '0, 0, 0',
    },
    scale: { type: ['Number'], about: 'Multiplies the position; bigger makes smaller bumps.', start: '5' },
    frequency: { type: ['Number'], about: 'Waves across each bump.', start: '2' },
    anisotropy: { type: ['Number'], about: 'How closely the waves follow Orientation, from 0 to 1.', start: '1' },
    orientation: { type: ['Vector'], about: 'Way the waves run.', start: '1, 1, 0' },
    output: {
      type: ['Text'],
      about: 'Value, Phase or Intensity.',
      choices: ['Value', 'Phase', 'Intensity'],
      default: 'Value',
    },
  },
  brick: {
    position: { type: ['Vector'], about: 'Where to read the wall, such as Vector([$X], [$Y], 0).', start: '0, 0, 0' },
    scale: { type: ['Number'], about: 'Multiplies the position; bigger makes smaller bricks.', start: '1' },
    output: { type: ['Text'], about: 'Mortar or Tint.', choices: ['Mortar', 'Tint'], default: 'Mortar' },
    mortar: { type: ['Number'], about: 'Gap between bricks.', start: '0.02' },
    width: { type: ['Number'], about: 'Brick width.', start: '0.5' },
    height: { type: ['Number'], about: 'Row height.', start: '0.25' },
    offset: { type: ['Number'], about: 'Shift of every other row, as part of a brick.', start: '0.5' },
    smooth: { type: ['Number'], about: 'How softly the gap fades, from 0 to 1.', start: '0.1' },
  },
  gradient: {
    position: {
      type: ['Vector'],
      about: 'Where to read the fade, such as Vector([$X], [$Y], [$Z]).',
      start: '0, 0, 0',
    },
    type: {
      type: ['Text'],
      about: 'Linear, Quadratic, Easing, Diagonal, Spherical, Quadratic Sphere or Radial.',
      choices: ['Linear', 'Quadratic', 'Easing', 'Diagonal', 'Spherical', 'Quadratic Sphere', 'Radial'],
      default: 'Linear',
    },
  },
  magic: {
    position: {
      type: ['Vector'],
      about: 'Where to read the pattern, such as Vector([$X], [$Y], [$Z]).',
      start: '0, 0, 0',
    },
    scale: { type: ['Number'], about: 'Multiplies the position; bigger makes finer bands.', start: '1' },
    depth: { type: ['Number'], about: 'How many times the waves fold, from 0 to 10.', start: '2' },
    distortion: { type: ['Number'], about: 'How strongly the waves bend.', start: '1' },
  },
} as const;
