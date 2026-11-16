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
 * The Spot function: a point of the flight, from how far along it is, how high,
 * and which side across.
 */
const SOLID_SCRIPT_EXAMPLE_SPOT: readonly SolidScriptLine[] = solidScriptExampleBlock(
  'function',
  { name: 'spot', parameters: 'along, z, side' },
  [
    solidScriptExampleSet('local.run', '[=[start] + [forward] * [local.along]]'),
    ...solidScriptExampleIf(
      '[alongX]',
      [solidScriptExampleLine('return', { value: '[=vector([local.run], [local.side] * [across], [local.z])]' })],
      [solidScriptExampleLine('return', { value: '[=vector([local.side] * [across], [local.run], [local.z])]' })],
    ),
  ],
);

/**
 * Lines that build one solid from a side outline: each outline point once on
 * each side of the flight.
 *
 * @param list Name of the list of along, height points.
 * @returns Lines.
 */
function solidScriptExampleOutlineSolid(list: string): SolidScriptLine[] {
  return solidScriptExamplePolyhedron(
    solidScriptExampleBlock('for_each', { variable: 'p', list: `[${list}]` }, [
      solidScriptExamplePoint('[=spot([p.x], [p.y], -1)]'),
      solidScriptExamplePoint('[=spot([p.x], [p.y], 1)]'),
    ]),
  );
}

/**
 * Lines that make a list of along, height points.
 *
 * @param list List name.
 * @param points Points as along, height field text.
 * @returns Lines.
 */
function solidScriptExampleOutline(list: string, points: readonly string[]): SolidScriptLine[] {
  return [
    solidScriptExampleLine('clear_variable', { name: list }),
    ...points.map((point) => solidScriptExampleLine('add_item', { value: `[=vector(${point})]`, list })),
  ];
}

/** Lines that clip the step rectangle to the part above the slab underside. */
const SOLID_SCRIPT_EXAMPLE_SLAB_CLIP: readonly SolidScriptLine[] = [
  ...solidScriptExampleOutline('corners', ['[from], [floor]', '[to], [floor]', '[to], [top]', '[from], [top]']),
  solidScriptExampleLine('clear_variable', { name: 'outline' }),
  ...solidScriptExampleRepeat('c', '0', '3', [
    solidScriptExampleSet('n', '[=([c] + 1) % 4]'),
    solidScriptExampleSet('here', '[corners([c])]'),
    solidScriptExampleSet('next', '[corners([n])]'),
    solidScriptExampleSet('a', '[=[here.y] - underside([here.x])]'),
    solidScriptExampleSet('b', '[=[next.y] - underside([next.x])]'),
    ...solidScriptExampleIf('[a] >= 0', [solidScriptExampleLine('add_item', { value: '[here]', list: 'outline' })]),
    ...solidScriptExampleIf('([a] > 0 and [b] < 0) or ([a] < 0 and [b] > 0)', [
      solidScriptExampleLine('add_item', { value: '[=lerp([here], [next], [a] / ([a] - [b]))]', list: 'outline' }),
    ]),
  ]),
];

