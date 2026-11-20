import type { SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptExampleBlock,
  solidScriptExampleInput,
  solidScriptExampleLine,
  solidScriptExampleNote,
  solidScriptExampleRepeat,
  solidScriptExampleSet,
} from './solid_script_example_lines.js';

/** A wall with a doorway cut out of it. */
export const SOLID_SCRIPT_EXAMPLE_DOORWAY: readonly SolidScriptLine[] = [
  solidScriptExampleNote(
    'A Cube is a box. Size is how wide, tall and deep it is, in metres. Anchor is which part of the box sits on the origin. Center, Center, Center puts the middle of the box there.',
  ),
  solidScriptExampleLine('cube', { size: '4, 3, 0.2', anchor: 'Center, Center, Center' }),
  solidScriptExampleNote(
    'Name a box so later lines can find it. Mode Subtractive cuts this box out of the wall in front, leaving a doorway.',
  ),
  solidScriptExampleLine('cube', {
    size: '1, 2.1, 0.4',
    anchor: 'Center, Center, Center',
    mode: 'Subtractive',
    label: 'Door',
  }),
  solidScriptExampleNote(
    'Move By slides brushes by a distance in metres. Of says which ones: Door is the hole we just named. 0, -0.45, 0 means no slide sideways, a little downward, and no slide forward or back.',
  ),
  solidScriptExampleLine('move_by', { by: '0, -0.45, 0', of: 'Door' }),
];

/** A row of five columns from one named part, centered on the origin. */
export const SOLID_SCRIPT_EXAMPLE_COLUMNS: readonly SolidScriptLine[] = [
  solidScriptExampleNote(
    'Define Part writes a recipe named Column. The cylinder inside is not in the world yet. Output, later, stamps a copy when you want one.',
  ),
  ...solidScriptExampleBlock('part', { name: 'Column' }, [
    solidScriptExampleLine('cylinder', { h: '3', r1: '0.2', r2: '0.2', sides: '12', anchor: 'Center, Center, Center' }),
  ]),
  solidScriptExampleNote(
    'Repeat runs the lines inside once for every number from 0 to 4. Each time, $[I$] is that number.',
  ),
  ...solidScriptExampleRepeat('I', '0', '4', [
    solidScriptExampleNote(
      'Transform opens a space for the lines until End. This one slides each stamp along X. A formula starts with $[= and is a calculation: the formula in Move spaces the five columns in a row, centered on the origin.',
    ),
    ...solidScriptExampleBlock('transform', { move: '[=[I] * 1.5 - 3], 0, 0' }, [
      solidScriptExampleNote('Output $[Column$] stamps a copy of the part into that space.'),
      solidScriptExampleLine('output', { of: '[Column]' }),
    ]),
  ]),
];

/** Stepping stones from one point to another, along a gentle wave. */
export const SOLID_SCRIPT_EXAMPLE_STEPPING_STONES: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Change the Stones Input and the path gains or loses slabs. The default is 9.'),
  solidScriptExampleInput('Stones', 'Count', '9', { min: '2', max: '40', label: 'Stones' }),
  solidScriptExampleNote(
    'Set gives a name to a value so you can use it later. $[Start$] and $[Finish$] are the two ends of the path, written as points.',
  ),
  solidScriptExampleSet('Start', '-4, 0, 1'),
  solidScriptExampleSet('Finish', '4, 0, -2'),
  ...solidScriptExampleRepeat('I', '0', '[=[Stones] - 1]', [
    solidScriptExampleNote(
      'Lerp walks from $[Start$] to $[Finish$]. The last number is how far along, from 0 at the start to 1 at the end. Then $[Pos.Y$] changes only the height, so the path has a gentle wave.',
    ),
    solidScriptExampleSet('Pos', '[=Lerp([Start], [Finish], [I] / ([Stones] - 1))]'),
    solidScriptExampleSet('Pos.Y', '[=Sin([I] * 40) * 0.15]'),
    solidScriptExampleNote(
      'This Transform both moves and rotates. Move happens first, then Rotate turns each slab around its new place. The middle number of Rotate is the turn in degrees, a little more for each slab.',
    ),
    ...solidScriptExampleBlock('transform', { move: '[Pos]', rotate: '0, [=[I] * 23], 0' }, [
      solidScriptExampleLine('cube', { size: '0.7, 0.15, 0.5', anchor: 'Center, Center, Center' }),
    ]),
  ]),
];

