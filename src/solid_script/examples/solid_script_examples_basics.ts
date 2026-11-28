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
  ...solidScriptExampleNote(
    'A Cube is a box. [Box] is the generator box you draw in the editor, and [Box.Size] is its width, height and depth. This wall fills that box. Anchor is which part of the box sits on the origin. Center, Center, Center puts the middle of the box there.',
  ),
  solidScriptExampleLine('cube', { size: '[$Box.Size]', anchor: 'Center, Center, Center' }),
  ...solidScriptExampleNote(
    'Name a box so later lines can find it. Mode Subtractive cuts this box out of the wall in front, leaving a doorway. The hole is a quarter of the wall wide and seven tenths as tall, so it stays in proportion when you resize the box.',
  ),
  solidScriptExampleLine('cube', {
    size: '[=[$Box.Width] * 0.25], [=[$Box.Height] * 0.7], [=[$Box.Depth] * 2]',
    anchor: 'Center, Center, Center',
    mode: 'Subtractive',
    label: 'Door',
  }),
  ...solidScriptExampleNote(
    'Move By slides solids by a distance in metres. Of says which ones: Door is the hole we just named. The move puts the bottom of the doorway on the floor of the box.',
  ),
  solidScriptExampleLine('move_by', { by: '0, [=-[$Box.Height] * 0.15], 0', of: 'Door' }),
];

/** A row of five columns from one named part, centered on the origin. */
export const SOLID_SCRIPT_EXAMPLE_COLUMNS: readonly SolidScriptLine[] = [
  ...solidScriptExampleNote(
    'Define Part writes a recipe named Column. The cylinder inside is not in the world yet. Output, later, stamps a copy when you want one.',
  ),
  ...solidScriptExampleBlock('part', { name: 'Column' }, [
    solidScriptExampleLine('cylinder', {
      h: '[$Box.Height]',
      r1: '[=Min([$Box.Width], [$Box.Depth]) / 20]',
      r2: '[=Min([$Box.Width], [$Box.Depth]) / 20]',
      sides: '12',
      anchor: 'Center, Center, Center',
    }),
  ]),
  ...solidScriptExampleNote(
    'Repeat runs the lines inside once for every number from 0 up to 5, without 5 itself: 0, 1, 2, 3 and 4. Each time, [I] is that number.',
  ),
  ...solidScriptExampleRepeat('I', '0', '5', [
    ...solidScriptExampleNote(
      'Transform opens a space for the lines until End. This one slides each stamp along X. A formula starts with [= and is a calculation: the formula in Move spaces the five columns across the width of the generator box.',
    ),
    ...solidScriptExampleBlock('transform', { move: '[=-[$Box.Extents.X] + ([I] + 0.5) * [$Box.Width] / 5], 0, 0' }, [
      ...solidScriptExampleNote('Output [Column] stamps a copy of the part into that space.'),
      solidScriptExampleLine('output', { of: '[Column]' }),
    ]),
  ]),
];

