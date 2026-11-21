import type { SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptExampleBlock,
  solidScriptExampleComponents,
  solidScriptExampleIf,
  solidScriptExampleInput,
  solidScriptExampleInputGroup,
  solidScriptExampleLine,
  solidScriptExampleNote,
  solidScriptExampleRepeat,
  solidScriptExampleSet,
  solidScriptExampleShowWhen,
} from './solid_script_example_lines.js';

/**
 * Turns an axis name into a direction.
 *
 * @param name Variable holding X, Y or Z.
 * @returns Formula.
 */
function solidScriptExampleAxis(name: string): string {
  return `[=[${name}] == "X" ? Vector(1, 0, 0) : [${name}] == "Y" ? Vector(0, 1, 0) : Vector(0, 0, 1)]`;
}

/**
 * Builds the Textures input of a modifier port, and maps it to Input Objects.
 *
 * @param follow Move With Shape or Move With Copy.
 * @returns Lines.
 */
function solidScriptExampleTextures(follow: string): SolidScriptLine[] {
  return [
    solidScriptExampleInput('Uv', 'Choice', follow, { label: 'Textures', choices: `${follow}, World Aligned` }),
    solidScriptExampleSet('Textures', 'Move With Shape'),
    ...solidScriptExampleIf('[Uv] == "World Aligned"', [solidScriptExampleSet('Textures', 'World Aligned')]),
  ];
}

/**
 * Builds Count, Axes, Textures and the per-copy UV shifts of an array port.
 *
 * @param follow Move With Copy, or empty when the port has no Count.
 * @param count True to include Count.
 * @returns Lines.
 */
function solidScriptExampleArrayInputs(follow: string, count = true): SolidScriptLine[] {
  return [
    ...(count ? [solidScriptExampleInput('Count', 'Count', '3', { label: 'Count', min: '1', max: '256' })] : []),
    solidScriptExampleInput('Space', 'Choice', 'Volume', { label: 'Axes', choices: 'Volume, World' }),
    ...solidScriptExampleTextures(follow),
    ...solidScriptExampleInputGroup('Per copy texture', [
      solidScriptExampleInput('UvShiftU', 'Number', '0', { label: 'UV Shift U', min: '-100', max: '100' }),
      solidScriptExampleInput('UvShiftV', 'Number', '0', { label: 'UV Shift V', min: '-100', max: '100' }),
    ]),
  ];
}

/**
 * Shifts the texture of the stamp in [Copy] by the port's per-copy UV shift
 * times Index with Transform UVs, keeping Readable Text as Input Objects leaves
 * it unless the port passes its own.
 *
 * @param index Copy index as text or a formula field such as [I].
 * @param readable True to pass the port's Readable Text through.
 * @returns Lines.
 */
/**
 * Writes the received brushes Into [Copy] and sets Textures on that list,
 * before any later Of-tool move.
 *
 * @returns Lines.
 */
function solidScriptExampleInputCopy(): SolidScriptLine[] {
  return [
    solidScriptExampleLine('input_objects', { into: 'Copy' }),
    solidScriptExampleLine('transform_uvs', { textures: '[Textures]', of: '[Copy]' }),
  ];
}

/**
 * Writes the received brushes Into [Copy], sets Textures, and stamps that copy
 * as the original.
 *
 * @returns Lines.
 */
function solidScriptExamplePassCopy(): SolidScriptLine[] {
  return [...solidScriptExampleInputCopy(), solidScriptExampleLine('output', { of: '[Copy]' })];
}

function solidScriptExampleCopyUvs(index: string, readable: boolean): SolidScriptLine[] {
  const shifted = '([UvShiftU] != 0 or [UvShiftV] != 0)';
  return solidScriptExampleIf(`[Copy.Count] > 0${readable ? '' : ` and ${shifted}`}`, [
    solidScriptExampleLine('transform_uvs', {
      offset: `[=[UvShiftU] * ${index}], [=[UvShiftV] * ${index}], 0`,
      ...(readable ? { readable: '[Readable]' } : {}),
      of: '[Copy]',
    }),
  ]);
}

/**
 * Stamps the received brushes as copy Index, moved by the Transform around
 * them, with the port's per-copy UV shift.
 *
 * @param move Move of the copy.
 * @param index Copy index as text or a formula field such as [I].
 * @returns Lines.
 */
