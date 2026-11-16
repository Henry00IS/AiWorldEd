import type { SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import {
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
const SOLID_SCRIPT_EXAMPLE_HALF = solidScriptExampleSet(
  'Half',
  '[=[Box.Width] / 2], [=[Box.Height] / 2], [=[Box.Depth] / 2]',
);

/** Port of the Pyramid generator. */
export const SOLID_SCRIPT_EXAMPLE_PYRAMID: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Pyramid: four corners on the floor and a smaller square, or a tip, at the top.'),
  solidScriptExampleInput('TopSize', 'number', '0', { label: 'Top Size', min: '0', max: '1' }),
  SOLID_SCRIPT_EXAMPLE_HALF,
  ...solidScriptExamplePolyhedron(
    solidScriptExampleRepeat('Corner', '0', '3', [
      solidScriptExampleSet('Side', '[=([Corner] % 2) * 2 - 1], 0, [=Floor([Corner] / 2) * 2 - 1]'),
      solidScriptExamplePoint('[=[Side.x] * [Half.x]], [=-[Half.y]], [=[Side.z] * [Half.z]]'),
      solidScriptExamplePoint('[=[Side.x] * [Half.x] * [TopSize]], [Half.y], [=[Side.z] * [Half.z] * [TopSize]]'),
    ]),
  ),
];

/** Port of the Prism generator. */
export const SOLID_SCRIPT_EXAMPLE_PRISM: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Prism: a regular outline stretched to the box, copied at both ends of its axis.'),
  solidScriptExampleInput('Sides', 'count', '3', { label: 'Sides', min: '3', max: '12' }),
  solidScriptExampleInput('Axis', 'choice', 'z', { label: 'Axis', choices: 'z, x, y' }),
  solidScriptExampleNote('First find how far the outline reaches, so it can be stretched to fill the box.'),
  solidScriptExampleSet('Low', '1, 1'),
  solidScriptExampleSet('High', '-1, -1'),
  ...solidScriptExampleRepeat('I', '0', '[=[Sides] - 1]', [
    solidScriptExampleSet('Turn', '[=-90 + 180 / [Sides] + 360 * [I] / [Sides]]'),
    solidScriptExampleSet('Low', '[=Min([Low.x], Cos([Turn]))], [=Min([Low.y], Sin([Turn]))]'),
    solidScriptExampleSet('High', '[=Max([High.x], Cos([Turn]))], [=Max([High.y], Sin([Turn]))]'),
  ]),
  SOLID_SCRIPT_EXAMPLE_HALF,
  ...solidScriptExamplePolyhedron(
    solidScriptExampleRepeat('I', '0', '[=[Sides] - 1]', [
      solidScriptExampleSet('Turn', '[=-90 + 180 / [Sides] + 360 * [I] / [Sides]]'),
      solidScriptExampleSet(
        'U',
        '[=(Cos([Turn]) - [Low.x]) / ([High.x] - [Low.x])], [=(Sin([Turn]) - [Low.y]) / ([High.y] - [Low.y])]',
      ),
      ...solidScriptExampleRepeat('End', '-1', '1', [
        ...solidScriptExampleIf('[End] != 0', [
          ...solidScriptExampleIf('[Axis] == "x"', [
            solidScriptExamplePoint(
              '[=[End] * [Half.x]], [=-[Half.y] + [Box.Height] * [U.y]], [=[Box.Depth] * [U.x] - [Half.z]]',
            ),
          ]),
          ...solidScriptExampleIf('[Axis] == "y"', [
            solidScriptExamplePoint(
              '[=-[Half.x] + [Box.Width] * [U.x]], [=[End] * [Half.y]], [=[Box.Depth] * [U.y] - [Half.z]]',
            ),
          ]),
          ...solidScriptExampleIf('[Axis] == "z"', [
            solidScriptExamplePoint(
              '[=-[Half.x] + [Box.Width] * [U.x]], [=-[Half.y] + [Box.Height] * [U.y]], [=[End] * [Half.z]]',
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
  return solidScriptExampleBlock('function', { name: 'Slab', parameters: 'From, To' }, [
    ...solidScriptExampleBlock('translate', { v: '[Local.From]' }, [
      solidScriptExampleLine('cube', { size: '[=[Local.To] - [Local.From]]', anchor: 'Left, Bottom, Back' }),
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
  return solidScriptExampleLine('call', { name: 'Slab', values: `[=Vector(${from})], [=Vector(${to})]` });
}

/** Port of the Hollow Box generator. */
export const SOLID_SCRIPT_EXAMPLE_HOLLOW_BOX: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Hollow Box: a floor, a ceiling and four walls, each one box.'),
  solidScriptExampleInput('WallThickness', 'number', '0.25', { label: 'Wall Thickness', min: '0.01', max: '100' }),
  solidScriptExampleInput('OpenTop', 'switch', 'false', { label: 'Open Top' }),
  ...solidScriptExampleSlabFunction(),
  SOLID_SCRIPT_EXAMPLE_HALF,
  solidScriptExampleSet('T', '[WallThickness]'),
  ...solidScriptExampleIf(
    '[T] * 2 >= Min([Box.Width], [Box.Depth], [Box.Height])',
    [solidScriptExampleSlab('-[Half.x], -[Half.y], -[Half.z]', '[Half.x], [Half.y], [Half.z]')],
    [
      solidScriptExampleSet('Top', '[=[Half.y] - [T]]'),
      ...solidScriptExampleIf('[OpenTop]', [solidScriptExampleSet('Top', '[Half.y]')]),
      solidScriptExampleSet('Floor', '[=-[Half.y] + [T]]'),
      solidScriptExampleSet('Inner', '[=[Half.x] - [T]], 0, [=[Half.z] - [T]]'),
      solidScriptExampleSlab('-[Half.x], -[Half.y], -[Half.z]', '[Half.x], [Floor], [Half.z]'),
      ...solidScriptExampleIf('not [OpenTop]', [
        solidScriptExampleSlab('-[Half.x], [=[Half.y] - [T]], -[Half.z]', '[Half.x], [Half.y], [Half.z]'),
      ]),
      solidScriptExampleSlab('-[Half.x], [Floor], -[Half.z]', '-[Inner.x], [Top], [Half.z]'),
      solidScriptExampleSlab('[Inner.x], [Floor], -[Half.z]', '[Half.x], [Top], [Half.z]'),
      solidScriptExampleSlab('-[Inner.x], [Floor], [Inner.z]', '[Inner.x], [Top], [Half.z]'),
      solidScriptExampleSlab('-[Inner.x], [Floor], -[Half.z]', '[Inner.x], [Top], -[Inner.z]'),
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
  return solidScriptExampleLine('add_item', { value, list: 'Outline' });
}

/** Port of the Arch generator. */
export const SOLID_SCRIPT_EXAMPLE_ARCH: readonly SolidScriptLine[] = [
  solidScriptExampleNote(
    'Arch: a half ellipse cut into segments. A ring makes one stone per segment, a wall fills up to the top beside two piers, and a tunnel fills the opening.',
  ),
  solidScriptExampleInput('Style', 'choice', 'ring', { label: 'Style', choices: 'ring, wall, tunnel' }),
  solidScriptExampleInput('Span', 'choice', 'x', { label: 'Span Along', choices: 'x, z' }),
  solidScriptExampleInput('Shape', 'choice', 'round', { label: 'Shape', choices: 'round, fit' }),
  solidScriptExampleInput('Segments', 'count', '16', { label: 'Segments', min: '2', max: '128' }),
  solidScriptExampleInput('Sweep', 'number', '180', { label: 'Sweep °', min: '1', max: '180' }),
  solidScriptExampleInput('Start', 'choice', 'centre', { label: 'Start From', choices: 'centre, left, right' }),
  solidScriptExampleInput('Thickness', 'number', '0.25', { label: 'Thickness', min: '0.01', max: '100' }),
  solidScriptExampleNote('The arch rises along Y and spans X, or Z when Span Along is z.'),
  solidScriptExampleSet('AlongX', '[=[Span] != "z"]'),
  solidScriptExampleSet('Half', '[=([AlongX] ? [Box.Width] : [Box.Depth]) / 2]'),
  solidScriptExampleSet('Across', '[=([AlongX] ? [Box.Depth] : [Box.Width]) / 2]'),
  solidScriptExampleSet('Thick', '[=[Style] == "tunnel" ? 0 : [Thickness]]'),
  solidScriptExampleSet('Rx', '[=[Half] - [Thick]]'),
  solidScriptExampleSet('Ry', '[=[Shape] == "fit" ? [Box.Height] - [Thick] : Min([Rx], [Box.Height] - [Thick])]'),
  solidScriptExampleSet('Arc', '[=[Style] == "ring" ? [Sweep] : 180]'),
  solidScriptExampleSet('First', '[=[Start] == "right" ? 0 : ([Start] == "left" ? 180 - [Arc] : (180 - [Arc]) / 2)]'),
  solidScriptExampleSet('Floor', '[=-[Box.Height] / 2]'),
  solidScriptExampleSet('Top', '[=[Box.Height] / 2]'),
  ...solidScriptExampleBlock('function', { name: 'Corner', parameters: 'Index, Grow' }, [
    solidScriptExampleSet('Local.Angle', '[=[First] + [Arc] * [Local.Index] / [Segments]]'),
    solidScriptExampleLine('return', {
      value:
        '[=Vector(Cos([Local.Angle]) * ([Rx] + [Local.Grow]), [Floor] + Sin([Local.Angle]) * ([Ry] + [Local.Grow]))]',
    }),
  ]),
  ...solidScriptExampleBlock('part', { name: 'Prism' }, [
    ...solidScriptExamplePolyhedron(
      solidScriptExampleBlock('for_each', { variable: 'P', list: '[Outline]' }, [
        ...solidScriptExampleIf(
          '[AlongX]',
          [solidScriptExamplePoint('[P.x], [P.y], [=-[Across]]'), solidScriptExamplePoint('[P.x], [P.y], [Across]')],
          [solidScriptExamplePoint('[=-[Across]], [P.y], [P.x]'), solidScriptExamplePoint('[Across], [P.y], [P.x]')],
        ),
      ]),
    ),
  ]),
  ...solidScriptExampleIf('[Rx] >= 0.0001 and [Ry] >= 0.0001', [
    ...solidScriptExampleIf('[Style] == "wall"', [
      solidScriptExampleNote('The piers beside the opening.'),
      ...solidScriptExampleRepeat('Side', '0', '1', [
        solidScriptExampleSet('Inner', '[=[Side] == 0 ? -[Rx] : [Rx]]'),
        solidScriptExampleSet('Outer', '[=[Side] == 0 ? -[Half] : [Half]]'),
        solidScriptExampleLine('clear_variable', { name: 'Outline' }),
        solidScriptExampleArchCorner('[=Vector([Outer], [Floor])]'),
        solidScriptExampleArchCorner('[=Vector([Inner], [Floor])]'),
        solidScriptExampleArchCorner('[=Vector([Inner], [Top])]'),
        solidScriptExampleArchCorner('[=Vector([Outer], [Top])]'),
        solidScriptExampleLine('use_part', { name: 'Prism' }),
      ]),
    ]),
    ...solidScriptExampleRepeat('I', '0', '[=[Segments] - 1]', [
      solidScriptExampleSet('A', '[=Corner([I], 0)]'),
      solidScriptExampleSet('B', '[=Corner([I] + 1, 0)]'),
      solidScriptExampleLine('clear_variable', { name: 'Outline' }),
      ...solidScriptExampleIf(
        '[Style] == "ring"',
        [
          solidScriptExampleArchCorner('[A]'),
          solidScriptExampleArchCorner('[=Corner([I], [Thick])]'),
          solidScriptExampleArchCorner('[=Corner([I] + 1, [Thick])]'),
          solidScriptExampleArchCorner('[B]'),
        ],
        solidScriptExampleIf(
          '[Style] == "wall"',
          [
            solidScriptExampleArchCorner('[A]'),
            solidScriptExampleArchCorner('[B]'),
            solidScriptExampleArchCorner('[=Vector([B.x], [Top])]'),
            solidScriptExampleArchCorner('[=Vector([A.x], [Top])]'),
          ],
          [
            solidScriptExampleArchCorner('[=Vector([A.x], [Floor])]'),
            solidScriptExampleArchCorner('[=Vector([B.x], [Floor])]'),
            solidScriptExampleArchCorner('[B]'),
            solidScriptExampleArchCorner('[A]'),
          ],
        ),
      ),
      solidScriptExampleLine('use_part', { name: 'Prism' }),
    ]),
  ]),
];
