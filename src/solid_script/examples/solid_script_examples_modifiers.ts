import type { SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptExampleBlock,
  solidScriptExampleIf,
  solidScriptExampleInput,
  solidScriptExampleLine,
  solidScriptExampleNote,
  solidScriptExampleRepeat,
  solidScriptExampleSet,
} from './solid_script_example_lines.js';

/**
 * Turns an editor axis name into a script direction. The editor is Y up and
 * scripts are Z up, so x is X, y is Z and z is -Y.
 *
 * @param name Variable holding x, y or z.
 * @returns Formula.
 */
function solidScriptExampleAxis(name: string): string {
  return `[=[${name}] == "x" ? Vector(1, 0, 0) : [${name}] == "y" ? Vector(0, 0, 1) : Vector(0, -1, 0)]`;
}

/** Sets Textures from the UV input, for Input Brushes. */
const SOLID_SCRIPT_EXAMPLE_TEXTURES: readonly SolidScriptLine[] = [
  solidScriptExampleSet('Textures', 'Move With Shape'),
  ...solidScriptExampleIf('[UV] == "world"', [solidScriptExampleSet('Textures', 'World Aligned')]),
];

/** Port of the Shear modifier. */
export const SOLID_SCRIPT_EXAMPLE_SHEAR: readonly SolidScriptLine[] = [
  solidScriptExampleNote(
    'Shear: slides the brushes it receives along one axis, more the further they are from their centre along another.',
  ),
  solidScriptExampleInput('Axis', 'choice', 'x', { label: 'Shear Axis', choices: 'x, y, z' }),
  solidScriptExampleInput('Along', 'choice', 'y', { label: 'Along', choices: 'x, y, z' }),
  solidScriptExampleInput('Mode', 'choice', 'angle', { label: 'Amount', choices: 'angle, factor' }),
  solidScriptExampleInput('Angle', 'number', '20', { label: 'Angle', min: '-85', max: '85' }),
  solidScriptExampleInput('Factor', 'number', '0.5', { label: 'Factor', min: '-10', max: '10' }),
  solidScriptExampleInput('UV', 'choice', 'copied', { label: 'Textures', choices: 'copied, world' }),
  ...SOLID_SCRIPT_EXAMPLE_TEXTURES,
  ...solidScriptExampleIf(
    '[Axis] == [Along]',
    [
      solidScriptExampleLine('echo', { value: 'Shear Axis and Along must differ; the brushes pass on unchanged.' }),
      solidScriptExampleLine('input_brushes', { textures: '[Textures]' }),
    ],
    [
      solidScriptExampleNote('The slide per metre: the tangent of the angle, or the factor itself.'),
      solidScriptExampleSet('Shear', '[=[Mode] == "factor" ? [Factor] : Tan([Angle])]'),
      solidScriptExampleSet('Slide', `[=(${solidScriptExampleAxis('Axis').slice(2, -1)}) * [Shear]]`),
      solidScriptExampleSet('Measure', solidScriptExampleAxis('Along')),
      solidScriptExampleNote('Each point moves by Slide times its distance from the centre along Measure.'),
      solidScriptExampleSet('Shift', '[=[Slide] * -Dot([Measure], [Input.Center])]'),
      ...solidScriptExampleBlock(
        'matrix',
        {
          row1: '[=1 + [Slide.x] * [Measure.x]], [=[Slide.x] * [Measure.y]], [=[Slide.x] * [Measure.z]], [Shift.x]',
          row2: '[=[Slide.y] * [Measure.x]], [=1 + [Slide.y] * [Measure.y]], [=[Slide.y] * [Measure.z]], [Shift.y]',
          row3: '[=[Slide.z] * [Measure.x]], [=[Slide.z] * [Measure.y]], [=1 + [Slide.z] * [Measure.z]], [Shift.z]',
        },
        [solidScriptExampleLine('input_brushes', { textures: '[Textures]' })],
      ),
    ],
  ),
];

