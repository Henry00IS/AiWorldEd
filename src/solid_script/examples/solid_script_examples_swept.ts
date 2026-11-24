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

/**
 * Lines that size the ring of the box: [Rx] and [Rz] are half the width and
 * depth, and [Limit] is the deepest a wall can reach in before the ring
 * closes.
 *
 * @returns Lines.
 */
function solidScriptExampleRingSize(): SolidScriptLine[] {
  return [
    solidScriptExampleSet('Rx', '[$Box.Extents.X]'),
    solidScriptExampleSet('Rz', '[$Box.Extents.Z]'),
    solidScriptExampleSet('Limit', '[=Min([Rx], [Rz]) ^ 2 / Max([Rx], [Rz])]'),
  ];
}

/**
 * The Wall Point function: a point on the oval of the box at an angle, moved
 * inward by a distance, at a height.
 */
const SOLID_SCRIPT_EXAMPLE_WALL_POINT: readonly SolidScriptLine[] = solidScriptExampleBlock(
  'function',
  { name: 'WallPoint', parameters: 'Angle, Inset, Height' },
  [
    solidScriptExampleSet('$Local.In', '[=Normalize(Vector(Cos([$Local.Angle]) / [Rx], -Sin([$Local.Angle]) / [Rz]))]'),
    solidScriptExampleLine('return', {
      value:
        '[=RingPoint([$Local.Angle], [$Box.Size], [$Local.Height]) - [$Local.Inset] * Vector([$Local.In.X], 0, [$Local.In.Y])]',
    }),
  ],
);

/**
 * Lines that set [Segments]: how many pieces a sweep is cut into.
 *
 * @param sides Pieces in a whole turn, as field text.
 * @returns Line.
 */
function solidScriptExampleSegments(sides: string): SolidScriptLine {
  return solidScriptExampleSet('Segments', `[=Max(1, Ceil(${sides} * [Sweep] / 360 - 0.000000001))]`);
}

/** Port of the Pipe generator. */
export const SOLID_SCRIPT_EXAMPLE_PIPE: readonly SolidScriptLine[] = [
  ...solidScriptExampleNote('Pipe: the wall is cut into pieces around the turn; each piece joins two cross-sections.'),
  solidScriptExampleInput('Sides', 'Count', '16', { label: 'Sides', min: '3', max: '64' }),
  solidScriptExampleInput('WallThickness', 'Number', '0.25', { label: 'Wall Thickness', min: '0.01', max: '100' }),
  solidScriptExampleInput('Sweep', 'Number', '360', { label: 'Sweep Angle', min: '1', max: '360' }),
  ...solidScriptExampleRingSize(),
  ...solidScriptExampleNote(
    'Function WallPoint gives a point back with Return, so later lines can write [=WallPoint(...)] in a formula. [$Local.Angle], [$Local.Inset] and [$Local.Height] are the values for this one call. RingPoint gives the point on the oval of the box.',
  ),
  ...SOLID_SCRIPT_EXAMPLE_WALL_POINT,
  solidScriptExampleSet('Wall', '[=Min([WallThickness], [Limit])]'),
  solidScriptExampleSegments('[Sides]'),
  ...solidScriptExampleRepeat('Piece', '0', '[Segments]', [
    ...solidScriptExamplePolyhedron(
      solidScriptExampleRepeat('Edge', '0', '2', [
        solidScriptExampleSet('Angle', '[=[Sweep] * ([Piece] + [Edge]) / [Segments]]'),
        solidScriptExamplePoint('[=WallPoint([Angle], 0, -[$Box.Extents.Y])]'),
        solidScriptExamplePoint('[=WallPoint([Angle], [Wall], -[$Box.Extents.Y])]'),
        solidScriptExamplePoint('[=WallPoint([Angle], [Wall], [$Box.Extents.Y])]'),
        solidScriptExamplePoint('[=WallPoint([Angle], 0, [$Box.Extents.Y])]'),
      ]),
    ),
  ]),
];