/** Stepping stones from one point to another, along a gentle wave. */
export const SOLID_SCRIPT_EXAMPLE_STEPPING_STONES: readonly SolidScriptLine[] = [
  ...solidScriptExampleNote('Change the Stones Input and the path gains or loses slabs. The default is 9.'),
  solidScriptExampleInput('Stones', 'Count', '9', { min: '2', max: '40', label: 'Stones' }),
  ...solidScriptExampleNote(
    'Set gives a name to a value so you can use it later. [Start] and [Finish] are the two ends of the path, written as points at opposite corners of the generator box.',
  ),
  solidScriptExampleSet('Start', '[=Vector([$Box.Min.X], 0, [$Box.Max.Z])]'),
  solidScriptExampleSet('Finish', '[=Vector([$Box.Max.X], 0, [$Box.Min.Z])]'),
  ...solidScriptExampleRepeat('I', '0', '[Stones]', [
    ...solidScriptExampleNote(
      'Lerp walks from [Start] to [Finish]. The last number is how far along, from 0 at the start to 1 at the end. Then [Pos.Y] changes only the height, so the path has a gentle wave that stays inside the box.',
    ),
    solidScriptExampleSet('Pos', '[=Lerp([Start], [Finish], [I] / ([Stones] - 1))]'),
    solidScriptExampleSet('Pos.Y', '[=Sin([I] * 40) * [$Box.Height] * 0.15]'),
    ...solidScriptExampleNote('This Transform moves the space to [Pos], so the slab is built already in place.'),
    ...solidScriptExampleBlock('transform', { move: '[Pos]' }, [
      solidScriptExampleLine('cube', {
        size: '[=[$Box.Width] * 0.08], [=[$Box.Height] * 0.15], [=[$Box.Depth] * 0.06]',
        anchor: 'Center, Center, Center',
      }),
    ]),
    ...solidScriptExampleNote(
      'Select Objects Which Between picks the slab just built. Rotate To turns it around its middle to these angles, in degrees. The middle number is a little more for each slab.',
    ),
    solidScriptExampleLine('select_objects', { which: 'Between' }),
    solidScriptExampleLine('rotate_to', { to: '0, [=[I] * 23], 0' }),
  ]),
];

/** Pillars on a circle, each placed with one position vector. */
export const SOLID_SCRIPT_EXAMPLE_PILLAR_RING: readonly SolidScriptLine[] = [
  ...solidScriptExampleNote(
    'Count is an Input: change it in the inspector and the ring updates. The ring fills the generator box, with [Radius] a little inside the smaller of its width and depth.',
  ),
  solidScriptExampleInput('Count', 'Count', '8', { min: '3', max: '32', label: 'Pillars' }),
  solidScriptExampleSet('Radius', '[=Min([$Box.Width], [$Box.Depth]) * 0.4]'),
  ...solidScriptExampleRepeat('I', '1', '[=[Count] + 1]', [
    ...solidScriptExampleNote(
      'Each round, [Angle] is how far around the ring, in degrees. RingPoint turns that angle and the width into a point on the circle, [Radius] metres from the middle of the box.',
    ),
    solidScriptExampleSet('Angle', '[=360 / [Count] * [I]]'),
    solidScriptExampleSet('Pos', '[=RingPoint([Angle], [Radius] * 2)]'),
    ...solidScriptExampleNote('A Transform whose Move is [Pos] builds the pillar already in place, around that point.'),
    ...solidScriptExampleBlock('transform', { move: '[Pos]' }, [
      solidScriptExampleLine('cylinder', {
        h: '[$Box.Height]',
        r1: '[=[Radius] * 0.08]',
        r2: '[=[Radius] * 0.065]',
        sides: '12',
        anchor: 'Center, Center, Center',
      }),
    ]),
  ]),
];

