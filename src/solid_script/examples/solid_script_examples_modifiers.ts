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
