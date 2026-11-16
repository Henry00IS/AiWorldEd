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

/**
 * Lines that size the ring of the box: [rx] and [ry] are half the width and
 * depth, [turnSign] is 1 for counter-clockwise and [limit] is the deepest a
 * wall can reach in before the ring closes.
 *
 * @param turnSign Turn direction as field text.
 * @returns Lines.
 */
function solidScriptExampleRingSize(turnSign = '1'): SolidScriptLine[] {
  return [
    solidScriptExampleSet('Rx', '[=[Width] / 2]'),
    solidScriptExampleSet('Ry', '[=[Depth] / 2]'),
    solidScriptExampleSet('TurnSign', turnSign),
    solidScriptExampleSet('Limit', '[=min([Rx], [Ry]) ^ 2 / max([Rx], [Ry])]'),
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
    solidScriptExampleSet('local.c', '[=cos([local.Angle])]'),
    solidScriptExampleSet('local.s', '[=sin([local.Angle]) * [TurnSign]]'),
    solidScriptExampleSet('local.inward', '[=normalize(vector([local.C] / [Rx], [local.S] / [Ry]))]'),
    solidScriptExampleLine('return', {
      value:
        '[=vector([Rx] * [local.C] - [local.Inset] * [local.inward.x], [Ry] * [local.S] - [local.Inset] * [local.inward.y], [local.Z])]',
    }),
  ],
);

/**
 * Lines that set [segments]: how many pieces a sweep is cut into.
 *
 * @param sides Pieces in a whole turn, as field text.
 * @returns Line.
 */
function solidScriptExampleSegments(sides: string): SolidScriptLine {
  return solidScriptExampleSet('Segments', `[=max(1, ceil(${sides} * [Sweep] / 360 - 0.000000001))]`);
}

/** Port of the Pipe generator. */
export const SOLID_SCRIPT_EXAMPLE_PIPE: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Pipe: the wall is cut into pieces around the turn; each piece joins two cross-sections.'),
  ...SOLID_SCRIPT_EXAMPLE_BOX_INPUTS,
  solidScriptExampleInput('Sides', 'count', '16', { label: 'Sides', min: '3', max: '64' }),
  solidScriptExampleInput('WallThickness', 'number', '0.25', { label: 'Wall Thickness', min: '0.01', max: '100' }),
  solidScriptExampleInput('Sweep', 'number', '360', { label: 'Sweep Angle', min: '1', max: '360' }),
  ...solidScriptExampleRingSize(),
  ...SOLID_SCRIPT_EXAMPLE_RING_POINT,
  solidScriptExampleSet('Wall', '[=min([WallThickness], [Limit])]'),
  solidScriptExampleSegments('[Sides]'),
  ...solidScriptExampleRepeat('Piece', '0', '[=[Segments] - 1]', [
    ...solidScriptExamplePolyhedron(
      solidScriptExampleRepeat('Edge', '0', '1', [
        solidScriptExampleSet('Angle', '[=[Sweep] * ([Piece] + [Edge]) / [Segments]]'),
        solidScriptExamplePoint('[=RingPoint([Angle], 0, -[Height] / 2)]'),
        solidScriptExamplePoint('[=RingPoint([Angle], [Wall], -[Height] / 2)]'),
        solidScriptExamplePoint('[=RingPoint([Angle], [Wall], [Height] / 2)]'),
        solidScriptExamplePoint('[=RingPoint([Angle], 0, [Height] / 2)]'),
      ]),
    ),
  ]),
];

