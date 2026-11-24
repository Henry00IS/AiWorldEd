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

/** Half the box as one vector: [Half.X], [Half.Y] and [Half.Z]. */
const SOLID_SCRIPT_EXAMPLE_HALF = solidScriptExampleSet('Half', '[$Box.Extents]');

/** Port of the Pyramid generator. */
export const SOLID_SCRIPT_EXAMPLE_PYRAMID: readonly SolidScriptLine[] = [
  ...solidScriptExampleNote('Pyramid: four corners on the floor and a smaller square, or a tip, at the top.'),
  solidScriptExampleInput('TopSize', 'Number', '0', { label: 'Top Size', min: '0', max: '1' }),
  ...solidScriptExampleNote(
    '[Box] is the generator box in the editor: its Width, Height and Depth. [Box.Extents] is half of that, kept as [Half], so the pyramid sits in the box.',
  ),
  SOLID_SCRIPT_EXAMPLE_HALF,
  ...solidScriptExampleNote(
    'Polyhedron builds one solid from corners you list. Each Point is one corner of the pyramid.',
  ),
  ...solidScriptExamplePolyhedron(
    solidScriptExampleRepeat('Corner', '0', '4', [
      solidScriptExampleSet('Side', '[=([Corner] % 2) * 2 - 1], 0, [=Floor([Corner] / 2) * 2 - 1]'),
      solidScriptExamplePoint('[=[Side.X] * [Half.X]], [=-[Half.Y]], [=[Side.Z] * [Half.Z]]'),
      solidScriptExamplePoint('[=[Side.X] * [Half.X] * [TopSize]], [Half.Y], [=[Side.Z] * [Half.Z] * [TopSize]]'),
    ]),
  ),
];

