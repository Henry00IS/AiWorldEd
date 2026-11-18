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
 * The Spot function: a point of the flight, from how far along it is, how high,
 * and which side across.
 */
const SOLID_SCRIPT_EXAMPLE_SPOT: readonly SolidScriptLine[] = solidScriptExampleBlock(
  'function',
  { name: 'Spot', parameters: 'Along, Height, Side' },
  [
    solidScriptExampleSet('Local.Run', '[=[Start] + [Forward] * [Local.Along]]'),
    solidScriptExampleLine('return', {
      value:
        '[=[AlongX] ? Vector([Local.Run], [Local.Height], [Local.Side] * [Across]) : Vector([Local.Side] * [Across], [Local.Height], [Local.Run])]',
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
    ...points.map((point) => solidScriptExampleLine('add_item', { value: `[=Vector(${point})]`, list })),
  ];
}

/** Lines that clip the step rectangle to the part above the slab underside. */
const SOLID_SCRIPT_EXAMPLE_SLAB_CLIP: readonly SolidScriptLine[] = [
  ...solidScriptExampleOutline('Corners', ['[From], [Floor]', '[To], [Floor]', '[To], [Top]', '[From], [Top]']),
  solidScriptExampleLine('clear_variable', { name: 'Outline' }),
  ...solidScriptExampleRepeat('C', '0', '3', [
    solidScriptExampleSet('N', '[=([C] + 1) % 4]'),
    solidScriptExampleSet('Here', '[Corners([C])]'),
    solidScriptExampleSet('Next', '[Corners([N])]'),
    solidScriptExampleSet('A', '[=[Here.y] - Underside([Here.x])]'),
    solidScriptExampleSet('B', '[=[Next.y] - Underside([Next.x])]'),
    ...solidScriptExampleIf('[A] >= 0', [solidScriptExampleLine('add_item', { value: '[Here]', list: 'Outline' })]),
    ...solidScriptExampleIf('([A] > 0 and [B] < 0) or ([A] < 0 and [B] > 0)', [
      solidScriptExampleLine('add_item', { value: '[=Lerp([Here], [Next], [A] / ([A] - [B]))]', list: 'Outline' }),
    ]),
  ]),
];

/** Port of the Stairs generator. */
export const SOLID_SCRIPT_EXAMPLE_STAIRS: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Stairs: a row of steps, each one a box or a slice of a sloped slab, with an optional nose.'),
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
  solidScriptExampleSet('AlongX', '[=EndsWith([Direction], "x")]'),
  solidScriptExampleSet('Forward', '[=StartsWith([Direction], "+") ? 1 : -1]'),
  solidScriptExampleSet('Length', '[=[AlongX] ? [$Box.Width] : [$Box.Depth]]'),
  solidScriptExampleSet('Across', '[=[AlongX] ? [$Box.Depth] / 2 : [$Box.Width] / 2]'),
  solidScriptExampleSet('Start', '[=-[Forward] * [Length] / 2]'),
  solidScriptExampleSet('Floor', '[=-[$Box.Height] / 2]'),
  ...SOLID_SCRIPT_EXAMPLE_SPOT,
  solidScriptExampleSet('Steps', '[=Round([$Box.Height] / [Rise])]'),
  ...solidScriptExampleIf('[Sizing] == "count"', [solidScriptExampleSet('Steps', '[Count]')]),
  solidScriptExampleSet('Steps', '[=Max(1, Min(256, Round([Steps])))]'),
  solidScriptExampleSet('Flat', '[=Min([Landing], [Length] * 0.9)]'),
  solidScriptExampleSet('Up', '[=[$Box.Height] / [Steps]]'),
  solidScriptExampleSet('Run', '[=([Length] - [Flat]) / [Steps]]'),
  solidScriptExampleSet('Tread', '[Up]'),
  ...solidScriptExampleIf('[Fill] == "floating"', [solidScriptExampleSet('Tread', '[Thickness]')]),
  solidScriptExampleNote('The nose: how far it sticks out and how tall it is, kept inside the step.'),
  solidScriptExampleSet('NoseDepth', '[=Min([Nosing], [Run] * 0.5)]'),
  solidScriptExampleSet('NoseLimit', '[=Min([Up], [Tread])]'),
  solidScriptExampleSet('NoseTall', '[=Min([NoseHeight], [NoseLimit])]'),
  solidScriptExampleSet('NoseSlope', '[=Min([NoseBevel], [NoseLimit] - [NoseTall])]'),
  solidScriptExampleSet('NoseCut', '[=Min([NoseEdge], [NoseTall], [NoseDepth])]'),
  solidScriptExampleSet('Slope', '[=[Run] > 0 ? [Up] / [Run] : 0]'),
  solidScriptExampleSet('Drop', '[=[Waist] * Sqrt(1 + [Slope] ^ 2)]'),
  ...solidScriptExampleBlock('function', { name: 'Underside', parameters: 'Along' }, [
    solidScriptExampleLine('return', {
      value: '[=[Floor] + (([LandingStep] ? [From] : [Local.Along]) - [NoseDepth]) * [Slope] - [Drop]]',
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
          solidScriptExampleSet('Bottom', '[=Max([Floor], [Top] - [Thickness])]'),
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