/** Port of the Torus generator. */
export const SOLID_SCRIPT_EXAMPLE_TORUS: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Torus: a round tube outline, copied around the ring; each piece joins two copies.'),
  ...SOLID_SCRIPT_EXAMPLE_BOX_INPUTS,
  solidScriptExampleInput('RingSides', 'count', '16', { label: 'Ring Sides', min: '3', max: '64' }),
  solidScriptExampleInput('TubeSides', 'count', '8', { label: 'Tube Sides', min: '3', max: '32' }),
  solidScriptExampleInput('Thickness', 'number', '0.25', { label: 'Tube Thickness', min: '0.02', max: '0.5' }),
  solidScriptExampleInput('Sweep', 'number', '360', { label: 'Sweep Angle', min: '1', max: '360' }),
  ...solidScriptExampleRingSize(),
  ...SOLID_SCRIPT_EXAMPLE_RING_POINT,
  solidScriptExampleSet('Tube', '[=min([Thickness] * min([Rx], [Ry]), [Limit] / 2)]'),
  solidScriptExampleNote('The tube outline, stretched so it reaches from -1 to 1 both ways.'),
  solidScriptExampleSet('Low', '1, 1'),
  solidScriptExampleSet('High', '-1, -1'),
  ...solidScriptExampleRepeat('I', '0', '[=[TubeSides] - 1]', [
    solidScriptExampleSet('Turn', '[=360 * ([I] + 0.5) / [TubeSides]]'),
    solidScriptExampleSet('Low', '[=min([Low.x], cos([Turn]))], [=min([Low.y], sin([Turn]))]'),
    solidScriptExampleSet('High', '[=max([High.x], cos([Turn]))], [=max([High.y], sin([Turn]))]'),
  ]),
  solidScriptExampleSegments('[RingSides]'),
  ...solidScriptExampleRepeat('Piece', '0', '[=[Segments] - 1]', [
    ...solidScriptExamplePolyhedron(
      solidScriptExampleRepeat('Edge', '0', '1', [
        solidScriptExampleSet('Angle', '[=[Sweep] * ([Piece] + [Edge]) / [Segments]]'),
        ...solidScriptExampleRepeat('I', '0', '[=[TubeSides] - 1]', [
          solidScriptExampleSet('Turn', '[=360 * ([I] + 0.5) / [TubeSides]]'),
          solidScriptExampleSet('U', '[=(cos([Turn]) - [Low.x]) / ([High.x] - [Low.x]) * 2 - 1]'),
          solidScriptExampleSet('V', '[=(sin([Turn]) - [Low.y]) / ([High.y] - [Low.y]) * 2 - 1]'),
          solidScriptExamplePoint('[=RingPoint([Angle], [Tube] * (1 - [U]), [Height] / 2 * [V])]'),
        ]),
      ]),
    ),
  ]),
];

/** Port of the Curved Stairs generator. */
export const SOLID_SCRIPT_EXAMPLE_CURVED_STAIRS: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Curved Stairs: each step turns a little further and sits a little higher.'),
  ...SOLID_SCRIPT_EXAMPLE_BOX_INPUTS,
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
  solidScriptExampleSet('Rise', '[=[Height] / [Steps]]'),
  solidScriptExampleSet('Thick', '[StepThickness]'),
  ...solidScriptExampleIf('[FillToFloor]', [
    solidScriptExampleSet('Thick', '[=[Rise] * min([Steps], [Steps] * 360 / [Sweep])]'),
  ]),
  ...solidScriptExampleRepeat('Step', '0', '[=[Steps] - 1]', [
    solidScriptExampleSet('Top', '[=-[Height] / 2 + [Rise] * ([Step] + 1)]'),
    solidScriptExampleSet('Bottom', '[=max(-[Height] / 2, [Top] - [Thick])]'),
    ...solidScriptExampleRepeat('Part', '0', '[=[StepDetail] - 1]', [
      ...solidScriptExamplePolyhedron(
        solidScriptExampleRepeat('Edge', '0', '1', [
          solidScriptExampleSet('Angle', '[=[Turn] * ([Step] + ([Part] + [Edge]) / [StepDetail])]'),
          solidScriptExampleSet('Out', '[=[Width] / 2 * cos([Angle])], [=[Depth] / 2 * sin([Angle]) * [TurnSign]], 0'),
          solidScriptExamplePoint('[=[Out.x] * [InnerRadius]], [=[Out.y] * [InnerRadius]], [Bottom]'),
          solidScriptExamplePoint('[Out.x], [Out.y], [Bottom]'),
          solidScriptExamplePoint('[Out.x], [Out.y], [Top]'),
          solidScriptExamplePoint('[=[Out.x] * [InnerRadius]], [=[Out.y] * [InnerRadius]], [Top]'),
        ]),
      ),
    ]),
  ]),
];