/** Port of the Prism generator. */
export const SOLID_SCRIPT_EXAMPLE_PRISM: readonly SolidScriptLine[] = [
  ...solidScriptExampleNote('Prism: a regular polygon stretched to the box, copied at both ends of its axis.'),
  solidScriptExampleInput('Sides', 'Count', '3', { label: 'Sides', min: '3', max: '12' }),
  solidScriptExampleInput('Axis', 'Choice', 'Along Z', { label: 'Axis', choices: 'Along Z, Along X, Upright' }),
  ...solidScriptExampleNote('First find how far the polygon reaches, so it can be stretched to fill the box.'),
  ...solidScriptExampleNote(
    'If runs the lines inside only when its condition holds. Here each If picks the axis and writes the matching corners.',
  ),
  solidScriptExampleSet('Low', '1, 1'),
  solidScriptExampleSet('High', '-1, -1'),
  ...solidScriptExampleRepeat('I', '0', '[Sides]', [
    solidScriptExampleSet('Turn', '[=-90 + 180 / [Sides] + 360 * [I] / [Sides]]'),
    solidScriptExampleSet('Low', '[=Min([Low.X], Cos([Turn]))], [=Min([Low.Y], Sin([Turn]))]'),
    solidScriptExampleSet('High', '[=Max([High.X], Cos([Turn]))], [=Max([High.Y], Sin([Turn]))]'),
  ]),
  SOLID_SCRIPT_EXAMPLE_HALF,
  ...solidScriptExamplePolyhedron(
    solidScriptExampleRepeat('I', '0', '[Sides]', [
      solidScriptExampleSet('Turn', '[=-90 + 180 / [Sides] + 360 * [I] / [Sides]]'),
      solidScriptExampleSet(
        'U',
        '[=(Cos([Turn]) - [Low.X]) / ([High.X] - [Low.X])], [=(Sin([Turn]) - [Low.Y]) / ([High.Y] - [Low.Y])]',
      ),
      ...solidScriptExampleRepeat('End', '-1', '2', [
        ...solidScriptExampleIf('[End] != 0', [
          ...solidScriptExampleIf('[Axis] == "Along X"', [
            solidScriptExamplePoint(
              '[=[End] * [Half.X]], [=-[Half.Y] + [$Box.Height] * [U.Y]], [=[$Box.Depth] * [U.X] - [Half.Z]]',
            ),
          ]),
          ...solidScriptExampleIf('[Axis] == "Upright"', [
            solidScriptExamplePoint(
              '[=-[Half.X] + [$Box.Width] * [U.X]], [=[End] * [Half.Y]], [=[$Box.Depth] * [U.Y] - [Half.Z]]',
            ),
          ]),
          ...solidScriptExampleIf('[Axis] == "Along Z"', [
            solidScriptExamplePoint(
              '[=-[Half.X] + [$Box.Width] * [U.X]], [=-[Half.Y] + [$Box.Height] * [U.Y]], [=[End] * [Half.Z]]',
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
    ...solidScriptExampleBlock('transform', { move: '[$Local.From]' }, [
      solidScriptExampleLine('cube', { size: '[=[$Local.To] - [$Local.From]]', anchor: 'Left, Bottom, Back' }),
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
  ...solidScriptExampleNote('Hollow Box: a floor, a ceiling and four walls, each one box.'),
  solidScriptExampleInput('WallThickness', 'Number', '0.25', { label: 'Wall Thickness', min: '0.01', max: '100' }),
  solidScriptExampleInput('OpenTop', 'Switch', 'No', { label: 'Open Top' }),
  ...solidScriptExampleNote(
    'Function names a group of lines so Call can run them later. Slab takes From and To; inside the function, [$Local.From] and [$Local.To] are the values from that Call. The script skips the Function lines where they stand.',
  ),
  ...solidScriptExampleSlabFunction(),
  SOLID_SCRIPT_EXAMPLE_HALF,
  solidScriptExampleSet('T', '[WallThickness]'),
  ...solidScriptExampleIf(
    '[T] * 2 >= Min([$Box.Width], [$Box.Depth], [$Box.Height])',
    [solidScriptExampleSlab('-[Half.X], -[Half.Y], -[Half.Z]', '[Half.X], [Half.Y], [Half.Z]')],
    [
      solidScriptExampleSet('Top', '[=[Half.Y] - [T]]'),
      ...solidScriptExampleIf('[OpenTop]', [solidScriptExampleSet('Top', '[Half.Y]')]),
      solidScriptExampleSet('Floor', '[=-[Half.Y] + [T]]'),
      solidScriptExampleSet('Inner', '[=[Half.X] - [T]], 0, [=[Half.Z] - [T]]'),
      solidScriptExampleSlab('-[Half.X], -[Half.Y], -[Half.Z]', '[Half.X], [Floor], [Half.Z]'),
      ...solidScriptExampleIf('not [OpenTop]', [
        solidScriptExampleSlab('-[Half.X], [=[Half.Y] - [T]], -[Half.Z]', '[Half.X], [Half.Y], [Half.Z]'),
      ]),
      solidScriptExampleSlab('-[Half.X], [Floor], -[Half.Z]', '-[Inner.X], [Top], [Half.Z]'),
      solidScriptExampleSlab('[Inner.X], [Floor], -[Half.Z]', '[Half.X], [Top], [Half.Z]'),
      solidScriptExampleSlab('-[Inner.X], [Floor], [Inner.Z]', '[Inner.X], [Top], [Half.Z]'),
      solidScriptExampleSlab('-[Inner.X], [Floor], -[Half.Z]', '[Inner.X], [Top], -[Inner.Z]'),
    ],
  ),
];

/**
 * Lines that add one corner of the arch to the Corners list.
 *
 * @param value Corner as field text.
 * @returns Line.
 */
function solidScriptExampleArchCorner(value: string): SolidScriptLine {
  return solidScriptExampleLine('add_item', { value, list: 'Corners' });
}

/** Port of the Arch generator. */
export const SOLID_SCRIPT_EXAMPLE_ARCH: readonly SolidScriptLine[] = [
  ...solidScriptExampleNote(
    'Arch: a half ellipse cut into segments. A ring makes one stone per segment, a wall fills up to the top beside two piers, and a tunnel fills the opening.',
  ),
  solidScriptExampleInput('Style', 'Choice', 'Voussoir Ring', {
    label: 'Style',
    choices: 'Voussoir Ring, Wall With Opening, Tunnel',
  }),
  solidScriptExampleInput('Span', 'Choice', 'Along X', { label: 'Span Along', choices: 'Along X, Along Z' }),
  solidScriptExampleInput('Shape', 'Choice', 'Round', { label: 'Shape', choices: 'Round, Stretch To Top' }),
  solidScriptExampleInput('Segments', 'Count', '16', { label: 'Segments', min: '2', max: '128' }),
  solidScriptExampleInput('Sweep', 'Number', '180', { label: 'Sweep °', min: '1', max: '180' }),
  solidScriptExampleInput('Start', 'Choice', 'Center', { label: 'Start From', choices: 'Center, Left, Right' }),
  solidScriptExampleInput('Thickness', 'Number', '0.25', { label: 'Thickness', min: '0.01', max: '100' }),
  ...solidScriptExampleNote('The arch rises along Y and spans X, or Z when Span Along is z.'),
  solidScriptExampleSet('AlongX', '[=[Span] == "Along X"]'),
  solidScriptExampleSet('Half', '[=[AlongX] ? [$Box.Extents.X] : [$Box.Extents.Z]]'),
  solidScriptExampleSet('Across', '[=[AlongX] ? [$Box.Extents.Z] : [$Box.Extents.X]]'),
  solidScriptExampleSet('Thick', '[=[Style] == "Tunnel" ? 0 : [Thickness]]'),
  solidScriptExampleSet('Rx', '[=[Half] - [Thick]]'),
  solidScriptExampleSet(
    'Ry',
    '[=[Shape] == "Stretch To Top" ? [$Box.Height] - [Thick] : Min([Rx], [$Box.Height] - [Thick])]',
  ),
  solidScriptExampleSet('Arc', '[=[Style] == "Voussoir Ring" ? [Sweep] : 180]'),
  solidScriptExampleSet('First', '[=[Start] == "Right" ? 0 : ([Start] == "Left" ? 180 - [Arc] : (180 - [Arc]) / 2)]'),
  solidScriptExampleSet('Floor', '[=-[$Box.Extents.Y]]'),
  solidScriptExampleSet('Top', '[$Box.Extents.Y]'),
  ...solidScriptExampleBlock('function', { name: 'Corner', parameters: 'Index, Grow' }, [
    solidScriptExampleSet('$Local.Angle', '[=[First] + [Arc] * [$Local.Index] / [Segments]]'),
    solidScriptExampleLine('return', {
      value:
        '[=Vector(Cos([$Local.Angle]) * ([Rx] + [$Local.Grow]), [Floor] + Sin([$Local.Angle]) * ([Ry] + [$Local.Grow]))]',
    }),
  ]),
  ...solidScriptExampleBlock('function', { name: 'Prism' }, [
    ...solidScriptExamplePolyhedron(
      solidScriptExampleBlock('for_each', { variable: 'P', list: '[Corners]' }, [
        ...solidScriptExampleIf(
          '[AlongX]',
          [solidScriptExamplePoint('[P.X], [P.Y], [=-[Across]]'), solidScriptExamplePoint('[P.X], [P.Y], [Across]')],
          [solidScriptExamplePoint('[=-[Across]], [P.Y], [P.X]'), solidScriptExamplePoint('[Across], [P.Y], [P.X]')],
        ),
      ]),
    ),
  ]),
  ...solidScriptExampleIf('[Rx] >= 0.0001 and [Ry] >= 0.0001', [
    ...solidScriptExampleIf('[Style] == "Wall With Opening"', [
      ...solidScriptExampleNote('The piers beside the opening.'),
      ...solidScriptExampleRepeat('Side', '0', '2', [
        solidScriptExampleSet('Inner', '[=[Side] == 0 ? -[Rx] : [Rx]]'),
        solidScriptExampleSet('Outer', '[=[Side] == 0 ? -[Half] : [Half]]'),
        solidScriptExampleLine('clear_variable', { name: 'Corners' }),
        solidScriptExampleArchCorner('[=Vector([Outer], [Floor])]'),
        solidScriptExampleArchCorner('[=Vector([Inner], [Floor])]'),
        solidScriptExampleArchCorner('[=Vector([Inner], [Top])]'),
        solidScriptExampleArchCorner('[=Vector([Outer], [Top])]'),
        solidScriptExampleLine('call', { name: 'Prism' }),
      ]),
    ]),
    ...solidScriptExampleRepeat('I', '0', '[Segments]', [
      solidScriptExampleSet('A', '[=Corner([I], 0)]'),
      solidScriptExampleSet('B', '[=Corner([I] + 1, 0)]'),
      solidScriptExampleLine('clear_variable', { name: 'Corners' }),
      ...solidScriptExampleIf(
        '[Style] == "Voussoir Ring"',
        [
          solidScriptExampleArchCorner('[A]'),
          solidScriptExampleArchCorner('[=Corner([I], [Thick])]'),
          solidScriptExampleArchCorner('[=Corner([I] + 1, [Thick])]'),
          solidScriptExampleArchCorner('[B]'),
        ],
        solidScriptExampleIf(
          '[Style] == "Wall With Opening"',
          [
            solidScriptExampleArchCorner('[A]'),
            solidScriptExampleArchCorner('[B]'),
            solidScriptExampleArchCorner('[=Vector([B.X], [Top])]'),
            solidScriptExampleArchCorner('[=Vector([A.X], [Top])]'),
          ],
          [
            solidScriptExampleArchCorner('[=Vector([A.X], [Floor])]'),
            solidScriptExampleArchCorner('[=Vector([B.X], [Floor])]'),
            solidScriptExampleArchCorner('[B]'),
            solidScriptExampleArchCorner('[A]'),
          ],
        ),
      ),
      solidScriptExampleLine('call', { name: 'Prism' }),
    ]),
  ]),
];