/** Port of the Torus generator. */
export const SOLID_SCRIPT_EXAMPLE_TORUS: readonly SolidScriptLine[] = [
  ...solidScriptExampleNote('Torus: a round tube profile, copied around the ring; each piece joins two copies.'),
  solidScriptExampleInput('RingSides', 'Count', '16', { label: 'Ring Sides', min: '3', max: '64' }),
  solidScriptExampleInput('TubeSides', 'Count', '8', { label: 'Tube Sides', min: '3', max: '32' }),
  solidScriptExampleInput('Thickness', 'Number', '0.25', { label: 'Tube Thickness', min: '0.02', max: '0.5' }),
  solidScriptExampleInput('Sweep', 'Number', '360', { label: 'Sweep Angle', min: '1', max: '360' }),
  ...solidScriptExampleRingSize(),
  ...SOLID_SCRIPT_EXAMPLE_WALL_POINT,
  solidScriptExampleSet('Tube', '[=Min([Thickness] * Min([Rx], [Rz]), [Limit] / 2)]'),
  ...solidScriptExampleNote('The tube profile, stretched so it reaches from -1 to 1 both ways.'),
  solidScriptExampleSet('Low', '1, 1'),
  solidScriptExampleSet('High', '-1, -1'),
  ...solidScriptExampleRepeat('I', '0', '[TubeSides]', [
    solidScriptExampleSet('Turn', '[=360 * ([I] + 0.5) / [TubeSides]]'),
    solidScriptExampleSet('Low', '[=Min([Low.X], Cos([Turn]))], [=Min([Low.Y], Sin([Turn]))]'),
    solidScriptExampleSet('High', '[=Max([High.X], Cos([Turn]))], [=Max([High.Y], Sin([Turn]))]'),
  ]),
  solidScriptExampleSegments('[RingSides]'),
  ...solidScriptExampleRepeat('Piece', '0', '[Segments]', [
    ...solidScriptExamplePolyhedron(
      solidScriptExampleRepeat('Edge', '0', '2', [
        solidScriptExampleSet('Angle', '[=[Sweep] * ([Piece] + [Edge]) / [Segments]]'),
        ...solidScriptExampleRepeat('I', '0', '[TubeSides]', [
          solidScriptExampleSet('Turn', '[=360 * ([I] + 0.5) / [TubeSides]]'),
          solidScriptExampleSet('U', '[=(Cos([Turn]) - [Low.X]) / ([High.X] - [Low.X]) * 2 - 1]'),
          solidScriptExampleSet('V', '[=(Sin([Turn]) - [Low.Y]) / ([High.Y] - [Low.Y]) * 2 - 1]'),
          solidScriptExamplePoint('[=WallPoint([Angle], [Tube] * (1 - [U]), [$Box.Extents.Y] * [V])]'),
        ]),
      ]),
    ),
  ]),
];

/** Port of the Curved Stairs generator. */
export const SOLID_SCRIPT_EXAMPLE_CURVED_STAIRS: readonly SolidScriptLine[] = [
  ...solidScriptExampleNote('Curved Stairs: each step turns a little further and sits a little higher.'),
  solidScriptExampleInput('Steps', 'Count', '12', { label: 'Steps', min: '2', max: '128' }),
  solidScriptExampleInput('Sweep', 'Number', '270', { label: 'Sweep Angle', min: '1', max: '1440' }),
  solidScriptExampleInput('InnerRadius', 'Number', '0.3', { label: 'Inner Radius', min: '0', max: '0.95' }),
  solidScriptExampleInput('Direction', 'Choice', 'Counter Clockwise', {
    label: 'Direction',
    choices: 'Counter Clockwise, Clockwise',
  }),
  solidScriptExampleInput('StepDetail', 'Count', '2', { label: 'Step Detail', min: '1', max: '16' }),
  solidScriptExampleInput('FillToFloor', 'Switch', 'Yes', { label: 'Fill To Floor' }),
  solidScriptExampleInput('StepThickness', 'Number', '0.2', { label: 'Step Thickness', min: '0.01', max: '100' }),
  solidScriptExampleSet('Turn', '[=[Sweep] / [Steps]]'),
  ...solidScriptExampleIf('[Direction] == "Clockwise"', [solidScriptExampleSet('Turn', '[=-[Turn]]')]),
  solidScriptExampleSet('Rise', '[=[$Box.Height] / [Steps]]'),
  solidScriptExampleSet('Thick', '[StepThickness]'),
  ...solidScriptExampleIf('[FillToFloor]', [
    solidScriptExampleSet('Thick', '[=[Rise] * Min([Steps], [Steps] * 360 / [Sweep])]'),
  ]),
  ...solidScriptExampleRepeat('Step', '0', '[Steps]', [
    solidScriptExampleSet('Top', '[=-[$Box.Extents.Y] + [Rise] * ([Step] + 1)]'),
    solidScriptExampleSet('Bottom', '[=Max(-[$Box.Extents.Y], [Top] - [Thick])]'),
    ...solidScriptExampleRepeat('Part', '0', '[StepDetail]', [
      ...solidScriptExamplePolyhedron(
        solidScriptExampleRepeat('Edge', '0', '2', [
          solidScriptExampleSet('Angle', '[=[Turn] * ([Step] + ([Part] + [Edge]) / [StepDetail])]'),
          solidScriptExampleSet('Out', '[=RingPoint([Angle], [$Box.Size])]'),
          solidScriptExamplePoint('[=[Out.X] * [InnerRadius]], [Bottom], [=[Out.Z] * [InnerRadius]]'),
          solidScriptExamplePoint('[Out.X], [Bottom], [Out.Z]'),
          solidScriptExamplePoint('[Out.X], [Top], [Out.Z]'),
          solidScriptExamplePoint('[=[Out.X] * [InnerRadius]], [Top], [=[Out.Z] * [InnerRadius]]'),
        ]),
      ),
    ]),
  ]),
];