/** Port of the Linear Array modifier. */
export const SOLID_SCRIPT_EXAMPLE_LINEAR_ARRAY: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Linear Array: repeats the brushes it receives along a line.'),
  solidScriptExampleInput('Count', 'count', '3', { label: 'Count', min: '1', max: '256' }),
  solidScriptExampleInput('Mode', 'choice', 'relative', { label: 'Spacing', choices: 'fixed, relative, fit, both' }),
  solidScriptExampleInput('Offset', 'vector', '2, 0, 0', { label: 'Step' }),
  solidScriptExampleInput('Relative', 'vector', '1, 0, 0', { label: 'Size ×' }),
  solidScriptExampleInput('Endpoint', 'vector', '8, 0, 0', { label: 'Distance' }),
  solidScriptExampleInput('UV', 'choice', 'copied', { label: 'Textures', choices: 'copied, world' }),
  ...SOLID_SCRIPT_EXAMPLE_TEXTURES,
  solidScriptExampleNote('Size × is a multiple of the size of what comes in: 1 places copies edge to edge.'),
  solidScriptExampleSet(
    'BySize',
    '[=Vector([Relative.x] * [Input.Size.x], [Relative.y] * [Input.Size.y], [Relative.z] * [Input.Size.z])]',
  ),
  solidScriptExampleSet('Step', '[Offset]'),
  ...solidScriptExampleIf('[Mode] == "relative"', [solidScriptExampleSet('Step', '[BySize]')]),
  ...solidScriptExampleIf('[Mode] == "both"', [solidScriptExampleSet('Step', '[=[Offset] + [BySize]]')]),
  ...solidScriptExampleIf('[Mode] == "fit"', [solidScriptExampleSet('Step', '[=[Endpoint] / Max(1, [Count] - 1)]')]),
  solidScriptExampleNote('Copy 0 is the original; each next copy moves one more Step.'),
  ...solidScriptExampleRepeat('I', '0', '[=[Count] - 1]', [
    ...solidScriptExampleBlock('translate', { v: '[=[Step] * [I]]' }, [
      solidScriptExampleLine('input_brushes', { textures: '[Textures]' }),
    ]),
  ]),
];

/**
 * Turns an editor side name such as -z into a script direction.
 *
 * @param name Variable holding the side.
 * @returns Formula.
 */
function solidScriptExampleSide(name: string): string {
  const axis = `Part([${name}], 1, 1)`;
  const sign = `(Part([${name}], 0, 1) == "-" ? -1 : 1)`;
  return `[=(${axis} == "x" ? Vector(1, 0, 0) : ${axis} == "y" ? Vector(0, 0, 1) : Vector(0, -1, 0)) * ${sign}]`;
}