function solidScriptExampleMovedCopy(move: string, index: string): SolidScriptLine[] {
  return [
    ...solidScriptExampleBlock('transform', { move }, solidScriptExampleInputCopy()),
    ...solidScriptExampleCopyUvs(index, false),
    solidScriptExampleLine('output', { of: '[Copy]' }),
  ];
}

/**
 * Stamps the received brushes, then applies a flat Matrix to that new stamp.
 *
 * @param values Matrix rows.
 * @param uvs Lines that change the texture of [Copy] before it is output.
 * @returns Lines.
 */
function solidScriptExampleMatrixOf(values: Record<string, string>, uvs: SolidScriptLine[] = []): SolidScriptLine[] {
  return [
    ...solidScriptExampleInputCopy(),
    solidScriptExampleLine('matrix', { ...values, of: '[Copy]' }),
    ...uvs,
    solidScriptExampleLine('output', { of: '[Copy]' }),
  ];
}

/** Port of the Shear modifier. */
export const SOLID_SCRIPT_EXAMPLE_SHEAR: readonly SolidScriptLine[] = [
  solidScriptExampleNote(
    'Shear: slides the solids it receives along one axis, more the further they are from their center along another.',
  ),
  solidScriptExampleInput('Axis', 'Choice', 'X', { label: 'Shear Axis', choices: 'X, Y, Z' }),
  solidScriptExampleInput('Along', 'Choice', 'Y', { label: 'Along', choices: 'X, Y, Z' }),
  solidScriptExampleInput('Mode', 'Choice', 'Angle', { label: 'Amount', choices: 'Angle, Factor' }),
  solidScriptExampleNote(
    'Show Inputs When hides or shows the next Inputs, depending on another Input. Here Angle appears for Angle mode, and Factor for Factor mode.',
  ),
  ...solidScriptExampleShowWhen('Mode', 'Angle', [
    solidScriptExampleInput('Angle', 'Number', '20', { label: 'Angle °', min: '-85', max: '85' }),
  ]),
  ...solidScriptExampleShowWhen('Mode', 'Factor', [
    solidScriptExampleInput('Factor', 'Number', '0.5', { label: 'Factor', min: '-10', max: '10' }),
  ]),
  solidScriptExampleInput('Pivot', 'Choice', 'Center Of Whole Input', {
    label: 'Pivot',
    choices: 'Center Of Whole Input, Center Of Each Piece, Volume Center',
  }),
  solidScriptExampleInput('Space', 'Choice', 'Volume', { label: 'Axes', choices: 'Volume, World' }),
  ...solidScriptExampleTextures('Move With Shape'),
  ...solidScriptExampleIf(
    '[Axis] == [Along]',
    [
      solidScriptExampleNote(
        'Echo writes a message in the editor when something is wrong. Here it runs if the two axes are the same.',
      ),
      solidScriptExampleLine('echo', { value: 'Shear Axis and Along must differ; the solids pass on unchanged.' }),
      ...solidScriptExamplePassCopy(),
    ],
    [
      solidScriptExampleNote('The slide per metre: the tangent of the angle, or the factor itself.'),
      solidScriptExampleSet('Shear', '[=[Mode] == "Factor" ? [Factor] : Tan([Angle])]'),
      solidScriptExampleSet('Slide', `[=(${solidScriptExampleAxis('Axis').slice(2, -1)}) * [Shear]]`),
      solidScriptExampleSet('Measure', solidScriptExampleAxis('Along')),
      solidScriptExampleNote('Each point moves by Slide times its distance from the center along Measure.'),
      solidScriptExampleNote(
        'Matrix changes every point of the copy by these rows. Input Objects writes the received solids Into [Copy], Matrix edits that copy, and Output stamps it.',
      ),
      solidScriptExampleSet('Shift', '[=[Slide] * -Dot([Measure], [$Input.Center])]'),
      ...solidScriptExampleMatrixOf({
        row1: '[=1 + [Slide.X] * [Measure.X]], [=[Slide.X] * [Measure.Y]], [=[Slide.X] * [Measure.Z]], [Shift.X]',
        row2: '[=[Slide.Y] * [Measure.X]], [=1 + [Slide.Y] * [Measure.Y]], [=[Slide.Y] * [Measure.Z]], [Shift.Y]',
        row3: '[=[Slide.Z] * [Measure.X]], [=[Slide.Z] * [Measure.Y]], [=1 + [Slide.Z] * [Measure.Z]], [Shift.Z]',
      }),
    ],
  ),
];