/** Pebbles scattered over the top of a slab, more where the face is bigger. */
export const SOLID_SCRIPT_EXAMPLE_PEBBLES: readonly SolidScriptLine[] = [
  ...solidScriptExampleNote(
    'This slab is the ground the pebbles sit on. It fills the generator box and is named Slab so later lines can find it.',
  ),
  solidScriptExampleInput('Pebbles', 'Count', '40', { min: '1', max: '400', label: 'Pebbles' }),
  solidScriptExampleSet('Span', '[=Min([$Box.Width], [$Box.Depth])]'),
  solidScriptExampleLine('cube', { size: '[$Box.Size]', anchor: 'Center, Center, Center', label: 'Slab' }),
  ...solidScriptExampleNote(
    'Select Faces Of Slab starts from Which All, every face of the slab, then Where keeps only the top. InBox is yes when a point sits in a box. HitsBox is yes when a face or solid meets a box of a Center and Size; Fully Inside means the whole face sits in the box.',
  ),
  solidScriptExampleLine('select_faces', {
    which: 'All',
    of: 'Slab',
    where:
      '[=HitsBox([$Face], Vector(0, [$Box.Extents.Y], 0), Vector([$Box.Width] + 1, [$Box.Height] * 0.4, [$Box.Depth] + 1), "Fully Inside") and InBox([$Face.Center], Vector(0, [$Box.Extents.Y], 0), [$Box.Height])]',
  }),
  ...solidScriptExampleNote(
    'Scatter On Faces now drops points on the selected faces, more where a face is bigger. Into writes them to [Spots].',
  ),
  solidScriptExampleLine('scatter_on_faces', { count: '[Pebbles]', seed: '3', into: 'Spots' }),
  ...solidScriptExampleNote(
    'Filter List keeps the items of a list that pass Where. [Index] is 0 for the first spot, then 1, and so on. This keeps every spot. Into writes them to [Kept].',
  ),
  solidScriptExampleLine('filter_list', {
    list: '[Spots]',
    where: '[=[$Index] >= 0]',
    into: 'Kept',
  }),
  ...solidScriptExampleNote(
    'Each pebble is a Sphere whose radius comes from Random, so they are not all the same size, and they scale with the box. The last number, [I], is the ID of the pebble, so the same pebble is always the same size; a Seed after it, such as Random(0.03, 0.08, [I], 1), gives a different set.',
  ),
  ...solidScriptExampleBlock('for_each', { variable: 'Spot', list: '[Kept]', key: 'I' }, [
    ...solidScriptExampleBlock('transform', { move: '[Spot]' }, [
      solidScriptExampleLine('sphere', {
        r: '[=Random([Span] * 0.03, [Span] * 0.08, [I])]',
        anchor: 'Center, Center, Center',
      }),
    ]),
  ]),
];

/** Spikes growing straight out of a ball at scattered points. */
export const SOLID_SCRIPT_EXAMPLE_SPIKY_BALL: readonly SolidScriptLine[] = [
  solidScriptExampleInput('Spikes', 'Count', '30', { min: '1', max: '200', label: 'Spikes' }),
  solidScriptExampleSet('Radius', '[=Min([$Box.Extents.X], [$Box.Extents.Y], [$Box.Extents.Z])]'),
  solidScriptExampleLine('sphere', { r: '[Radius]', anchor: 'Center, Center, Center' }),
  solidScriptExampleLine('select_objects'),
  ...solidScriptExampleNote('Every face of the ball is selected, so spikes can grow all around it.'),
  solidScriptExampleLine('select_faces', { which: 'All' }),
  ...solidScriptExampleNote("Scatter's Normals writes the face direction at each spot into [Ways]."),
  solidScriptExampleLine('scatter_on_faces', { count: '[Spikes]', seed: '5', into: 'Spots', normals: 'Ways' }),
  ...solidScriptExampleBlock('for_each', { variable: 'Spot', list: '[Spots]', key: 'I' }, [
    ...solidScriptExampleBlock('transform', { move: '[Spot]' }, [
      ...solidScriptExampleNote(
        'The cylinder is built Into [Spike], so it is not in the world yet. Align To turns it so its up follows the face, using [Ways] at this spike.',
      ),
      solidScriptExampleLine('cylinder', {
        h: '[=[Radius] * 0.5]',
        r1: '[=[Radius] * 0.08]',
        r2: '0',
        anchor: 'Center, Center, Center',
        into: 'Spike',
      }),
      solidScriptExampleLine('align', { direction: '[Ways([I])]', of: '[Spike]' }),
    ]),
    ...solidScriptExampleNote('Output then stamps that turned spike into the world.'),
    solidScriptExampleLine('output', { of: '[Spike]' }),
  ]),
];

/**
 * A slab under a box: as a generator it builds the box too, as a modifier it
 * puts the slab under whatever it is added to.
 */