/** Port of the Radial Array modifier (whole input as the centre). */
export const SOLID_SCRIPT_EXAMPLE_RADIAL_ARRAY: readonly SolidScriptLine[] = [
  solidScriptExampleNote(
    'Radial Array: repeats the brushes it receives around an axis, measured from the whole input.',
  ),
  solidScriptExampleInput('Count', 'count', '3', { label: 'Count', min: '1', max: '256' }),
  solidScriptExampleInput('Origin', 'choice', 'ring', { label: 'Original', choices: 'ring, centre' }),
  solidScriptExampleInput('Mode', 'choice', 'ring', { label: 'Distribution', choices: 'ring, arc, step' }),
  solidScriptExampleInput('Axis', 'choice', 'y', { label: 'Axis', choices: 'x, y, z' }),
  solidScriptExampleInput('Sweep', 'number', '90', { label: 'Sweep °', min: '-360', max: '360' }),
  solidScriptExampleInput('StepAngle', 'number', '15', { label: 'Step °', min: '-360', max: '360' }),
  solidScriptExampleInput('Radius', 'number', '2', { label: 'Radius', min: '0' }),
  solidScriptExampleInput('CentreSide', 'choice', '-z', { label: 'Ring Centre', choices: '-z, +z, -x, +x, -y, +y' }),
  solidScriptExampleInput('Start', 'number', '0', { label: 'Start °' }),
  solidScriptExampleInput('RadiusOffset', 'number', '0', { label: 'Radius Offset' }),
  solidScriptExampleInput('Rise', 'number', '0', { label: 'Rise per Step' }),
  solidScriptExampleInput('RotateCopies', 'switch', 'true', { label: 'Rotate Copies' }),
  solidScriptExampleInput('Pivot', 'vector', '0, 0, 0', { label: 'Pivot' }),
  solidScriptExampleInput('UV', 'choice', 'copied', { label: 'Textures', choices: 'copied, world' }),
  ...SOLID_SCRIPT_EXAMPLE_TEXTURES,
  solidScriptExampleSet('K', solidScriptExampleAxis('Axis')),
  solidScriptExampleSet('Centre', '[Input.Center]'),
  solidScriptExampleNote('The angle between copies: a full ring, an arc or a fixed step.'),
  solidScriptExampleSet('Turn', '[=360 / [Count]]'),
  ...solidScriptExampleIf('[Mode] == "step"', [solidScriptExampleSet('Turn', '[StepAngle]')]),
  ...solidScriptExampleIf('[Mode] == "arc"', [solidScriptExampleSet('Turn', '[=[Sweep] / Max(1, [Count] - 1)]')]),
  solidScriptExampleNote(
    'Around is the point the copies turn about, Push moves them off the axis, First is the first angle.',
  ),
  solidScriptExampleSet('Around', '[Centre]'),
  solidScriptExampleSet('Push', '[=Vector(0, 0, 0)]'),
  solidScriptExampleSet('First', '0'),
  solidScriptExampleSet('Side', '[K]'),
  solidScriptExampleSet('Out', '[K]'),
  ...solidScriptExampleIf(
    '[Origin] == "ring"',
    [
      solidScriptExampleNote('The ring centre lies Radius away on the chosen side, across the axis.'),
      solidScriptExampleSet('Side', solidScriptExampleSide('CentreSide')),
      solidScriptExampleSet('Side', '[=[Side] - [K] * Dot([Side], [K])]'),
      ...solidScriptExampleIf('[=Dot([Side], [Side]) < 1e-12]', [
        solidScriptExampleSet('Side', '[=[Axis] == "z" ? Vector(0, 0, -1) : Vector(0, 1, 0)]'),
      ]),
      solidScriptExampleSet('Around', '[=[Centre] + Normalize([Side]) * [Radius]]'),
    ],
    [
      solidScriptExampleNote('Around the pivot: copies start at Start ° and move Radius Offset away from the axis.'),
      solidScriptExampleSet('Around', '[Pivot]'),
      solidScriptExampleSet('Out', '[=[Centre] - [Around]]'),
      solidScriptExampleSet('Out', '[=[Out] - [K] * Dot([Out], [K])]'),
      ...solidScriptExampleIf('[=Dot([Out], [Out]) < 1e-12]', [
        solidScriptExampleSet('Out', '[=[Axis] == "y" ? Vector(1, 0, 0) : Vector(0, 0, 1)]'),
      ]),
      solidScriptExampleSet('Push', '[=Normalize([Out]) * [RadiusOffset]]'),
      solidScriptExampleSet('First', '[Start]'),
    ],
  ),
  solidScriptExampleNote('Copy I turns by First + I × Turn around K through Around, then rises along K.'),
  solidScriptExampleNote('Copy 0 is the original.'),
  solidScriptExampleLine('input_brushes', { textures: '[Textures]' }),
  ...solidScriptExampleIf('[Count] > 1', [
    ...solidScriptExampleRepeat('I', '1', '[=[Count] - 1]', [
      solidScriptExampleSet('A', '[=[First] + [I] * [Turn]]'),
      solidScriptExampleSet('C', '[=Cos([A])]'),
      solidScriptExampleSet('S', '[=Sin([A])]'),
      solidScriptExampleSet('T', '[=1 - [C]]'),
      solidScriptExampleSet(
        'R1',
        '[=Vector([C] + [T] * [K.x] * [K.x], [T] * [K.x] * [K.y] - [S] * [K.z], [T] * [K.x] * [K.z] + [S] * [K.y])]',
      ),
      solidScriptExampleSet(
        'R2',
        '[=Vector([T] * [K.x] * [K.y] + [S] * [K.z], [C] + [T] * [K.y] * [K.y], [T] * [K.y] * [K.z] - [S] * [K.x])]',
      ),
      solidScriptExampleSet(
        'R3',
        '[=Vector([T] * [K.x] * [K.z] - [S] * [K.y], [T] * [K.y] * [K.z] + [S] * [K.x], [C] + [T] * [K.z] * [K.z])]',
      ),
      solidScriptExampleNote('Where the pushed pivot point lands: the turned offset plus the rise.'),
      solidScriptExampleSet('P', '[=[Around] + [Push]]'),
      solidScriptExampleSet(
        'Move',
        '[=[Around] - Vector(Dot([R1], [Around]), Dot([R2], [Around]), Dot([R3], [Around])) + Vector(Dot([R1], [Push]), Dot([R2], [Push]), Dot([R3], [Push])) + [K] * [Rise] * [I]]',
      ),
      ...solidScriptExampleIf(
        '[RotateCopies]',
        [
          ...solidScriptExampleBlock(
            'matrix',
            {
              row1: '[R1.x], [R1.y], [R1.z], [Move.x]',
              row2: '[R2.x], [R2.y], [R2.z], [Move.y]',
              row3: '[R3.x], [R3.y], [R3.z], [Move.z]',
            },
            [solidScriptExampleLine('input_brushes', { textures: '[Textures]' })],
          ),
        ],
        [
          solidScriptExampleNote('Rotate Copies off: only the centre moves, the brushes keep their turn.'),
          solidScriptExampleSet(
            'Delta',
            '[=Vector(Dot([R1], [Centre]), Dot([R2], [Centre]), Dot([R3], [Centre])) + [Move] - [Centre]]',
          ),
          ...solidScriptExampleBlock('translate', { v: '[Delta]' }, [
            solidScriptExampleLine('input_brushes', { textures: '[Textures]' }),
          ]),
        ],
      ),
    ]),
  ]),
];

