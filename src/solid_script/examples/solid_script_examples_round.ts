import { curveEncode } from '@/curve/model/curve_codec.js';
import { curvePresetBuild } from '@/curve/model/curve_preset.js';
import { CURVE_PRESET_COLUMN_CLASSIC } from '@/curve/model/curve_preset_architecture.js';
import type { SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import {
  SOLID_SCRIPT_EXAMPLE_BOX_INPUTS,
  solidScriptExampleBlock,
  solidScriptExampleIf,
  solidScriptExampleLine,
  solidScriptExampleInput,
  solidScriptExampleNote,
  solidScriptExamplePoint,
  solidScriptExamplePolyhedron,
  solidScriptExampleRepeat,
  solidScriptExampleSet,
} from './solid_script_example_lines.js';

/** Sides Input of the round shapes. */
const SOLID_SCRIPT_EXAMPLE_SIDES = solidScriptExampleInput('Sides', 'count', '16', {
  label: 'Sides',
  min: '3',
  max: '64',
});

/**
 * Lines that add one ring of corners around the middle.
 *
 * @param scale Ring size compared to the widest ring, as field text.
 * @param z Height of the ring, as field text.
 * @returns Lines.
 */
function solidScriptExampleRing(scale: string, z: string): SolidScriptLine[] {
  return solidScriptExampleRepeat('I', '0', '[=[Sides] - 1]', [
    solidScriptExampleSet('Angle', '[=([I] + 0.5) * 360 / [Sides]]'),
    solidScriptExamplePoint(
      `[=cos([Angle]) * [Width] / 2 * ${scale}], [=-sin([Angle]) * [Depth] / 2 * ${scale}], ${z}`,
    ),
  ]);
}

/**
 * Lines that add a ring, or a single point where the ring has shrunk to
 * nothing, such as the tip of a cone.
 *
 * @param scale Ring size compared to the widest ring, as field text.
 * @param z Height of the ring, as field text.
 * @returns Lines.
 */
function solidScriptExampleRingOrTip(scale: string, z: string): SolidScriptLine[] {
  return solidScriptExampleIf(
    `${scale} <= 0.000000001`,
    [solidScriptExamplePoint(`0, 0, ${z}`)],
    solidScriptExampleRing(scale, z),
  );
}

/** Port of the Cylinder generator. */
export const SOLID_SCRIPT_EXAMPLE_CYLINDER: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Cylinder: a ring of corners at the bottom and one at the top, wrapped into one solid.'),
  ...SOLID_SCRIPT_EXAMPLE_BOX_INPUTS,
  SOLID_SCRIPT_EXAMPLE_SIDES,
  ...solidScriptExamplePolyhedron([
    ...solidScriptExampleRing('1', '[=-[Height] / 2]'),
    ...solidScriptExampleRing('1', '[=[Height] / 2]'),
  ]),
];

/** Port of the Cone generator. */
export const SOLID_SCRIPT_EXAMPLE_CONE: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Cone: a ring at the bottom and a smaller ring, or a tip, at the top.'),
  ...SOLID_SCRIPT_EXAMPLE_BOX_INPUTS,
  SOLID_SCRIPT_EXAMPLE_SIDES,
  solidScriptExampleInput('TopRadius', 'number', '0', { label: 'Top Radius', min: '0', max: '1' }),
  ...solidScriptExamplePolyhedron([
    ...solidScriptExampleRing('1', '[=-[Height] / 2]'),
    ...solidScriptExampleRingOrTip('[TopRadius]', '[=[Height] / 2]'),
  ]),
];

/** Port of the Sphere generator. */
export const SOLID_SCRIPT_EXAMPLE_SPHERE: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Sphere: rings from the bottom pole to the top pole, each sized by how far round it is.'),
  ...SOLID_SCRIPT_EXAMPLE_BOX_INPUTS,
  SOLID_SCRIPT_EXAMPLE_SIDES,
  solidScriptExampleInput('Coverage', 'choice', 'full', { label: 'Shape', choices: 'full, dome' }),
  solidScriptExampleInput('Rings', 'count', '8', { label: 'Rings', min: '2', max: '32' }),
  solidScriptExampleSet('From', '-90'),
  solidScriptExampleSet('Equator', '0'),
  solidScriptExampleSet('Rise', '[=[Height] / 2]'),
  ...solidScriptExampleIf('[Coverage] == "dome"', [
    solidScriptExampleSet('From', '0'),
    solidScriptExampleSet('Equator', '[=-[Height] / 2]'),
    solidScriptExampleSet('Rise', '[Height]'),
  ]),
  ...solidScriptExamplePolyhedron(
    solidScriptExampleRepeat('Ring', '0', '[Rings]', [
      solidScriptExampleSet('Latitude', '[=[From] + (90 - [From]) * [Ring] / [Rings]]'),
      ...solidScriptExampleRingOrTip('[=cos([Latitude])]', '[=[Equator] + [Rise] * sin([Latitude])]'),
    ]),
  ),
];

