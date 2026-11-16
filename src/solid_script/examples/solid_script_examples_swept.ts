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
    solidScriptExampleSet('rx', '[=[width] / 2]'),
    solidScriptExampleSet('ry', '[=[depth] / 2]'),
    solidScriptExampleSet('turnSign', turnSign),
    solidScriptExampleSet('limit', '[=min([rx], [ry]) ^ 2 / max([rx], [ry])]'),
  ];
}

/**
 * The Ring Point function: a point on the oval of the box at an angle, moved
 * inward by a distance, at a height.
 */
const SOLID_SCRIPT_EXAMPLE_RING_POINT: readonly SolidScriptLine[] = solidScriptExampleBlock(
  'function',
  { name: 'ringPoint', parameters: 'angle, inset, z' },
  [
    solidScriptExampleSet('local.c', '[=cos([local.angle])]'),
    solidScriptExampleSet('local.s', '[=sin([local.angle]) * [turnSign]]'),
    solidScriptExampleSet('local.inward', '[=normalize(vector([local.c] / [rx], [local.s] / [ry]))]'),
    solidScriptExampleLine('return', {
      value:
        '[=vector([rx] * [local.c] - [local.inset] * [local.inward.x], [ry] * [local.s] - [local.inset] * [local.inward.y], [local.z])]',
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
  return solidScriptExampleSet('segments', `[=max(1, ceil(${sides} * [sweep] / 360 - 0.000000001))]`);
}

/** Port of the Pipe generator. */
export const SOLID_SCRIPT_EXAMPLE_PIPE: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Pipe: the wall is cut into pieces around the turn; each piece joins two cross-sections.'),
  ...SOLID_SCRIPT_EXAMPLE_BOX_INPUTS,
  solidScriptExampleInput('sides', 'count', '16', { label: 'Sides', min: '3', max: '64' }),
  solidScriptExampleInput('wallThickness', 'number', '0.25', { label: 'Wall Thickness', min: '0.01', max: '100' }),
  solidScriptExampleInput('sweep', 'number', '360', { label: 'Sweep Angle', min: '1', max: '360' }),
  ...solidScriptExampleRingSize(),
  ...SOLID_SCRIPT_EXAMPLE_RING_POINT,
  solidScriptExampleSet('wall', '[=min([wallThickness], [limit])]'),
  solidScriptExampleSegments('[sides]'),
  ...solidScriptExampleRepeat('piece', '0', '[=[segments] - 1]', [
    ...solidScriptExamplePolyhedron(
      solidScriptExampleRepeat('edge', '0', '1', [
        solidScriptExampleSet('angle', '[=[sweep] * ([piece] + [edge]) / [segments]]'),
        solidScriptExamplePoint('[=ringPoint([angle], 0, -[height] / 2)]'),
        solidScriptExamplePoint('[=ringPoint([angle], [wall], -[height] / 2)]'),
        solidScriptExamplePoint('[=ringPoint([angle], [wall], [height] / 2)]'),
        solidScriptExamplePoint('[=ringPoint([angle], 0, [height] / 2)]'),
      ]),
    ),
  ]),
];

/** Port of the Torus generator. */
export const SOLID_SCRIPT_EXAMPLE_TORUS: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Torus: a round tube outline, copied around the ring; each piece joins two copies.'),
  ...SOLID_SCRIPT_EXAMPLE_BOX_INPUTS,
  solidScriptExampleInput('ringSides', 'count', '16', { label: 'Ring Sides', min: '3', max: '64' }),
  solidScriptExampleInput('tubeSides', 'count', '8', { label: 'Tube Sides', min: '3', max: '32' }),
  solidScriptExampleInput('thickness', 'number', '0.25', { label: 'Tube Thickness', min: '0.02', max: '0.5' }),
  solidScriptExampleInput('sweep', 'number', '360', { label: 'Sweep Angle', min: '1', max: '360' }),
  ...solidScriptExampleRingSize(),
  ...SOLID_SCRIPT_EXAMPLE_RING_POINT,
  solidScriptExampleSet('tube', '[=min([thickness] * min([rx], [ry]), [limit] / 2)]'),
  solidScriptExampleNote('The tube outline, stretched so it reaches from -1 to 1 both ways.'),
  solidScriptExampleSet('low', '1, 1'),
  solidScriptExampleSet('high', '-1, -1'),
  ...solidScriptExampleRepeat('i', '0', '[=[tubeSides] - 1]', [
    solidScriptExampleSet('turn', '[=360 * ([i] + 0.5) / [tubeSides]]'),
    solidScriptExampleSet('low', '[=min([low.x], cos([turn]))], [=min([low.y], sin([turn]))]'),
    solidScriptExampleSet('high', '[=max([high.x], cos([turn]))], [=max([high.y], sin([turn]))]'),
  ]),
  solidScriptExampleSegments('[ringSides]'),
  ...solidScriptExampleRepeat('piece', '0', '[=[segments] - 1]', [
    ...solidScriptExamplePolyhedron(
      solidScriptExampleRepeat('edge', '0', '1', [
        solidScriptExampleSet('angle', '[=[sweep] * ([piece] + [edge]) / [segments]]'),
        ...solidScriptExampleRepeat('i', '0', '[=[tubeSides] - 1]', [
          solidScriptExampleSet('turn', '[=360 * ([i] + 0.5) / [tubeSides]]'),
          solidScriptExampleSet('u', '[=(cos([turn]) - [low.x]) / ([high.x] - [low.x]) * 2 - 1]'),
          solidScriptExampleSet('v', '[=(sin([turn]) - [low.y]) / ([high.y] - [low.y]) * 2 - 1]'),
          solidScriptExamplePoint('[=ringPoint([angle], [tube] * (1 - [u]), [height] / 2 * [v])]'),
        ]),
      ]),
    ),
  ]),
];

/** Port of the Curved Stairs generator. */
export const SOLID_SCRIPT_EXAMPLE_CURVED_STAIRS: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Curved Stairs: each step turns a little further and sits a little higher.'),
  ...SOLID_SCRIPT_EXAMPLE_BOX_INPUTS,
  solidScriptExampleInput('steps', 'count', '12', { label: 'Steps', min: '2', max: '128' }),
  solidScriptExampleInput('sweep', 'number', '270', { label: 'Sweep Angle', min: '1', max: '1440' }),
  solidScriptExampleInput('innerRadius', 'number', '0.3', { label: 'Inner Radius', min: '0', max: '0.95' }),
  solidScriptExampleInput('direction', 'choice', 'ccw', { label: 'Direction', choices: 'ccw, cw' }),
  solidScriptExampleInput('stepDetail', 'count', '2', { label: 'Step Detail', min: '1', max: '16' }),
  solidScriptExampleInput('fillToFloor', 'switch', 'true', { label: 'Fill To Floor' }),
  solidScriptExampleInput('stepThickness', 'number', '0.2', { label: 'Step Thickness', min: '0.01', max: '100' }),
  solidScriptExampleSet('turnSign', '1'),
  ...solidScriptExampleIf('[direction] == "cw"', [solidScriptExampleSet('turnSign', '-1')]),
  solidScriptExampleSet('turn', '[=[sweep] / [steps]]'),
  solidScriptExampleSet('rise', '[=[height] / [steps]]'),
  solidScriptExampleSet('thick', '[stepThickness]'),
  ...solidScriptExampleIf('[fillToFloor]', [
    solidScriptExampleSet('thick', '[=[rise] * min([steps], [steps] * 360 / [sweep])]'),
  ]),
  ...solidScriptExampleRepeat('step', '0', '[=[steps] - 1]', [
    solidScriptExampleSet('top', '[=-[height] / 2 + [rise] * ([step] + 1)]'),
    solidScriptExampleSet('bottom', '[=max(-[height] / 2, [top] - [thick])]'),
    ...solidScriptExampleRepeat('part', '0', '[=[stepDetail] - 1]', [
      ...solidScriptExamplePolyhedron(
        solidScriptExampleRepeat('edge', '0', '1', [
          solidScriptExampleSet('angle', '[=[turn] * ([step] + ([part] + [edge]) / [stepDetail])]'),
          solidScriptExampleSet('out', '[=[width] / 2 * cos([angle])], [=[depth] / 2 * sin([angle]) * [turnSign]], 0'),
          solidScriptExamplePoint('[=[out.x] * [innerRadius]], [=[out.y] * [innerRadius]], [bottom]'),
          solidScriptExamplePoint('[out.x], [out.y], [bottom]'),
          solidScriptExamplePoint('[out.x], [out.y], [top]'),
          solidScriptExamplePoint('[=[out.x] * [innerRadius]], [=[out.y] * [innerRadius]], [top]'),
        ]),
      ),
    ]),
  ]),
];
