import type { SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import {
  SOLID_SCRIPT_EXAMPLE_BOX_INPUTS,
  solidScriptExampleBlock,
  solidScriptExampleIf,
  solidScriptExampleInput,
  solidScriptExampleLine,
  solidScriptExampleNote,
  solidScriptExamplePoint,
  solidScriptExamplePolyhedron,
  solidScriptExampleRepeat,
  solidScriptExampleSet,
} from './solid_script_example_lines.js';

/** Half the box as one vector: [half.x], [half.y] and [half.z]. */
const SOLID_SCRIPT_EXAMPLE_HALF = solidScriptExampleSet('half', '[=[width] / 2], [=[depth] / 2], [=[height] / 2]');

/** Port of the Pyramid generator. */
export const SOLID_SCRIPT_EXAMPLE_PYRAMID: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Pyramid: four corners on the floor and a smaller square, or a tip, at the top.'),
  ...SOLID_SCRIPT_EXAMPLE_BOX_INPUTS,
  solidScriptExampleInput('topSize', 'number', '0', { label: 'Top Size', min: '0', max: '1' }),
  SOLID_SCRIPT_EXAMPLE_HALF,
  ...solidScriptExamplePolyhedron(
    solidScriptExampleRepeat('corner', '0', '3', [
      solidScriptExampleSet('side', '[=([corner] % 2) * 2 - 1], [=floor([corner] / 2) * 2 - 1], 0'),
      solidScriptExamplePoint('[=[side.x] * [half.x]], [=[side.y] * [half.y]], [=-[half.z]]'),
      solidScriptExamplePoint('[=[side.x] * [half.x] * [topSize]], [=[side.y] * [half.y] * [topSize]], [half.z]'),
    ]),
  ),
];

/** Port of the Prism generator. */
export const SOLID_SCRIPT_EXAMPLE_PRISM: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Prism: a regular outline stretched to the box, copied at both ends of its axis.'),
  ...SOLID_SCRIPT_EXAMPLE_BOX_INPUTS,
  solidScriptExampleInput('sides', 'count', '3', { label: 'Sides', min: '3', max: '12' }),
  solidScriptExampleInput('axis', 'choice', 'z', { label: 'Axis', choices: 'z, x, y' }),
  solidScriptExampleNote('First find how far the outline reaches, so it can be stretched to fill the box.'),
  solidScriptExampleSet('low', '1, 1'),
  solidScriptExampleSet('high', '-1, -1'),
  ...solidScriptExampleRepeat('i', '0', '[=[sides] - 1]', [
    solidScriptExampleSet('turn', '[=-90 + 180 / [sides] + 360 * [i] / [sides]]'),
    solidScriptExampleSet('low', '[=min([low.x], cos([turn]))], [=min([low.y], sin([turn]))]'),
    solidScriptExampleSet('high', '[=max([high.x], cos([turn]))], [=max([high.y], sin([turn]))]'),
  ]),
  SOLID_SCRIPT_EXAMPLE_HALF,
  ...solidScriptExamplePolyhedron(
    solidScriptExampleRepeat('i', '0', '[=[sides] - 1]', [
      solidScriptExampleSet('turn', '[=-90 + 180 / [sides] + 360 * [i] / [sides]]'),
      solidScriptExampleSet(
        'u',
        '[=(cos([turn]) - [low.x]) / ([high.x] - [low.x])], [=(sin([turn]) - [low.y]) / ([high.y] - [low.y])]',
      ),
      ...solidScriptExampleRepeat('end', '-1', '1', [
        ...solidScriptExampleIf('[end] != 0', [
          ...solidScriptExampleIf('[axis] == "x"', [
            solidScriptExamplePoint(
              '[=[end] * [half.x]], [=[half.y] - [depth] * [u.x]], [=-[half.z] + [height] * [u.y]]',
            ),
          ]),
          ...solidScriptExampleIf('[axis] == "y"', [
            solidScriptExamplePoint(
              '[=-[half.x] + [width] * [u.x]], [=[half.y] - [depth] * [u.y]], [=[end] * [half.z]]',
            ),
          ]),
          ...solidScriptExampleIf('[axis] == "z"', [
            solidScriptExamplePoint(
              '[=-[half.x] + [width] * [u.x]], [=[end] * [half.y]], [=-[half.z] + [height] * [u.y]]',
            ),
          ]),
        ]),
      ]),
    ]),
  ),
];

/**
 * Lines of the Slab function: a box from one corner to the other.
 *
 * @returns Lines.
 */
function solidScriptExampleSlabFunction(): SolidScriptLine[] {
  return solidScriptExampleBlock('function', { name: 'slab', parameters: 'from, to' }, [
    ...solidScriptExampleBlock('translate', { v: '[local.from]' }, [
      solidScriptExampleLine('cube', { size: '[=[local.to] - [local.from]]', center: 'false' }),
    ]),
  ]);
}

/**
 * Builds a Call of the Slab function.
 *
 * @param from Lowest corner as text.
 * @param to Highest corner as text.
 * @returns Line.
 */
function solidScriptExampleSlab(from: string, to: string): SolidScriptLine {
  return solidScriptExampleLine('call', { name: 'slab', values: `[=vector(${from})], [=vector(${to})]` });
}

/** Port of the Hollow Box generator. */
export const SOLID_SCRIPT_EXAMPLE_HOLLOW_BOX: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Hollow Box: a floor, a ceiling and four walls, each one box.'),
  ...SOLID_SCRIPT_EXAMPLE_BOX_INPUTS,
  solidScriptExampleInput('wallThickness', 'number', '0.25', { label: 'Wall Thickness', min: '0.01', max: '100' }),
  solidScriptExampleInput('openTop', 'switch', 'false', { label: 'Open Top' }),
  ...solidScriptExampleSlabFunction(),
  SOLID_SCRIPT_EXAMPLE_HALF,
  solidScriptExampleSet('t', '[wallThickness]'),
  ...solidScriptExampleIf(
    '[t] * 2 >= min([width], [depth], [height])',
    [solidScriptExampleSlab('-[half.x], -[half.y], -[half.z]', '[half.x], [half.y], [half.z]')],
    [
      solidScriptExampleSet('top', '[=[half.z] - [t]]'),
      ...solidScriptExampleIf('[openTop]', [solidScriptExampleSet('top', '[half.z]')]),
      solidScriptExampleSet('floor', '[=-[half.z] + [t]]'),
      solidScriptExampleSet('inner', '[=[half.x] - [t]], [=[half.y] - [t]], 0'),
      solidScriptExampleSlab('-[half.x], -[half.y], -[half.z]', '[half.x], [half.y], [floor]'),
      ...solidScriptExampleIf('not [openTop]', [
        solidScriptExampleSlab('-[half.x], -[half.y], [=[half.z] - [t]]', '[half.x], [half.y], [half.z]'),
      ]),
      solidScriptExampleSlab('-[half.x], -[half.y], [floor]', '-[inner.x], [half.y], [top]'),
      solidScriptExampleSlab('[inner.x], -[half.y], [floor]', '[half.x], [half.y], [top]'),
      solidScriptExampleSlab('-[inner.x], [inner.y], [floor]', '[inner.x], [half.y], [top]'),
      solidScriptExampleSlab('-[inner.x], -[half.y], [floor]', '[inner.x], -[inner.y], [top]'),
    ],
  ),
];