/** Port of the Linear Array modifier. */
export const SOLID_SCRIPT_EXAMPLE_LINEAR_ARRAY: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Linear Array: repeats the solids it receives along a line.'),
  solidScriptExampleNote('Input Group is a heading in the inspector that groups the Inputs inside it.'),
  ...solidScriptExampleArrayInputs('Move With Copy'),
  solidScriptExampleInput('Mode', 'Choice', 'Relative To Size', {
    label: 'Spacing',
    choices: 'Fixed Step, Relative To Size, Fit Distance, Size × Plus Step',
  }),
  ...solidScriptExampleInputGroup('Spacing', [
    ...solidScriptExampleShowWhen('Mode', 'Fixed Step, Size × Plus Step', [
      ...solidScriptExampleComponents('Offset', ['2', '0', '0'], 'Step'),
    ]),
    ...solidScriptExampleShowWhen('Mode', 'Relative To Size, Size × Plus Step', [
      solidScriptExampleInput('Bounds', 'Choice', 'Whole Input', {
        label: 'Size From',
        choices: 'Whole Input, Each Piece',
      }),
      ...solidScriptExampleComponents('Relative', ['1', '0', '0'], 'Size ×'),
    ]),
    ...solidScriptExampleShowWhen('Mode', 'Fit Distance', [
      ...solidScriptExampleComponents('Endpoint', ['8', '0', '0'], 'Distance'),
    ]),
  ]),
  solidScriptExampleSet('Offset', '[=Vector([OffsetX], [OffsetY], [OffsetZ])]'),
  solidScriptExampleSet('Relative', '[=Vector([RelativeX], [RelativeY], [RelativeZ])]'),
  solidScriptExampleSet('Endpoint', '[=Vector([EndpointX], [EndpointY], [EndpointZ])]'),
  solidScriptExampleNote('Size × is a multiple of the size of what comes in: 1 places copies edge to edge.'),
  solidScriptExampleSet(
    'BySize',
    '[=Vector([Relative.X] * [$Input.Size.X], [Relative.Y] * [$Input.Size.Y], [Relative.Z] * [$Input.Size.Z])]',
  ),
  solidScriptExampleSet('Step', '[Offset]'),
  ...solidScriptExampleIf('[Mode] == "Relative To Size"', [solidScriptExampleSet('Step', '[BySize]')]),
  ...solidScriptExampleIf('[Mode] == "Size × Plus Step"', [solidScriptExampleSet('Step', '[=[Offset] + [BySize]]')]),
  ...solidScriptExampleIf('[Mode] == "Fit Distance"', [
    solidScriptExampleSet('Step', '[=[Endpoint] / Max(1, [Count] - 1)]'),
  ]),
  solidScriptExampleNote('Copy 0 is the original; each next copy moves one more Step.'),
  ...solidScriptExampleRepeat('I', '0', '[Count]', [...solidScriptExampleMovedCopy('[=[Step] * [I]]', '[I]')]),
];

/**
 * Turns a side name such as Back or Right into a script direction.
 *
 * @param name Variable holding the side.
 * @returns Formula.
 */
function solidScriptExampleSide(name: string): string {
  const pick = (word: string, vector: string) => `[${name}] == "${word}" ? Vector(${vector}) : `;
  return `[=${pick('Right', '1, 0, 0')}${pick('Left', '-1, 0, 0')}${pick('Up', '0, 1, 0')}${pick('Down', '0, -1, 0')}${pick('Front', '0, 0, 1')}Vector(0, 0, -1)]`;
}