/** Pillars on a circle, each placed with one position vector. */
export const SOLID_SCRIPT_EXAMPLE_PILLAR_RING: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Count and Radius are Inputs too: change them in the inspector and the ring updates.'),
  solidScriptExampleInput('Count', 'Count', '8', { min: '3', max: '32', label: 'Pillars' }),
  solidScriptExampleInput('Radius', 'Number', '3', { min: '0.5', max: '20', label: 'Radius' }),
  solidScriptExampleNote('Set $[Center$] is the middle of the ring, one and a half metres up.'),
  solidScriptExampleSet('Center', '0, 1.5, 0'),
  ...solidScriptExampleRepeat('I', '1', '[Count]', [
    solidScriptExampleNote(
      'Each round, $[Angle$] is how far around the ring, in degrees. Vector, Cos and Sin turn that angle into a point on the circle, $[Radius$] metres from $[Center$].',
    ),
    solidScriptExampleSet('Angle', '[=360 / [Count] * [I]]'),
    solidScriptExampleSet('Pos', '[=[Center] + Vector(Cos([Angle]), 0, -Sin([Angle])) * [Radius]]'),
    solidScriptExampleNote('A Transform whose Move is $[Pos$] builds the pillar already in place, around that point.'),
    ...solidScriptExampleBlock('transform', { move: '[Pos]' }, [
      solidScriptExampleLine('cylinder', {
        h: '3',
        r1: '0.25',
        r2: '0.2',
        sides: '12',
        anchor: 'Center, Center, Center',
      }),
    ]),
  ]),
];

/** Pebbles scattered over the top of a slab, more where the face is bigger. */
export const SOLID_SCRIPT_EXAMPLE_PEBBLES: readonly SolidScriptLine[] = [
  solidScriptExampleNote('This slab is the ground the pebbles sit on. It is named Slab so later lines can find it.'),
  solidScriptExampleInput('Pebbles', 'Count', '40', { min: '1', max: '400', label: 'Pebbles' }),
  solidScriptExampleLine('cube', { size: '3, 0.4, 3', anchor: 'Center, Center, Center', label: 'Slab' }),
  solidScriptExampleNote(
    'Select Faces Of Slab starts from Which All, every face of the slab, then Where keeps only the top. InBox is yes when a point sits in a box. HitsBox is yes when a face or brush meets a box of a Center and Size; Fully Inside means the whole face sits in the box. Hits is the same idea when the other box is a brush or a list.',
  ),
  solidScriptExampleLine('select_faces', {
    which: 'All',
    of: 'Slab',
    where:
      '[=HitsBox([$Face], Vector(0, 0.2, 0), Vector(4, 0.3, 4), "Fully Inside") and InBox([$Face.Center], Vector(0, 0.2, 0), 1)]',
  }),
  solidScriptExampleNote(
    'Scatter Points now drops points on the selected faces, more where a face is bigger. Into writes them to $[Spots$].',
  ),
  solidScriptExampleLine('scatter_points', { count: '[Pebbles]', seed: '3', into: 'Spots' }),
  solidScriptExampleNote(
    'Filter List keeps the items of a list that pass Where. $[Index$] is 0 for the first spot, then 1, and so on. This keeps every spot. Into writes them to $[Kept$].',
  ),
  solidScriptExampleLine('filter_list', {
    list: '[Spots]',
    where: '[=[$Index] >= 0]',
    into: 'Kept',
  }),
  solidScriptExampleNote(
    'Each pebble is a Sphere whose radius comes from Random, so they are not all the same size. The last number, $[I$], is a seed, so the same pebble is always the same size.',
  ),
  ...solidScriptExampleBlock('for_each', { variable: 'Spot', list: '[Kept]', key: 'I' }, [
    ...solidScriptExampleBlock('transform', { move: '[Spot]' }, [
      solidScriptExampleLine('sphere', { r: '[=Random(0.05, 0.12, [I])]', anchor: 'Center, Center, Center' }),
    ]),
  ]),
];

