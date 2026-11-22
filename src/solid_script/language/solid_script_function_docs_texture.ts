import type { SolidScriptFunctionDoc } from './solid_script_function_docs.js';
import { solidScriptFunctionDocSummary } from './solid_script_function_docs_math.js';
import type { SolidScriptBuiltinName } from './solid_script_functions_builtin.js';

/** Docs of the brick and swirl texture functions. */
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
      ['Magic(Vector(0, 0, 0), 1, 0) is [0.5, 0, 1].', 'Average(Magic(Vector([$X], [$Y], [$Z]), 2)) gives one number.'],
      'Use it for psychedelic tints or to scatter values in a busy but smooth way.',
    ),
    group: 'Random',
    gives: ['Vector'],
  },
} as const satisfies Partial<Record<SolidScriptBuiltinName, SolidScriptFunctionDoc>>;

/** Inputs of Brick and Magic that mean something of their own. */
export const SOLID_SCRIPT_TEXTURE_ARGUMENTS = {
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
