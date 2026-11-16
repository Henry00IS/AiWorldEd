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
  { name: 'Spot', parameters: 'Along, Z, Side' },
  [
    solidScriptExampleSet('local.run', '[=[Start] + [Forward] * [local.Along]]'),
    solidScriptExampleLine('return', {
      value:
        '[=[AlongX] ? vector([local.Run], [local.Side] * [Across], [local.Z]) : vector([local.Side] * [Across], [local.Run], [local.Z])]',
    }),
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
    solidScriptExampleBlock('for_each', { variable: 'P', list: `[${list}]` }, [
      solidScriptExamplePoint('[=Spot([P.x], [P.y], -1)]'),
      solidScriptExamplePoint('[=Spot([P.x], [P.y], 1)]'),
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
  ...solidScriptExampleOutline('corners', ['[From], [Floor]', '[To], [Floor]', '[To], [Top]', '[From], [Top]']),
  solidScriptExampleLine('clear_variable', { name: 'Outline' }),
  ...solidScriptExampleRepeat('C', '0', '3', [
    solidScriptExampleSet('N', '[=([C] + 1) % 4]'),
    solidScriptExampleSet('Here', '[corners([C])]'),
    solidScriptExampleSet('Next', '[corners([N])]'),
    solidScriptExampleSet('A', '[=[Here.y] - Underside([Here.x])]'),
    solidScriptExampleSet('B', '[=[Next.y] - Underside([Next.x])]'),
    ...solidScriptExampleIf('[A] >= 0', [solidScriptExampleLine('add_item', { value: '[Here]', list: 'Outline' })]),
    ...solidScriptExampleIf('([A] > 0 and [B] < 0) or ([A] < 0 and [B] > 0)', [
      solidScriptExampleLine('add_item', { value: '[=lerp([Here], [Next], [A] / ([A] - [B]))]', list: 'Outline' }),
    ]),
  ]),
];

/** Port of the Stairs generator. */
export const SOLID_SCRIPT_EXAMPLE_STAIRS: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Stairs: a row of steps, each one a box or a slice of a sloped slab, with an optional nose.'),
  ...SOLID_SCRIPT_EXAMPLE_BOX_INPUTS,
  solidScriptExampleInput('Direction', 'choice', '+z', { label: 'Ascend', choices: '+x, -x, +z, -z' }),
  solidScriptExampleInput('Sizing', 'choice', 'rise', { label: 'Steps By', choices: 'rise, count' }),
  solidScriptExampleInput('Rise', 'number', '0.125', { label: 'Target Rise', min: '0.01', max: '10' }),
  solidScriptExampleInput('Count', 'count', '8', { label: 'Steps', min: '1', max: '256' }),
  solidScriptExampleInput('Landing', 'number', '0', { label: 'Landing', min: '0', max: '1000' }),
  solidScriptExampleInput('Nosing', 'number', '0', { label: 'Nosing', min: '0', max: '10' }),
  solidScriptExampleInput('NoseHeight', 'number', '0.025', { label: 'Nose Height', min: '0', max: '10' }),
  solidScriptExampleInput('NoseBevel', 'number', '0.025', { label: 'Nose Bevel', min: '0', max: '10' }),
  solidScriptExampleInput('NoseEdge', 'number', '0', { label: 'Edge Chamfer', min: '0', max: '10' }),
  solidScriptExampleInput('Fill', 'choice', 'slab', { label: 'Underside', choices: 'slab, solid, floating' }),
  solidScriptExampleInput('Waist', 'number', '0.2', { label: 'Thickness', min: '0.01', max: '100' }),
  solidScriptExampleInput('Thickness', 'number', '0.125', { label: 'Tread Depth', min: '0.01', max: '100' }),
  solidScriptExampleNote('Which way the flight climbs, as seen in the editor: +Z climbs toward -Y here.'),
  solidScriptExampleSet('AlongX', '[=ends_with([Direction], "x")]'),
  solidScriptExampleSet('Forward', '[=starts_with([Direction], "+") == [AlongX] ? 1 : -1]'),
  solidScriptExampleSet('Length', '[=[AlongX] ? [Width] : [Depth]]'),
  solidScriptExampleSet('Across', '[=[AlongX] ? [Depth] / 2 : [Width] / 2]'),
  solidScriptExampleSet('Start', '[=-[Forward] * [Length] / 2]'),
  solidScriptExampleSet('Floor', '[=-[Height] / 2]'),
  ...SOLID_SCRIPT_EXAMPLE_SPOT,
  solidScriptExampleSet('Steps', '[=round([Height] / [Rise])]'),
  ...solidScriptExampleIf('[Sizing] == "count"', [solidScriptExampleSet('Steps', '[Count]')]),
  solidScriptExampleSet('Steps', '[=max(1, min(256, round([Steps])))]'),
  solidScriptExampleSet('Flat', '[=min([Landing], [Length] * 0.9)]'),
  solidScriptExampleSet('Up', '[=[Height] / [Steps]]'),
  solidScriptExampleSet('Run', '[=([Length] - [Flat]) / [Steps]]'),
  solidScriptExampleSet('Tread', '[Up]'),
  ...solidScriptExampleIf('[Fill] == "floating"', [solidScriptExampleSet('Tread', '[Thickness]')]),
  solidScriptExampleNote('The nose: how far it sticks out and how tall it is, kept inside the step.'),
  solidScriptExampleSet('NoseDepth', '[=min([Nosing], [Run] * 0.5)]'),
  solidScriptExampleSet('NoseLimit', '[=min([Up], [Tread])]'),
  solidScriptExampleSet('NoseTall', '[=min([NoseHeight], [NoseLimit])]'),
  solidScriptExampleSet('NoseSlope', '[=min([NoseBevel], [NoseLimit] - [NoseTall])]'),
  solidScriptExampleSet('NoseCut', '[=min([NoseEdge], [NoseTall], [NoseDepth])]'),
  solidScriptExampleSet('Slope', '[=[Run] > 0 ? [Up] / [Run] : 0]'),
  solidScriptExampleSet('Drop', '[=[Waist] * sqrt(1 + [Slope] ^ 2)]'),
  ...solidScriptExampleBlock('function', { name: 'Underside', parameters: 'Along' }, [
    solidScriptExampleLine('return', {
      value: '[=[Floor] + (([LandingStep] ? [From] : [local.Along]) - [NoseDepth]) * [Slope] - [Drop]]',
    }),
  ]),
  solidScriptExampleNote('Set here, so the underside function can read them for each step.'),
  solidScriptExampleSet('From', '0'),
  solidScriptExampleSet('LandingStep', 'false'),
  ...solidScriptExampleRepeat('I', '0', '[=[Steps] - 1]', [
    solidScriptExampleSet('Last', '[=[I] == [Steps] - 1]'),
    solidScriptExampleSet('From', '[=[I] * [Run] + [NoseDepth]]'),
    solidScriptExampleSet('To', '[=[Last] ? [Length] : ([I] + 1) * [Run] + [NoseDepth]]'),
    solidScriptExampleSet('Top', '[=[Floor] + ([I] + 1) * [Up]]'),
    ...solidScriptExampleIf(
      '[Fill] == "slab"',
      [
        solidScriptExampleSet('LandingStep', '[=[Last] and [Length] > [Steps] * [Run]]'),
        ...SOLID_SCRIPT_EXAMPLE_SLAB_CLIP,
        ...solidScriptExampleOutlineSolid('outline'),
      ],
      [
        solidScriptExampleSet('Bottom', '[Floor]'),
        ...solidScriptExampleIf('[Fill] == "floating"', [
          solidScriptExampleSet('Bottom', '[=max([Floor], [Top] - [Thickness])]'),
        ]),
        ...solidScriptExampleOutline('outline', ['[From], [Bottom]', '[To], [Bottom]', '[To], [Top]', '[From], [Top]']),
        ...solidScriptExampleOutlineSolid('outline'),
      ],
    ),
    ...solidScriptExampleIf('[NoseDepth] > 0 and [NoseTall] + [NoseSlope] > 0', [
      solidScriptExampleSet('Front', '[=[I] * [Run]]'),
      ...solidScriptExampleOutline('nose', [
        '[Front], [Top] - [NoseTall]',
        '[Front] + [NoseDepth], [Top] - [NoseTall] - [NoseSlope]',
        '[Front] + [NoseDepth], [Top]',
        '[Front] + [NoseCut], [Top]',
        '[Front], [Top] - [NoseCut]',
      ]),
      ...solidScriptExampleOutlineSolid('nose'),
    ]),
  ]),
];