export const SOLID_SCRIPT_EXAMPLE_PEDESTAL: readonly SolidScriptLine[] = [
  ...solidScriptExampleNote(
    'This script works as a generator and as a modifier. Margin and Thickness are Inputs for the slab under the box.',
  ),
  solidScriptExampleInput('Margin', 'Number', '0.2', { min: '0', max: '2', label: 'Margin' }),
  solidScriptExampleInput('Thickness', 'Number', '0.2', { min: '0.05', max: '2', label: 'Thickness' }),
  ...solidScriptExampleNote(
    'These are the starting values when this script is a generator: the box fills the generator box, and the slab sits under it.',
  ),
  solidScriptExampleSet('Low', '[=[$Box.Min.Y]]'),
  solidScriptExampleSet('Width', '[$Box.Width]'),
  solidScriptExampleSet('Depth', '[$Box.Depth]'),
  ...solidScriptExampleNote(
    'If Used As runs the lines until Else only when this script is added as a modifier. [Input] is what it was added to: the lowest point, the width and the depth come from that.',
  ),
  solidScriptExampleLine('if_used_as', { use: 'Modifier' }),
  solidScriptExampleSet('Low', '[$Input.Min.Y]'),
  solidScriptExampleSet('Width', '[$Input.Size.X]'),
  solidScriptExampleSet('Depth', '[$Input.Size.Z]'),
  ...solidScriptExampleNote('Input Objects keeps the received solids in the world.'),
  solidScriptExampleLine('input_objects'),
  ...solidScriptExampleNote(
    'Else runs when the script is used as a generator, and builds a box for the slab to sit under.',
  ),
  solidScriptExampleLine('else'),
  solidScriptExampleLine('cube', { size: '[$Box.Size]', anchor: 'Center, Center, Center' }),
  solidScriptExampleLine('end'),
  ...solidScriptExampleNote(
    'Move To places the named slab so its center sits at this point. The height puts the slab under the box.',
  ),
  solidScriptExampleLine('cube', {
    size: '[=[Width] + 2 * [Margin]], [Thickness], [=[Depth] + 2 * [Margin]]',
    anchor: 'Center, Center, Center',
    label: 'Slab',
  }),
  solidScriptExampleLine('move_to', { to: '0, [=[Low] - [Thickness] / 2], 0', of: 'Slab' }),
];

/**
 * A panel with knobs: only the boxes named Knob get a ball on top, picked with
 * Of.
 */
export const SOLID_SCRIPT_EXAMPLE_KNOBS: readonly SolidScriptLine[] = [
  ...solidScriptExampleNote(
    'For Each runs the lines inside once for every item in a list. This list is four numbers, how far across the panel each knob sits, from -1 at the left of the generator box to 1 at the right. Each time, [X] is one of those numbers.',
  ),
  solidScriptExampleSet('Thick', '[=[$Box.Height] * 0.2]'),
  solidScriptExampleSet('Knob', '[=[$Box.Height] * 0.3]'),
  solidScriptExampleLine('cube', {
    size: '[$Box.Width], [Thick], [$Box.Depth]',
    label: 'Panel',
    anchor: 'Center, Center, Center',
  }),
  ...solidScriptExampleBlock('for_each', { variable: 'X', list: '-0.75, -0.25, 0.25, 0.75' }, [
    ...solidScriptExampleBlock('transform', { move: '[=[X] * [$Box.Extents.X]], [=[Thick] / 2 + [Knob] / 2], 0' }, [
      solidScriptExampleLine('cube', {
        size: '[Knob], [Knob], [Knob]',
        label: 'Knob',
        anchor: 'Center, Center, Center',
      }),
    ]),
  ]),
  ...solidScriptExampleNote(
    'Select Faces Of Knob picks only faces of the boxes named Knob, not the panel. After Select, [Selected.Faces] is that list of faces.',
  ),
  solidScriptExampleLine('select_faces', { which: 'Facing Up', of: 'Knob' }),
  ...solidScriptExampleNote(
    'This For Each walks those faces. Place On Face sets the space so the next solid sits on that face, pointed along it.',
  ),
  ...solidScriptExampleBlock('for_each', { variable: 'Face', list: '[$Selected.Faces]' }, [
    ...solidScriptExampleBlock('place_on_face', { of: '[Face]' }, [
      solidScriptExampleLine('sphere', { r: '[=[Knob] / 3]', anchor: 'Center, Center, Center' }),
    ]),
  ]),
];
