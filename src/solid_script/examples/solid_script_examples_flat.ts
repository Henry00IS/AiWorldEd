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

/**
 * Lines that add one corner of the arch outline to the outline list.
 *
 * @param value Corner as field text.
 * @returns Line.
 */
function solidScriptExampleArchCorner(value: string): SolidScriptLine {
  return solidScriptExampleLine('add_item', { value, list: 'outline' });
}

/** Port of the Arch generator. */
export const SOLID_SCRIPT_EXAMPLE_ARCH: readonly SolidScriptLine[] = [
  solidScriptExampleNote(
    'Arch: a half ellipse cut into segments. A ring makes one stone per segment, a wall fills up to the top beside two piers, and a tunnel fills the opening.',
  ),
  ...SOLID_SCRIPT_EXAMPLE_BOX_INPUTS,
  solidScriptExampleInput('style', 'choice', 'ring', { label: 'Style', choices: 'ring, wall, tunnel' }),
  solidScriptExampleInput('span', 'choice', 'x', { label: 'Span Along', choices: 'x, z' }),
  solidScriptExampleInput('shape', 'choice', 'round', { label: 'Shape', choices: 'round, fit' }),
  solidScriptExampleInput('segments', 'count', '16', { label: 'Segments', min: '2', max: '128' }),
  solidScriptExampleInput('sweep', 'number', '180', { label: 'Sweep', min: '1', max: '180' }),
  solidScriptExampleInput('start', 'choice', 'centre', { label: 'Start From', choices: 'centre, left, right' }),
  solidScriptExampleInput('thickness', 'number', '0.25', { label: 'Thickness', min: '0.01', max: '100' }),
  solidScriptExampleNote('The editor’s Z span runs along -Y here; the arch rises along Z.'),
  solidScriptExampleSet('alongX', '[=[span] != "z"]'),
  solidScriptExampleSet('half', '[=([alongX] ? [width] : [depth]) / 2]'),
  solidScriptExampleSet('across', '[=([alongX] ? [depth] : [width]) / 2]'),
  solidScriptExampleSet('thick', '[=[style] == "tunnel" ? 0 : [thickness]]'),
  solidScriptExampleSet('rx', '[=[half] - [thick]]'),
  solidScriptExampleSet('ry', '[=[shape] == "fit" ? [height] - [thick] : min([rx], [height] - [thick])]'),
  solidScriptExampleSet('arc', '[=[style] == "ring" ? [sweep] : 180]'),
  solidScriptExampleSet('first', '[=[start] == "right" ? 0 : ([start] == "left" ? 180 - [arc] : (180 - [arc]) / 2)]'),
  solidScriptExampleSet('floor', '[=-[height] / 2]'),
  solidScriptExampleSet('top', '[=[height] / 2]'),
  ...solidScriptExampleBlock('function', { name: 'corner', parameters: 'index, grow' }, [
    solidScriptExampleSet('local.angle', '[=[first] + [arc] * [local.index] / [segments]]'),
    solidScriptExampleLine('return', {
      value:
        '[=vector(cos([local.angle]) * ([rx] + [local.grow]), [floor] + sin([local.angle]) * ([ry] + [local.grow]))]',
    }),
  ]),
  ...solidScriptExampleBlock('part', { name: 'prism' }, [
    ...solidScriptExamplePolyhedron(
      solidScriptExampleBlock('for_each', { variable: 'p', list: '[outline]' }, [
        ...solidScriptExampleIf(
          '[alongX]',
          [solidScriptExamplePoint('[p.x], [=-[across]], [p.y]'), solidScriptExamplePoint('[p.x], [across], [p.y]')],
          [
            solidScriptExamplePoint('[=-[across]], [=-[p.x]], [p.y]'),
            solidScriptExamplePoint('[across], [=-[p.x]], [p.y]'),
          ],
        ),
      ]),
    ),
  ]),
  ...solidScriptExampleIf('[rx] >= 0.0001 and [ry] >= 0.0001', [
    ...solidScriptExampleIf('[style] == "wall"', [
      solidScriptExampleNote('The piers beside the opening.'),
      ...solidScriptExampleRepeat('side', '0', '1', [
        solidScriptExampleSet('inner', '[=[side] == 0 ? -[rx] : [rx]]'),
        solidScriptExampleSet('outer', '[=[side] == 0 ? -[half] : [half]]'),
        solidScriptExampleLine('clear_variable', { name: 'outline' }),
        solidScriptExampleArchCorner('[=vector([outer], [floor])]'),
        solidScriptExampleArchCorner('[=vector([inner], [floor])]'),
        solidScriptExampleArchCorner('[=vector([inner], [top])]'),
        solidScriptExampleArchCorner('[=vector([outer], [top])]'),
        solidScriptExampleLine('use_part', { name: 'prism' }),
      ]),
    ]),
    ...solidScriptExampleRepeat('i', '0', '[=[segments] - 1]', [
      solidScriptExampleSet('a', '[=corner([i], 0)]'),
      solidScriptExampleSet('b', '[=corner([i] + 1, 0)]'),
      solidScriptExampleLine('clear_variable', { name: 'outline' }),
      ...solidScriptExampleIf(
        '[style] == "ring"',
        [
          solidScriptExampleArchCorner('[a]'),
          solidScriptExampleArchCorner('[=corner([i], [thick])]'),
          solidScriptExampleArchCorner('[=corner([i] + 1, [thick])]'),
          solidScriptExampleArchCorner('[b]'),
        ],
        solidScriptExampleIf(
          '[style] == "wall"',
          [
            solidScriptExampleArchCorner('[a]'),
            solidScriptExampleArchCorner('[b]'),
            solidScriptExampleArchCorner('[=vector([b.x], [top])]'),
            solidScriptExampleArchCorner('[=vector([a.x], [top])]'),
          ],
          [
            solidScriptExampleArchCorner('[=vector([a.x], [floor])]'),
            solidScriptExampleArchCorner('[=vector([b.x], [floor])]'),
            solidScriptExampleArchCorner('[b]'),
            solidScriptExampleArchCorner('[a]'),
          ],
        ),
      ),
      solidScriptExampleLine('use_part', { name: 'prism' }),
    ]),
  ]),
];