/** Port of the Radial Array modifier (whole input as the center). */
export const SOLID_SCRIPT_EXAMPLE_RADIAL_ARRAY: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Radial Array: repeats the solids it receives around an axis, measured from the whole input.'),
  ...solidScriptExampleArrayInputs('Move With Copy'),
  solidScriptExampleInput('Origin', 'Choice', 'On The Ring', {
    label: 'Original',
    choices: 'On The Ring, Around Pivot',
  }),
  solidScriptExampleInput('Mode', 'Choice', 'Full Ring', {
    label: 'Distribution',
    choices: 'Full Ring, Arc, Angle Step',
  }),
  solidScriptExampleInput('Axis', 'Choice', 'Y', { label: 'Axis', choices: 'X, Y, Z' }),
  ...solidScriptExampleShowWhen('Mode', 'Arc', [
    solidScriptExampleInput('Sweep', 'Number', '90', { label: 'Sweep °', min: '-360', max: '360' }),
  ]),
  ...solidScriptExampleShowWhen('Mode', 'Angle Step', [
    solidScriptExampleInput('Step', 'Number', '15', { label: 'Step °', min: '-360', max: '360' }),
  ]),
  ...solidScriptExampleShowWhen('Origin', 'On The Ring', [
    solidScriptExampleInput('Radius', 'Number', '2', { label: 'Radius', min: '0' }),
    solidScriptExampleInput('CenterSide', 'Choice', 'Back', {
      label: 'Ring Center',
      choices: 'Back, Front, Left, Right, Down, Up',
    }),
  ]),
  ...solidScriptExampleShowWhen('Origin', 'Around Pivot', [
    solidScriptExampleInput('Start', 'Number', '0', { label: 'Start °', min: '-3600', max: '3600' }),
    solidScriptExampleInput('RadiusOffset', 'Number', '0', { label: 'Radius Offset' }),
  ]),
  solidScriptExampleInput('Rise', 'Number', '0', { label: 'Rise per Step' }),
  solidScriptExampleInput('RotateCopies', 'Switch', 'Yes', { label: 'Rotate Copies' }),
  solidScriptExampleInput('Bounds', 'Choice', 'Whole Input', {
    label: 'Center From',
    choices: 'Whole Input, Each Piece',
  }),
  ...solidScriptExampleInputGroup('Pivot', [
    ...solidScriptExampleShowWhen('Origin', 'Around Pivot', [
      ...solidScriptExampleComponents('Pivot', ['0', '0', '0'], 'Pivot'),
    ]),
  ]),
  solidScriptExampleSet('Pivot', '[=Vector([PivotX], [PivotY], [PivotZ])]'),
  solidScriptExampleSet('K', solidScriptExampleAxis('Axis')),
  solidScriptExampleSet('Center', '[$Input.Center]'),
  solidScriptExampleNote('The angle between copies: a full ring, an arc or a fixed step.'),
  solidScriptExampleSet('Turn', '[=360 / [Count]]'),
  ...solidScriptExampleIf('[Mode] == "Angle Step"', [solidScriptExampleSet('Turn', '[Step]')]),
  ...solidScriptExampleIf('[Mode] == "Arc"', [solidScriptExampleSet('Turn', '[=[Sweep] / Max(1, [Count] - 1)]')]),
  solidScriptExampleNote(
    'Around is the point the copies turn about, Push moves them off the axis, First is the first angle.',
  ),
  solidScriptExampleSet('Around', '[Center]'),
  solidScriptExampleSet('Push', '[=Vector(0, 0, 0)]'),
  solidScriptExampleSet('First', '0'),
  solidScriptExampleSet('Side', '[K]'),
  solidScriptExampleSet('Out', '[K]'),
  ...solidScriptExampleIf(
    '[Origin] == "On The Ring"',
    [
      solidScriptExampleNote('The ring center lies Radius away on the chosen side, across the axis.'),
      solidScriptExampleSet('Side', solidScriptExampleSide('CenterSide')),
      solidScriptExampleSet('Side', '[=[Side] - [K] * Dot([Side], [K])]'),
      ...solidScriptExampleIf('[=Dot([Side], [Side]) < 1e-12]', [
        solidScriptExampleSet('Side', '[=[Axis] == "Z" ? Vector(0, -1, 0) : Vector(0, 0, -1)]'),
      ]),
      solidScriptExampleSet('Around', '[=[Center] + Normalize([Side]) * [Radius]]'),
    ],
    [
      solidScriptExampleNote('Around the pivot: copies start at Start ° and move Radius Offset away from the axis.'),
      solidScriptExampleSet('Around', '[Pivot]'),
      solidScriptExampleSet('Out', '[=[Center] - [Around]]'),
      solidScriptExampleSet('Out', '[=[Out] - [K] * Dot([Out], [K])]'),
      ...solidScriptExampleIf('[=Dot([Out], [Out]) < 1e-12]', [
        solidScriptExampleSet('Out', '[=[Axis] == "Y" ? Vector(1, 0, 0) : Vector(0, 1, 0)]'),
      ]),
      solidScriptExampleSet('Push', '[=Normalize([Out]) * [RadiusOffset]]'),
      solidScriptExampleSet('First', '[Start]'),
    ],
  ),
  solidScriptExampleNote('Copy I turns by First + I × Turn around K through Around, then rises along K.'),
  solidScriptExampleNote('Copy 0 is the original.'),
  ...solidScriptExamplePassCopy(),
  ...solidScriptExampleIf('[Count] > 1', [
    ...solidScriptExampleRepeat('I', '1', '[Count]', [
      solidScriptExampleSet('A', '[=[First] + [I] * [Turn]]'),
      solidScriptExampleSet('C', '[=Cos([A])]'),
      solidScriptExampleSet('S', '[=Sin([A])]'),
      solidScriptExampleSet('T', '[=1 - [C]]'),
      solidScriptExampleSet(
        'R1',
        '[=Vector([C] + [T] * [K.X] * [K.X], [T] * [K.X] * [K.Y] - [S] * [K.Z], [T] * [K.X] * [K.Z] + [S] * [K.Y])]',
      ),
      solidScriptExampleSet(
        'R2',
        '[=Vector([T] * [K.X] * [K.Y] + [S] * [K.Z], [C] + [T] * [K.Y] * [K.Y], [T] * [K.Y] * [K.Z] - [S] * [K.X])]',
      ),
      solidScriptExampleSet(
        'R3',
        '[=Vector([T] * [K.X] * [K.Z] - [S] * [K.Y], [T] * [K.Y] * [K.Z] + [S] * [K.X], [C] + [T] * [K.Z] * [K.Z])]',
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
          ...solidScriptExampleMatrixOf(
            {
              row1: '[R1.X], [R1.Y], [R1.Z], [Move.X]',
              row2: '[R2.X], [R2.Y], [R2.Z], [Move.Y]',
              row3: '[R3.X], [R3.Y], [R3.Z], [Move.Z]',
            },
            solidScriptExampleCopyUvs('[I]', false),
          ),
        ],
        [
          solidScriptExampleNote('Rotate Copies off: only the center moves, the solids keep their turn.'),
          solidScriptExampleSet(
            'Delta',
            '[=Vector(Dot([R1], [Center]), Dot([R2], [Center]), Dot([R3], [Center])) + [Move] - [Center]]',
          ),
          ...solidScriptExampleMovedCopy('[Delta]', '[I]'),
        ],
      ),
    ]),
  ]),
];

