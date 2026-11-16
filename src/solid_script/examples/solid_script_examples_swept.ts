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
 * Lines that size the ring of the box: [Rx] and [Ry] are half the width and
 * depth, [TurnSign] is 1 for counter-clockwise and [Limit] is the deepest a
 * wall can reach in before the ring closes.
 *
 * @param turnSign Turn direction as field text.
 * @returns Lines.
 */
function solidScriptExampleRingSize(turnSign = '1'): SolidScriptLine[] {
  return [
    solidScriptExampleSet('Rx', '[=[Box.Width] / 2]'),
    solidScriptExampleSet('Ry', '[=[Box.Depth] / 2]'),
    solidScriptExampleSet('TurnSign', turnSign),
    solidScriptExampleSet('Limit', '[=Min([Rx], [Ry]) ^ 2 / Max([Rx], [Ry])]'),
  ];
}

/**
 * The Ring Point function: a point on the oval of the box at an angle, moved
 * inward by a distance, at a height.
 */
const SOLID_SCRIPT_EXAMPLE_RING_POINT: readonly SolidScriptLine[] = solidScriptExampleBlock(
  'function',
  { name: 'RingPoint', parameters: 'Angle, Inset, Z' },
  [
    solidScriptExampleSet('Local.C', '[=Cos([Local.Angle])]'),
    solidScriptExampleSet('Local.S', '[=Sin([Local.Angle]) * [TurnSign]]'),
    solidScriptExampleSet('Local.Inward', '[=Normalize(Vector([Local.C] / [Rx], [Local.S] / [Ry]))]'),
    solidScriptExampleLine('return', {
      value:
        '[=Vector([Rx] * [Local.C] - [Local.Inset] * [Local.Inward.x], [Ry] * [Local.S] - [Local.Inset] * [Local.Inward.y], [Local.Z])]',
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
  solidScriptExampleNote('Pipe: the wall is cut into pieces around the turn; each piece joins two cross-sections.'),
  solidScriptExampleInput('Sides', 'count', '16', { label: 'Sides', min: '3', max: '64' }),
  solidScriptExampleInput('WallThickness', 'number', '0.25', { label: 'Wall Thickness', min: '0.01', max: '100' }),
  solidScriptExampleInput('Sweep', 'number', '360', { label: 'Sweep Angle', min: '1', max: '360' }),
  ...solidScriptExampleRingSize(),
  ...SOLID_SCRIPT_EXAMPLE_RING_POINT,
  solidScriptExampleSet('Wall', '[=Min([WallThickness], [Limit])]'),
  solidScriptExampleSegments('[Sides]'),
  ...solidScriptExampleRepeat('Piece', '0', '[=[Segments] - 1]', [
    ...solidScriptExamplePolyhedron(
      solidScriptExampleRepeat('Edge', '0', '1', [
        solidScriptExampleSet('Angle', '[=[Sweep] * ([Piece] + [Edge]) / [Segments]]'),
        solidScriptExamplePoint('[=RingPoint([Angle], 0, -[Box.Height] / 2)]'),
        solidScriptExamplePoint('[=RingPoint([Angle], [Wall], -[Box.Height] / 2)]'),
        solidScriptExamplePoint('[=RingPoint([Angle], [Wall], [Box.Height] / 2)]'),
        solidScriptExamplePoint('[=RingPoint([Angle], 0, [Box.Height] / 2)]'),
      ]),
    ),
  ]),
];

/** Port of the Torus generator. */
export const SOLID_SCRIPT_EXAMPLE_TORUS: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Torus: a round tube outline, copied around the ring; each piece joins two copies.'),
  solidScriptExampleInput('RingSides', 'count', '16', { label: 'Ring Sides', min: '3', max: '64' }),
  solidScriptExampleInput('TubeSides', 'count', '8', { label: 'Tube Sides', min: '3', max: '32' }),
  solidScriptExampleInput('Thickness', 'number', '0.25', { label: 'Tube Thickness', min: '0.02', max: '0.5' }),
  solidScriptExampleInput('Sweep', 'number', '360', { label: 'Sweep Angle', min: '1', max: '360' }),
  ...solidScriptExampleRingSize(),
  ...SOLID_SCRIPT_EXAMPLE_RING_POINT,
  solidScriptExampleSet('Tube', '[=Min([Thickness] * Min([Rx], [Ry]), [Limit] / 2)]'),
  solidScriptExampleNote('The tube outline, stretched so it reaches from -1 to 1 both ways.'),
  solidScriptExampleSet('Low', '1, 1'),
  solidScriptExampleSet('High', '-1, -1'),
  ...solidScriptExampleRepeat('I', '0', '[=[TubeSides] - 1]', [
    solidScriptExampleSet('Turn', '[=360 * ([I] + 0.5) / [TubeSides]]'),
    solidScriptExampleSet('Low', '[=Min([Low.x], Cos([Turn]))], [=Min([Low.y], Sin([Turn]))]'),
    solidScriptExampleSet('High', '[=Max([High.x], Cos([Turn]))], [=Max([High.y], Sin([Turn]))]'),
  ]),
  solidScriptExampleSegments('[RingSides]'),
  ...solidScriptExampleRepeat('Piece', '0', '[=[Segments] - 1]', [
    ...solidScriptExamplePolyhedron(
      solidScriptExampleRepeat('Edge', '0', '1', [
        solidScriptExampleSet('Angle', '[=[Sweep] * ([Piece] + [Edge]) / [Segments]]'),
        ...solidScriptExampleRepeat('I', '0', '[=[TubeSides] - 1]', [
          solidScriptExampleSet('Turn', '[=360 * ([I] + 0.5) / [TubeSides]]'),
          solidScriptExampleSet('U', '[=(Cos([Turn]) - [Low.x]) / ([High.x] - [Low.x]) * 2 - 1]'),
          solidScriptExampleSet('V', '[=(Sin([Turn]) - [Low.y]) / ([High.y] - [Low.y]) * 2 - 1]'),
          solidScriptExamplePoint('[=RingPoint([Angle], [Tube] * (1 - [U]), [Box.Height] / 2 * [V])]'),
        ]),
      ]),
    ),
  ]),
];

/** Port of the Curved Stairs generator. */
export const SOLID_SCRIPT_EXAMPLE_CURVED_STAIRS: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Curved Stairs: each step turns a little further and sits a little higher.'),
  solidScriptExampleInput('Steps', 'count', '12', { label: 'Steps', min: '2', max: '128' }),
  solidScriptExampleInput('Sweep', 'number', '270', { label: 'Sweep Angle', min: '1', max: '1440' }),
  solidScriptExampleInput('InnerRadius', 'number', '0.3', { label: 'Inner Radius', min: '0', max: '0.95' }),
  solidScriptExampleInput('Direction', 'choice', 'ccw', { label: 'Direction', choices: 'ccw, cw' }),
  solidScriptExampleInput('StepDetail', 'count', '2', { label: 'Step Detail', min: '1', max: '16' }),
  solidScriptExampleInput('FillToFloor', 'switch', 'true', { label: 'Fill To Floor' }),
  solidScriptExampleInput('StepThickness', 'number', '0.2', { label: 'Step Thickness', min: '0.01', max: '100' }),
  solidScriptExampleSet('TurnSign', '1'),
  ...solidScriptExampleIf('[Direction] == "cw"', [solidScriptExampleSet('TurnSign', '-1')]),
  solidScriptExampleSet('Turn', '[=[Sweep] / [Steps]]'),
  solidScriptExampleSet('Rise', '[=[Box.Height] / [Steps]]'),
  solidScriptExampleSet('Thick', '[StepThickness]'),
  ...solidScriptExampleIf('[FillToFloor]', [
    solidScriptExampleSet('Thick', '[=[Rise] * Min([Steps], [Steps] * 360 / [Sweep])]'),
  ]),
  ...solidScriptExampleRepeat('Step', '0', '[=[Steps] - 1]', [
    solidScriptExampleSet('Top', '[=-[Box.Height] / 2 + [Rise] * ([Step] + 1)]'),
    solidScriptExampleSet('Bottom', '[=Max(-[Box.Height] / 2, [Top] - [Thick])]'),
    ...solidScriptExampleRepeat('Part', '0', '[=[StepDetail] - 1]', [
      ...solidScriptExamplePolyhedron(
        solidScriptExampleRepeat('Edge', '0', '1', [
          solidScriptExampleSet('Angle', '[=[Turn] * ([Step] + ([Part] + [Edge]) / [StepDetail])]'),
          solidScriptExampleSet(
            'Out',
            '[=[Box.Width] / 2 * Cos([Angle])], [=[Box.Depth] / 2 * Sin([Angle]) * [TurnSign]], 0',
          ),
          solidScriptExamplePoint('[=[Out.x] * [InnerRadius]], [=[Out.y] * [InnerRadius]], [Bottom]'),
          solidScriptExamplePoint('[Out.x], [Out.y], [Bottom]'),
          solidScriptExamplePoint('[Out.x], [Out.y], [Top]'),
          solidScriptExamplePoint('[=[Out.x] * [InnerRadius]], [=[Out.y] * [InnerRadius]], [Top]'),
        ]),
      ),
    ]),
  ]),
];