/** Port of the Stairs generator. */
export const SOLID_SCRIPT_EXAMPLE_STAIRS: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Stairs: a row of steps, each one a box or a slice of a sloped slab, with an optional nose.'),
  ...SOLID_SCRIPT_EXAMPLE_BOX_INPUTS,
  solidScriptExampleInput('direction', 'choice', '+z', { label: 'Ascend', choices: '+x, -x, +z, -z' }),
  solidScriptExampleInput('sizing', 'choice', 'rise', { label: 'Steps By', choices: 'rise, count' }),
  solidScriptExampleInput('rise', 'number', '0.125', { label: 'Target Rise', min: '0.01', max: '10' }),
  solidScriptExampleInput('count', 'count', '8', { label: 'Steps', min: '1', max: '256' }),
  solidScriptExampleInput('landing', 'number', '0', { label: 'Landing', min: '0', max: '1000' }),
  solidScriptExampleInput('nosing', 'number', '0', { label: 'Nosing', min: '0', max: '10' }),
  solidScriptExampleInput('noseHeight', 'number', '0.025', { label: 'Nose Height', min: '0', max: '10' }),
  solidScriptExampleInput('noseBevel', 'number', '0.025', { label: 'Nose Bevel', min: '0', max: '10' }),
  solidScriptExampleInput('noseEdge', 'number', '0', { label: 'Edge Chamfer', min: '0', max: '10' }),
  solidScriptExampleInput('fill', 'choice', 'slab', { label: 'Underside', choices: 'slab, solid, floating' }),
  solidScriptExampleInput('waist', 'number', '0.2', { label: 'Thickness', min: '0.01', max: '100' }),
  solidScriptExampleInput('thickness', 'number', '0.125', { label: 'Tread Depth', min: '0.01', max: '100' }),
  solidScriptExampleNote('Which way the flight climbs, as seen in the editor: +Z climbs toward -Y here.'),
  solidScriptExampleSet('alongX', '[=ends_with([direction], "x")]'),
  solidScriptExampleSet('forward', '[=starts_with([direction], "+") == [alongX] ? 1 : -1]'),
  solidScriptExampleSet('length', '[=[alongX] ? [width] : [depth]]'),
  solidScriptExampleSet('across', '[=[alongX] ? [depth] / 2 : [width] / 2]'),
  solidScriptExampleSet('start', '[=-[forward] * [length] / 2]'),
  solidScriptExampleSet('floor', '[=-[height] / 2]'),
  ...SOLID_SCRIPT_EXAMPLE_SPOT,
  solidScriptExampleSet('steps', '[=round([height] / [rise])]'),
  ...solidScriptExampleIf('[sizing] == "count"', [solidScriptExampleSet('steps', '[count]')]),
  solidScriptExampleSet('steps', '[=max(1, min(256, round([steps])))]'),
  solidScriptExampleSet('flat', '[=min([landing], [length] * 0.9)]'),
  solidScriptExampleSet('up', '[=[height] / [steps]]'),
  solidScriptExampleSet('run', '[=([length] - [flat]) / [steps]]'),
  solidScriptExampleSet('tread', '[up]'),
  ...solidScriptExampleIf('[fill] == "floating"', [solidScriptExampleSet('tread', '[thickness]')]),
  solidScriptExampleNote('The nose: how far it sticks out and how tall it is, kept inside the step.'),
  solidScriptExampleSet('noseDepth', '[=min([nosing], [run] * 0.5)]'),
  solidScriptExampleSet('noseLimit', '[=min([up], [tread])]'),
  solidScriptExampleSet('noseTall', '[=min([noseHeight], [noseLimit])]'),
  solidScriptExampleSet('noseSlope', '[=min([noseBevel], [noseLimit] - [noseTall])]'),
  solidScriptExampleSet('noseCut', '[=min([noseEdge], [noseTall], [noseDepth])]'),
  solidScriptExampleSet('slope', '[=[run] > 0 ? [up] / [run] : 0]'),
  solidScriptExampleSet('drop', '[=[waist] * sqrt(1 + [slope] ^ 2)]'),
  ...solidScriptExampleBlock('function', { name: 'underside', parameters: 'along' }, [
    solidScriptExampleSet('local.at', '[=[landingStep] ? [from] : [local.along]]'),
    solidScriptExampleLine('return', { value: '[=[floor] + ([local.at] - [noseDepth]) * [slope] - [drop]]' }),
  ]),
  solidScriptExampleNote('Set here, so the underside function can read them for each step.'),
  solidScriptExampleSet('from', '0'),
  solidScriptExampleSet('landingStep', 'false'),
  ...solidScriptExampleRepeat('i', '0', '[=[steps] - 1]', [
    solidScriptExampleSet('last', '[=[i] == [steps] - 1]'),
    solidScriptExampleSet('from', '[=[i] * [run] + [noseDepth]]'),
    solidScriptExampleSet('to', '[=[last] ? [length] : ([i] + 1) * [run] + [noseDepth]]'),
    solidScriptExampleSet('top', '[=[floor] + ([i] + 1) * [up]]'),
    ...solidScriptExampleIf(
      '[fill] == "slab"',
      [
        solidScriptExampleSet('landingStep', '[=[last] and [length] > [steps] * [run]]'),
        ...SOLID_SCRIPT_EXAMPLE_SLAB_CLIP,
        ...solidScriptExampleOutlineSolid('outline'),
      ],
      [
        solidScriptExampleSet('bottom', '[floor]'),
        ...solidScriptExampleIf('[fill] == "floating"', [
          solidScriptExampleSet('bottom', '[=max([floor], [top] - [thickness])]'),
        ]),
        ...solidScriptExampleOutline('outline', ['[from], [bottom]', '[to], [bottom]', '[to], [top]', '[from], [top]']),
        ...solidScriptExampleOutlineSolid('outline'),
      ],
    ),
    ...solidScriptExampleIf('[noseDepth] > 0 and [noseTall] + [noseSlope] > 0', [
      solidScriptExampleSet('front', '[=[i] * [run]]'),
      ...solidScriptExampleOutline('nose', [
        '[front], [top] - [noseTall]',
        '[front] + [noseDepth], [top] - [noseTall] - [noseSlope]',
        '[front] + [noseDepth], [top]',
        '[front] + [noseCut], [top]',
        '[front], [top] - [noseCut]',
      ]),
      ...solidScriptExampleOutlineSolid('nose'),
    ]),
  ]),
];