/** Port of the Transform Array modifier (whole input as the size). */
export const SOLID_SCRIPT_EXAMPLE_TRANSFORM_ARRAY: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Transform Array: moves and turns every copy once more than the one before.'),
  ...solidScriptExampleArrayInputs('Move With Copy'),
  ...solidScriptExampleInputGroup('Per copy', [
    ...solidScriptExampleComponents('Offset', ['0', '0.25', '0'], 'Move'),
    ...solidScriptExampleComponents('Relative', ['0', '0', '0'], 'Size ×'),
    solidScriptExampleInput('Bounds', 'Choice', 'Whole Input', {
      label: 'Size From',
      choices: 'Whole Input, Each Piece',
    }),
    ...solidScriptExampleComponents('Rotation', ['0', '15', '0'], 'Turn °'),
  ]),
  ...solidScriptExampleInputGroup('Pivot', [...solidScriptExampleComponents('Pivot', ['0', '0', '0'], 'Pivot')]),
  solidScriptExampleSet('Offset', '[=Vector([OffsetX], [OffsetY], [OffsetZ])]'),
  solidScriptExampleSet('Relative', '[=Vector([RelativeX], [RelativeY], [RelativeZ])]'),
  solidScriptExampleSet('Rotation', '[=Vector([RotationX], [RotationY], [RotationZ])]'),
  solidScriptExampleSet('Pivot', '[=Vector([PivotX], [PivotY], [PivotZ])]'),
  solidScriptExampleNote('One step: turn by the X, Y and Z angles the way the editor does, around Pivot, then move.'),
  solidScriptExampleSet('Cx', '[=Cos([Rotation.X])]'),
  solidScriptExampleSet('Sx', '[=Sin([Rotation.X])]'),
  solidScriptExampleSet('Cy', '[=Cos([Rotation.Y])]'),
  solidScriptExampleSet('Sy', '[=Sin([Rotation.Y])]'),
  solidScriptExampleSet('Cz', '[=Cos([Rotation.Z])]'),
  solidScriptExampleSet('Sz', '[=Sin([Rotation.Z])]'),
  solidScriptExampleSet('S1', '[=Vector([Cy] * [Cz], -[Cy] * [Sz], [Sy])]'),
  solidScriptExampleSet(
    'S2',
    '[=Vector([Cx] * [Sz] + [Sx] * [Sy] * [Cz], [Cx] * [Cz] - [Sx] * [Sy] * [Sz], -[Sx] * [Cy])]',
  ),
  solidScriptExampleSet(
    'S3',
    '[=Vector([Sx] * [Sz] - [Cx] * [Sy] * [Cz], [Sx] * [Cz] + [Cx] * [Sy] * [Sz], [Cx] * [Cy])]',
  ),
  solidScriptExampleSet(
    'Move',
    '[=[Offset] + Vector([Relative.X] * [$Input.Size.X], [Relative.Y] * [$Input.Size.Y], [Relative.Z] * [$Input.Size.Z]) + [Pivot] - Vector(Dot([S1], [Pivot]), Dot([S2], [Pivot]), Dot([S3], [Pivot]))]',
  ),
  solidScriptExampleNote('Copy 0 is the original; R1 to R3 and Shift hold the step applied I times.'),
  ...solidScriptExamplePassCopy(),
  solidScriptExampleSet('R1', '[=Vector(1, 0, 0)]'),
  solidScriptExampleSet('R2', '[=Vector(0, 1, 0)]'),
  solidScriptExampleSet('R3', '[=Vector(0, 0, 1)]'),
  solidScriptExampleSet('Shift', '[=Vector(0, 0, 0)]'),
  ...solidScriptExampleIf('[Count] > 1', [
    ...solidScriptExampleRepeat('I', '1', '[Count]', [
      solidScriptExampleSet('Shift', '[=Vector(Dot([S1], [Shift]), Dot([S2], [Shift]), Dot([S3], [Shift])) + [Move]]'),
      solidScriptExampleSet('N1', '[=[R1] * [S1.X] + [R2] * [S1.Y] + [R3] * [S1.Z]]'),
      solidScriptExampleSet('N2', '[=[R1] * [S2.X] + [R2] * [S2.Y] + [R3] * [S2.Z]]'),
      solidScriptExampleSet('R3', '[=[R1] * [S3.X] + [R2] * [S3.Y] + [R3] * [S3.Z]]'),
      solidScriptExampleSet('R1', '[N1]'),
      solidScriptExampleSet('R2', '[N2]'),
      ...solidScriptExampleMatrixOf(
        {
          row1: '[R1.X], [R1.Y], [R1.Z], [Shift.X]',
          row2: '[R2.X], [R2.Y], [R2.Z], [Shift.Y]',
          row3: '[R3.X], [R3.Y], [R3.Z], [Shift.Z]',
        },
        solidScriptExampleCopyUvs('[I]', false),
      ),
    ]),
  ]),
];