/** Port of the Transform Array modifier (whole input as the size). */
export const SOLID_SCRIPT_EXAMPLE_TRANSFORM_ARRAY: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Transform Array: moves and turns every copy once more than the one before.'),
  solidScriptExampleInput('Count', 'count', '3', { label: 'Count', min: '1', max: '256' }),
  solidScriptExampleInput('Offset', 'vector', '0, 0, 0.25', { label: 'Move' }),
  solidScriptExampleInput('Relative', 'vector', '0, 0, 0', { label: 'Size ×' }),
  solidScriptExampleInput('Rotation', 'vector', '0, 0, 15', { label: 'Turn °' }),
  solidScriptExampleInput('Pivot', 'vector', '0, 0, 0', { label: 'Pivot' }),
  solidScriptExampleInput('UV', 'choice', 'copied', { label: 'Textures', choices: 'copied, world' }),
  ...SOLID_SCRIPT_EXAMPLE_TEXTURES,
  solidScriptExampleNote('One step: turn about X, Z and Y (the editor order) around Pivot, then move.'),
  solidScriptExampleSet('Cx', '[=Cos([Rotation.x])]'),
  solidScriptExampleSet('Sx', '[=Sin([Rotation.x])]'),
  solidScriptExampleSet('Cy', '[=Cos([Rotation.y])]'),
  solidScriptExampleSet('Sy', '[=Sin([Rotation.y])]'),
  solidScriptExampleSet('Cz', '[=Cos([Rotation.z])]'),
  solidScriptExampleSet('Sz', '[=Sin([Rotation.z])]'),
  solidScriptExampleSet('S1', '[=Vector([Cz] * [Cy], -[Sz], [Cz] * [Sy])]'),
  solidScriptExampleSet(
    'S2',
    '[=Vector([Cx] * [Sz] * [Cy] + [Sx] * [Sy], [Cx] * [Cz], [Cx] * [Sz] * [Sy] - [Sx] * [Cy])]',
  ),
  solidScriptExampleSet(
    'S3',
    '[=Vector([Sx] * [Sz] * [Cy] - [Cx] * [Sy], [Sx] * [Cz], [Sx] * [Sz] * [Sy] + [Cx] * [Cy])]',
  ),
  solidScriptExampleSet(
    'Move',
    '[=[Offset] + Vector([Relative.x] * [Input.Size.x], [Relative.y] * [Input.Size.y], [Relative.z] * [Input.Size.z]) + [Pivot] - Vector(Dot([S1], [Pivot]), Dot([S2], [Pivot]), Dot([S3], [Pivot]))]',
  ),
  solidScriptExampleNote('Copy 0 is the original; R1 to R3 and Shift hold the step applied I times.'),
  solidScriptExampleLine('input_brushes', { textures: '[Textures]' }),
  solidScriptExampleSet('R1', '[=Vector(1, 0, 0)]'),
  solidScriptExampleSet('R2', '[=Vector(0, 1, 0)]'),
  solidScriptExampleSet('R3', '[=Vector(0, 0, 1)]'),
  solidScriptExampleSet('Shift', '[=Vector(0, 0, 0)]'),
  ...solidScriptExampleIf('[Count] > 1', [
    ...solidScriptExampleRepeat('I', '1', '[=[Count] - 1]', [
      solidScriptExampleSet('Shift', '[=Vector(Dot([S1], [Shift]), Dot([S2], [Shift]), Dot([S3], [Shift])) + [Move]]'),
      solidScriptExampleSet('N1', '[=[R1] * [S1.x] + [R2] * [S1.y] + [R3] * [S1.z]]'),
      solidScriptExampleSet('N2', '[=[R1] * [S2.x] + [R2] * [S2.y] + [R3] * [S2.z]]'),
      solidScriptExampleSet('R3', '[=[R1] * [S3.x] + [R2] * [S3.y] + [R3] * [S3.z]]'),
      solidScriptExampleSet('R1', '[N1]'),
      solidScriptExampleSet('R2', '[N2]'),
      ...solidScriptExampleBlock(
        'matrix',
        {
          row1: '[R1.x], [R1.y], [R1.z], [Shift.x]',
          row2: '[R2.x], [R2.y], [R2.z], [Shift.y]',
          row3: '[R3.x], [R3.y], [R3.z], [Shift.z]',
        },
        [solidScriptExampleLine('input_brushes', { textures: '[Textures]' })],
      ),
    ]),
  ]),
];