/** Spikes growing straight out of a ball at scattered points. */
export const SOLID_SCRIPT_EXAMPLE_SPIKY_BALL: readonly SolidScriptLine[] = [
  { command: 'note', values: { text: 'Align To turns each spike so its Y follows the face it stands on' } },
  {
    command: 'input',
    values: { name: 'Spikes', type: 'Count', default: '30', min: '1', max: '200', label: 'Spikes' },
  },
  { command: 'sphere', values: { r: '1', anchor: 'Center, Center, Center' } },
  { command: 'select_brushes' },
  { command: 'select_faces', values: { which: 'All' } },
  { command: 'scatter_points', values: { count: '[Spikes]', seed: '5', into: 'Spots', normals: 'Ways' } },
  { command: 'for_each', values: { variable: 'Spot', list: '[Spots]', key: 'I' } },
  { command: 'transform', values: { move: '[Spot]' } },
  { command: 'cylinder', values: { h: '0.5', r1: '0.08', r2: '0', anchor: 'Center, Center, Center', into: 'Spike' } },
  { command: 'align', values: { direction: '[Ways([I])]', of: '[Spike]' } },
  { command: 'end' },
  { command: 'output', values: { of: '[Spike]' } },
  { command: 'end' },
];

/**
 * A slab under a box: as a generator it builds the box too, as a modifier it
 * puts the slab under whatever it is added to.
 */
export const SOLID_SCRIPT_EXAMPLE_PEDESTAL: readonly SolidScriptLine[] = [
  { command: 'note', values: { text: 'Works as a generator and as a modifier on a brush, mesh or group' } },
  {
    command: 'input',
    values: { name: 'Margin', type: 'Number', default: '0.2', min: '0', max: '2', label: 'Margin' },
  },
  {
    command: 'input',
    values: { name: 'Thickness', type: 'Number', default: '0.2', min: '0.05', max: '2', label: 'Thickness' },
  },
  { command: 'variable', values: { name: 'Low', value: '-0.5' } },
  { command: 'variable', values: { name: 'Width', value: '1' } },
  { command: 'variable', values: { name: 'Depth', value: '1' } },
  { command: 'if_used_as', values: { use: 'Modifier' } },
  { command: 'variable', values: { name: 'Low', value: '[$Input.Min.Y]' } },
  { command: 'variable', values: { name: 'Width', value: '[$Input.Size.X]' } },
  { command: 'variable', values: { name: 'Depth', value: '[$Input.Size.Z]' } },
  { command: 'input_brushes', values: { textures: 'Move With Shape' } },
  { command: 'else' },
  { command: 'cube', values: { size: '1, 1, 1', anchor: 'Center, Center, Center' } },
  { command: 'end' },
  { command: 'transform', values: { move: '0, [=[Low] - [Thickness] / 2], 0' } },
  {
    command: 'cube',
    values: {
      size: '[=[Width] + 2 * [Margin]], [Thickness], [=[Depth] + 2 * [Margin]]',
      anchor: 'Center, Center, Center',
    },
  },
  { command: 'end' },
];

/**
 * A panel with knobs: only the boxes named Knob get a ball on top, picked with
 * Of.
 */
export const SOLID_SCRIPT_EXAMPLE_KNOBS: readonly SolidScriptLine[] = [
  solidScriptExampleNote(
    'For Each runs the lines inside once for every item in a list. This list is four numbers, the left-to-right places of the knobs. Each time, $[X$] is one of those numbers.',
  ),
  solidScriptExampleLine('cube', { size: '4, 0.2, 1', label: 'Panel', anchor: 'Center, Center, Center' }),
  ...solidScriptExampleBlock('for_each', { variable: 'X', list: '-1.5, -0.5, 0.5, 1.5' }, [
    ...solidScriptExampleBlock('transform', { move: '[X], 0.25, 0' }, [
      solidScriptExampleLine('cube', { size: '0.3, 0.3, 0.3', label: 'Knob', anchor: 'Center, Center, Center' }),
    ]),
  ]),
  solidScriptExampleNote(
    'Select Faces Of Knob picks only faces of the boxes named Knob, not the panel. After Select, $[Selected.Faces$] is that list of faces.',
  ),
  solidScriptExampleLine('select_faces', { which: 'Facing Up', of: 'Knob' }),
  solidScriptExampleNote(
    'This For Each walks those faces. Place On Face sets the space so the next brush sits on that face, pointed along it.',
  ),
  ...solidScriptExampleBlock('for_each', { variable: 'Face', list: '[$Selected.Faces]' }, [
    ...solidScriptExampleBlock('place_on_face', { of: '[Face]' }, [
      solidScriptExampleLine('sphere', { r: '0.1', anchor: 'Center, Center, Center' }),
    ]),
  ]),
];