/** Port of the Mirror modifier, including Bisect through Clip. */
export const SOLID_SCRIPT_EXAMPLE_MIRROR: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Mirror: adds a reflected copy of the solids it receives across a plane.'),
  ...solidScriptExampleArrayInputs('Move With Copy', false),
  solidScriptExampleInput('Axis', 'Choice', 'X', { label: 'Axis', choices: 'X, Y, Z' }),
  solidScriptExampleInput('Plane', 'Choice', 'Volume Center', {
    label: 'Plane',
    choices: 'Volume Center, Negative Side, Positive Side',
  }),
  solidScriptExampleInput('PlaneOffset', 'Number', '0', { label: 'Offset' }),
  solidScriptExampleInput('Bisect', 'Switch', 'No', { label: 'Bisect' }),
  ...solidScriptExampleShowWhen('Bisect', 'Yes', [solidScriptExampleInput('Flip', 'Switch', 'No', { label: 'Flip' })]),
  ...solidScriptExampleShowWhen('Uv', 'Move With Copy', [
    solidScriptExampleInput('Readable', 'Switch', 'Yes', { label: 'Readable Text' }),
  ]),
  solidScriptExampleSet('K', solidScriptExampleAxis('Axis')),
  solidScriptExampleNote('The plane runs through the center or touches a side, then moves by Offset along its axis.'),
  solidScriptExampleSet('D', '[=Dot([$Input.Center], [K]) + [PlaneOffset]]'),
  solidScriptExampleSet('Half', '[=Abs(Dot([$Input.Size], [K])) / 2]'),
  ...solidScriptExampleIf('[Plane] == "Negative Side"', [solidScriptExampleSet('D', '[=[D] - [Half]]')]),
  ...solidScriptExampleIf('[Plane] == "Positive Side"', [solidScriptExampleSet('D', '[=[D] + [Half]]')]),
  solidScriptExampleSet('Drop', '[=-[K]]'),
  ...solidScriptExampleIf('[Plane] == "Positive Side"', [solidScriptExampleSet('Drop', '[K]')]),
  ...solidScriptExampleIf('[Flip]', [solidScriptExampleSet('Drop', '[=-[Drop]]')]),
  ...solidScriptExampleIf('[Bisect]', [
    solidScriptExampleNote('Bisect cuts the received solids at the plane and drops the side Drop points toward.'),
    solidScriptExampleNote(
      'Clip cuts the received solids with a plane: Through is a point on the plane, and Normal is the way the kept side faces.',
    ),
    solidScriptExampleLine('clip', { through: '[=[K] * [D]]', normal: '[Drop]', of: '[$Input.Objects]' }),
  ]),
  solidScriptExampleNote('Copy 0 is the original; the copy is reflected: p - 2 (p · K - D) K.'),
  ...solidScriptExamplePassCopy(),
  ...solidScriptExampleMatrixOf(
    {
      row1: '[=1 - 2 * [K.X] * [K.X]], [=-2 * [K.X] * [K.Y]], [=-2 * [K.X] * [K.Z]], [=2 * [D] * [K.X]]',
      row2: '[=-2 * [K.Y] * [K.X]], [=1 - 2 * [K.Y] * [K.Y]], [=-2 * [K.Y] * [K.Z]], [=2 * [D] * [K.Y]]',
      row3: '[=-2 * [K.Z] * [K.X]], [=-2 * [K.Z] * [K.Y]], [=1 - 2 * [K.Z] * [K.Z]], [=2 * [D] * [K.Z]]',
    },
    solidScriptExampleCopyUvs('1', true),
  ),
];