/** Port of the Mirror modifier without Bisect. */
export const SOLID_SCRIPT_EXAMPLE_MIRROR: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Mirror: adds a reflected copy of the brushes it receives across a plane.'),
  solidScriptExampleInput('Axis', 'choice', 'x', { label: 'Axis', choices: 'x, y, z' }),
  solidScriptExampleInput('Plane', 'choice', 'center', { label: 'Plane', choices: 'center, min, max' }),
  solidScriptExampleInput('PlaneOffset', 'number', '0', { label: 'Offset' }),
  solidScriptExampleInput('UV', 'choice', 'copied', { label: 'Textures', choices: 'copied, world' }),
  ...SOLID_SCRIPT_EXAMPLE_TEXTURES,
  solidScriptExampleSet('K', solidScriptExampleAxis('Axis')),
  solidScriptExampleNote('The plane runs through the centre or touches a side, then moves by Offset along its axis.'),
  solidScriptExampleSet('D', '[=Dot([Input.Center], [K]) + [PlaneOffset]]'),
  solidScriptExampleSet('Half', '[=Abs(Dot([Input.Size], [K])) / 2]'),
  ...solidScriptExampleIf('[Plane] == "min"', [solidScriptExampleSet('D', '[=[D] - [Half]]')]),
  ...solidScriptExampleIf('[Plane] == "max"', [solidScriptExampleSet('D', '[=[D] + [Half]]')]),
  solidScriptExampleNote('Copy 0 is the original; the copy is reflected: p - 2 (p · K - D) K.'),
  solidScriptExampleLine('input_brushes', { textures: '[Textures]' }),
  ...solidScriptExampleBlock(
    'matrix',
    {
      row1: '[=1 - 2 * [K.x] * [K.x]], [=-2 * [K.x] * [K.y]], [=-2 * [K.x] * [K.z]], [=2 * [D] * [K.x]]',
      row2: '[=-2 * [K.y] * [K.x]], [=1 - 2 * [K.y] * [K.y]], [=-2 * [K.y] * [K.z]], [=2 * [D] * [K.y]]',
      row3: '[=-2 * [K.z] * [K.x]], [=-2 * [K.z] * [K.y]], [=1 - 2 * [K.z] * [K.z]], [=2 * [D] * [K.z]]',
    },
    [solidScriptExampleLine('input_brushes', { textures: '[Textures]' })],
  ),
];