/** Port of the Capsule generator. */
export const SOLID_SCRIPT_EXAMPLE_CAPSULE: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Capsule: a round end at the bottom and at the top, joined by straight sides.'),
  ...SOLID_SCRIPT_EXAMPLE_BOX_INPUTS,
  SOLID_SCRIPT_EXAMPLE_SIDES,
  solidScriptExampleInput('CapRings', 'count', '4', { label: 'Cap Rings', min: '1', max: '16' }),
  solidScriptExampleSet('Cap', '[=min([Width] / 2, [Height] / 2)]'),
  ...solidScriptExamplePolyhedron(
    solidScriptExampleRepeat('End', '0', '1', [
      solidScriptExampleSet('Middle', '[=-[Height] / 2 + [Cap] + [End] * ([Height] - 2 * [Cap])]'),
      ...solidScriptExampleRepeat('Ring', '0', '[CapRings]', [
        solidScriptExampleSet('Latitude', '[=-90 + 90 * [End] + 90 * [Ring] / [CapRings]]'),
        ...solidScriptExampleRingOrTip('[=cos([Latitude])]', '[=[Middle] + [Cap] * sin([Latitude])]'),
      ]),
    ]),
  ),
];

/**
 * The classic column profile a new Column starts with, without its fixed
 * heights.
 */
const { height: _height, ...SOLID_SCRIPT_EXAMPLE_COLUMN_CLASSIC } = CURVE_PRESET_COLUMN_CLASSIC;

/** The classic profile as the text a Curve input holds. */
const SOLID_SCRIPT_EXAMPLE_COLUMN_PROFILE = curveEncode(curvePresetBuild(SOLID_SCRIPT_EXAMPLE_COLUMN_CLASSIC));

/** Port of the Column generator, for round sections. */
export const SOLID_SCRIPT_EXAMPLE_COLUMN: readonly SolidScriptLine[] = [
  solidScriptExampleNote(
    'Column: the Profile curve is the radius along the height. Pieces that bulge outward join into one solid; where the curve turns inward a new solid starts.',
  ),
  ...SOLID_SCRIPT_EXAMPLE_BOX_INPUTS,
  solidScriptExampleInput('Profile', 'curve', SOLID_SCRIPT_EXAMPLE_COLUMN_PROFILE, { label: 'Profile' }),
  solidScriptExampleInput('Sides', 'choice', '8', { label: 'Sides', choices: '4, 6, 8, 12, 16, 24, 32' }),
  solidScriptExampleInput('Aspect', 'number', '1', { label: 'Depth / Width', min: '0.05', max: '20' }),
  solidScriptExampleSet('Radius', '[=min([Width], [Depth] / [Aspect]) / 2]'),
  solidScriptExampleSet('Stations', '[=profile_points([Profile], [Height], [Radius])]'),
  solidScriptExampleNote('Sort the stations into runs: x is the height, y the radius, z the run.'),
  solidScriptExampleLine('clear_variable', { name: 'Marks' }),
  solidScriptExampleSet('Run', '-1'),
  solidScriptExampleSet('Open', 'no'),
  solidScriptExampleSet('Slope', '0'),
  ...solidScriptExampleRepeat('K', '0', '[=len([Stations]) - 2]', [
    solidScriptExampleSet('A', '[Stations([K])]'),
    solidScriptExampleSet('B', '[Stations([=[K] + 1])]'),
    solidScriptExampleSet('Rise', '[=[B.x] - [A.x]]'),
    ...solidScriptExampleIf('abs([Rise]) > 0.000001 or abs([B.y] - [A.y]) > 0.000001', [
      ...solidScriptExampleIf(
        '[Rise] <= 0.000001 or max([A.y], [B.y]) <= 0.000001',
        [solidScriptExampleSet('Open', 'no')],
        [
          solidScriptExampleSet('Step', '[=([B.y] - [A.y]) / [Rise]]'),
          ...solidScriptExampleIf(
            '[Open] and [Step] <= [Slope] + 0.000001',
            [
              ...solidScriptExampleIf('abs([Step] - [Slope]) <= 0.000000001', [
                solidScriptExampleLine('remove_item', { target: 'Marks()' }),
              ]),
              solidScriptExampleLine('add_item', { value: '[=vector([B.x], [B.y], [Run])]', list: 'Marks' }),
            ],
            [
              solidScriptExampleSet('Run', '[=[Run] + 1]'),
              solidScriptExampleLine('add_item', { value: '[=vector([A.x], [A.y], [Run])]', list: 'Marks' }),
              solidScriptExampleLine('add_item', { value: '[=vector([B.x], [B.y], [Run])]', list: 'Marks' }),
              solidScriptExampleSet('Open', 'yes'),
            ],
          ),
          solidScriptExampleSet('Slope', '[Step]'),
        ],
      ),
    ]),
  ]),
  solidScriptExampleNote('Each run is one solid: a ring of corners per station, or a tip where the radius is zero.'),
  ...solidScriptExampleRepeat('R', '0', '[Run]', [
    ...solidScriptExamplePolyhedron(
      solidScriptExampleBlock('for_each', { variable: 'M', list: '[Marks]' }, [
        ...solidScriptExampleIf('[M.z] == [R]', [
          solidScriptExampleSet('Z', '[=[M.x] - [Height] / 2]'),
          ...solidScriptExampleIf(
            '[M.y] <= 0.000001',
            [solidScriptExamplePoint('0, 0, [Z]')],
            solidScriptExampleRepeat('I', '0', '[=[Sides] - 1]', [
              solidScriptExampleSet('Angle', '[=([I] + 0.5) * 360 / [Sides]]'),
              solidScriptExamplePoint('[=cos([Angle]) * [M.y]], [=-sin([Angle]) * [M.y] * [Aspect]], [Z]'),
            ]),
          ),
        ]),
      ]),
    ),
  ]),
];