/**
 * Lays a slab off every face of every brush a modifier receives, pushed out
 * from the brush; without Input Objects the brushes themselves are gone.
 */
export const SOLID_SCRIPT_EXAMPLE_PUSH_OUT_FACES: readonly SolidScriptLine[] = [
  solidScriptExampleNote(
    'This script is a modifier only: add it to a solid. For Each walks every received solid in [Input.Objects]. The received solids themselves are not kept, and only the new slabs stay.',
  ),
  solidScriptExampleInput('Distance', 'Number', '0.25', { label: 'Distance', min: '0', max: '10' }),
  solidScriptExampleInput('Thickness', 'Number', '0.1', { label: 'Thickness', min: '0.001', max: '10' }),
  ...solidScriptExampleBlock('for_each', { variable: 'Object', list: '[$Input.Objects]' }, [
    solidScriptExampleNote('Select Faces Which All Of [Object] keeps every face of that solid.'),
    solidScriptExampleLine('select_faces', { which: 'All', of: '[Object]' }),
    solidScriptExampleNote(
      'Extrude Face grows a slab from each selected face. The Thickness Input is how thick the slab is, and the Distance Input is the gap in front of the face.',
    ),
    solidScriptExampleLine('extrude_face', { distance: '[Thickness]', lift: '[Distance]' }),
  ]),
];
