import * as THREE from 'three';
import { SolidScriptCommand, type SolidScriptCommandParameter } from './solid_script_command.js';
import { solidScriptListingOptions } from './solid_script_command_listing.js';
import {
  solidScriptParameter,
  solidScriptParameterAnchor,
  solidScriptParameterMode,
  solidScriptParameterOptional,
} from './solid_script_command_parameters.js';
import { SOLID_SCRIPT_ANCHOR_HEIGHT } from '@/solid_script/language/solid_script_anchor.js';
import {
  solidScriptMirrorMatrix,
  solidScriptAlignMatrix,
  solidScriptRotateMatrix,
  solidScriptScaleMatrix,
  solidScriptTranslateMatrix,
} from '@/solid_script/language/solid_script_transforms.js';
import {
  solidScriptMatrixRows,
  solidScriptMinkowski,
  solidScriptResizeMatrix,
  solidScriptRotateExtrude,
  solidScriptShapeTransform,
} from '@/solid_script/language/solid_script_reshape.js';
import {
  SOLID_SCRIPT_SHAPE_NAME_KEY,
  solidScriptShapeJoin,
  solidScriptShapeNamed,
} from '@/solid_script/language/solid_script_shape.js';
import { solidScriptHullListed } from '@/solid_script/language/solid_script_hull.js';
import { SOLID_SCRIPT_SIDES } from '@/solid_script/language/solid_script_primitives.js';

/** What stops every block without its End. */
const SOLID_SCRIPT_STOPS_END = 'A missing End line.';

/**
 * Commands that move, turn, stretch or mirror the shapes between them and their
 * End.
 */

/**
 * A row of the Matrix block: four numbers, or one number for all four.
 *
 * @param key Key of the stored value.
 * @param label Visible caption.
 * @param fallback Value of a new line.
 * @param hint Hover text.
 * @returns Field.
 */
function solidScriptParameterRow(
  key: string,
  label: string,
  fallback: string,
  hint: string,
): SolidScriptCommandParameter {
  return { ...solidScriptParameter(key, label, 'value', fallback, hint), accepts: ['Number', 'Number List', 'Text'] };
}

export const SOLID_SCRIPT_COMMANDS_TRANSFORMS: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'translate',
    label: 'Translate',
    category: 'Transforms',
    description: 'Move brushes',
    manual:
      'Moves every brush between this line and its End by the given distance along X, Y and Z in metres. Blocks can be nested: a Translate inside another adds both moves. Example: by 0, 2.5, 0 lifts a lintel onto two posts 2.5 metres high. By [=[I] * 2], 0, 0 inside a Repeat moves each round two metres further.',
    stops: ['A value that is not one number or three numbers separated by commas.', SOLID_SCRIPT_STOPS_END],
    nesting: 'open',
    parameters: [solidScriptParameter('v', 'Offset', 'vector3', '0, 0, 0', 'Distance along X, Y and Z in metres.')],
    listing: (read) => ['Translate', 'By ', read.value('v')],
    execute: (run) => run.transformed(solidScriptTranslateMatrix(run.fields())),
  }),
  new SolidScriptCommand({
    id: 'rotate',
    label: 'Rotate',
    category: 'Transforms',
    description: 'Turn brushes',
    manual:
      'Turns every brush between this line and its End around the origin, first around X, then Y, then Z, in degrees. To turn a brush around its own middle, build it centered, or move it after turning it. Example: by 0, 90, 0 turns a box a quarter turn around the upright Y axis.',
    stops: ['A value that is not one number or three numbers separated by commas.', SOLID_SCRIPT_STOPS_END],
    nesting: 'open',
    parameters: [solidScriptParameter('a', 'Angles', 'vector3', '0, 0, 0', 'Degrees around X, then Y, then Z.')],
    listing: (read) => ['Rotate', 'By ', read.value('a'), ' Degrees'],
    execute: (run) => run.transformed(solidScriptRotateMatrix(run.fields())),
  }),
  new SolidScriptCommand({
    id: 'align',
    label: 'Align To',
    category: 'Transforms',
    description: 'Turn brushes to point along a direction',
    manual:
      'Turns every brush between this line and its End so that its upright Y axis points along Direction, by the shortest turn around the origin. Example: after Scatter Points Into Spots Normals Ways, For Each [Spot] In [Spots] Key I; Translate By [Spot]; Align To [Ways([I])] and a thin Cylinder grows a spike straight out of every face.',
    stops: ['A Direction of 0, 0, 0.', SOLID_SCRIPT_STOPS_END],
    nesting: 'open',
    parameters: [
      solidScriptParameter(
        'direction',
        'Direction',
        'vector3',
        '0, 1, 0',
        'Where up (Y) should point, such as 1, 0, 0.',
      ),
    ],
    listing: (read) => ['Align To', ' ', read.value('direction')],
    execute: (run) => run.transformed(solidScriptAlignMatrix(run.fields())),
  }),
  new SolidScriptCommand({
    id: 'scale',
    label: 'Scale',
    category: 'Transforms',
    description: 'Stretch or shrink brushes',
    manual:
      'Stretches or shrinks every brush between this line and its End, measured from the origin: 1 keeps the size, 2 doubles it, 0.5 halves it. Example: by 1, 1, 2 makes a sphere twice as tall, like an egg. By [=[I] + 1], 1, 1 inside a Repeat stretches each round more.',
    stops: ['A value that is not one number or three numbers separated by commas.', SOLID_SCRIPT_STOPS_END],
    nesting: 'open',
    parameters: [
      solidScriptParameter('v', 'Factors', 'vector3', '1, 1, 1', 'Stretch factor along X, Y and Z. 1 keeps the size.'),
    ],
    listing: (read) => ['Scale', 'By ', read.value('v')],
    execute: (run) => run.transformed(solidScriptScaleMatrix(run.fields())),
  }),
  new SolidScriptCommand({
    id: 'mirror',
    label: 'Mirror',
    category: 'Transforms',
    description: 'Flip brushes to the other side',
    manual:
      'Flips every brush between this line and its End to the other side of a mirror through the origin. The direction says which way the mirror faces: 1, 0, 0 flips left and right. Example: build one post at X = 2, then the same post inside Mirror across 1, 0, 0 to get its twin at X = -2.',
    stops: ['A direction of 0, 0, 0.', SOLID_SCRIPT_STOPS_END],
    nesting: 'open',
    parameters: [solidScriptParameter('v', 'Plane Normal', 'vector3', '1, 0, 0', 'Direction the mirror faces.')],
    listing: (read) => ['Mirror', 'Across ', read.value('v')],
    execute: (run) => run.transformed(solidScriptMirrorMatrix(run.fields())),
  }),
  new SolidScriptCommand({
    id: 'resize',
    label: 'Resize',
    category: 'Transforms',
    description: 'Stretch brushes to an exact size',
    manual:
      'Stretches the brushes between this line and its End about the origin so that, together, they measure exactly the given width (X), height (Y) and depth (Z) in metres. A size of 0 leaves that axis alone, or with Keep Proportions scales it like the first axis that has a size. Example: a Sphere inside Resize to 4, 2, 1 gives an egg four metres long, without working out the scale yourself.',
    stops: [
      'A size below 0, or 0 on every axis.',
      'Stretching shapes that are flat along an axis.',
      SOLID_SCRIPT_STOPS_END,
    ],
    nesting: 'open',
    parameters: [
      solidScriptParameter(
        'size',
        'Size',
        'vector3',
        '2, 2, 2',
        'Width (X), height (Y) and depth (Z) in metres. 0 keeps an axis.',
      ),
      solidScriptParameter(
        'keep',
        'Keep Proportions',
        'boolean',
        'No',
        'Yes: axes with a size of 0 scale like the first axis that has one.',
      ),
    ],
    listing: (read) => [
      'Resize',
      'To ',
      read.value('size'),
      ...solidScriptListingOptions([read.on('keep') && ['Keep Proportions']]),
    ],
    execute: (run) => {
      const shapes = run.local(run.planar);
      if (shapes.length === 0) return [];
      const scale = solidScriptResizeMatrix(shapes, run.fields(), run.planar);
      return run.placed(shapes.map((shape) => solidScriptShapeTransform(shape, scale)));
    },
  }),
  new SolidScriptCommand({
    id: 'matrix',
    label: 'Matrix',
    category: 'Transforms',
    description: 'Move, turn, stretch and slant brushes at once',
    manual:
      'Moves the brushes between this line and its End by a 3 by 4 matrix, one row per axis: the new X is Row 1 times x, y, z, 1, and so on. The fourth number of a row moves along that axis. It can do everything Translate, Rotate, Scale and Mirror do, and slant (shear) too. Example: Row 1 of 1, 0, 0.5, 0 leans a Cube over, moving its top half a metre along X per metre of height.',
    stops: ['A row that is not four numbers.', 'A matrix that squashes shapes flat.', SOLID_SCRIPT_STOPS_END],
    nesting: 'open',
    parameters: [
      solidScriptParameterRow('row1', 'Row 1', '1, 0, 0, 0', 'How X is made from x, y, z, plus a move along X.'),
      solidScriptParameterRow('row2', 'Row 2', '0, 1, 0, 0', 'How Y is made from x, y, z, plus a move along Y.'),
      solidScriptParameterRow('row3', 'Row 3', '0, 0, 1, 0', 'How Z is made from x, y, z, plus a move along Z.'),
    ],
    listing: (read) => ['Matrix', read.value('row1'), ' / ', read.value('row2'), ' / ', read.value('row3')],
    execute: (run) => run.transformed(solidScriptMatrixRows(run.fields())),
  }),
  new SolidScriptCommand({
    id: 'linear_extrude',
    named: true,
    intoList: true,
    label: 'Linear Extrude',
    category: 'Transforms',
    description: 'Pull flat outlines up into solids',
    manual:
      'Lays the flat outlines between this line and its End (Square, Circle, Polygon) on the ground, their Y running to the back, and pulls them straight up along Y into solids. Anchor is Center by default, so the middle of its height sits on the origin; Bottom makes the extrusion stand on the outlines. Top Scale below 1 narrows the top, for a tapered shape. Mode chooses how the brush combines with the ones before it: Additive, Subtractive or Intersecting. Into is always a list of the brushes it built, even when there is only one. Example: a Polygon star with height 0.2 gives a star-shaped tile.',
    stops: [
      'A height of 0 or less.',
      'A solid such as Cube between this line and its End. Only flat outlines can be extruded.',
      'A Linear Extrude inside another one.',
      SOLID_SCRIPT_STOPS_END,
    ],
    nesting: 'open',
    parameters: [
      solidScriptParameter('height', 'Height', 'number', '1', 'How far the outlines are pulled up along Y, in metres.'),
      solidScriptParameterAnchor(SOLID_SCRIPT_ANCHOR_HEIGHT),
      solidScriptParameter(
        'scale',
        'Top Scale',
        'vector2',
        '1, 1',
        'Size of the top outline relative to the base. 1 keeps it.',
      ),
      solidScriptParameterMode(),
    ],
    listing: (read) => [
      'Linear Extrude',
      'Height ',
      read.value('height'),
      ...solidScriptListingOptions([
        read.changed('anchor') && ['Anchor ', read.value('anchor')],
        read.changed('scale') && ['Top Scale ', read.value('scale')],
        read.changed('mode') && ['Mode ', read.value('mode')],
      ]),
    ],
    execute: (run) => run.extruded(run.fields()),
  }),
  new SolidScriptCommand({
    id: 'rotate_extrude',
    named: true,
    intoList: true,
    label: 'Rotate Extrude',
    category: 'Transforms',
    description: 'Spin flat outlines around the Y axis',
    manual:
      "Spins the flat outlines between this line and its End (Square, Circle, Polygon) around the upright Y axis, like clay on a potter's wheel. The outline's X is the distance from the axis and its Y the height. Angle below 360 leaves a gap, for a partial ring or a curved wall. Each piece becomes one brush per side. Into is always a list of those brushes, even when there is only one. Mode chooses how each brush combines with the ones before it: Additive, Subtractive or Intersecting. Example: a Square of 0.5, 2 moved to X = 3 and spun 360 degrees gives a round tower wall.",
    stops: [
      'An outline with points at X below 0.',
      'An angle of 0 or more than 360.',
      'A solid such as Cube between this line and its End.',
      SOLID_SCRIPT_STOPS_END,
    ],
    nesting: 'open',
    parameters: [
      solidScriptParameter('angle', 'Angle', 'number', '360', 'How far to spin, in degrees. 360 is a full ring.'),
      solidScriptParameter(
        'sides',
        'Sides',
        'count',
        String(SOLID_SCRIPT_SIDES.default),
        'Brushes per full turn, 3 to 128. More sides look rounder and cost more polygons.',
      ),
      solidScriptParameterMode(),
    ],
    listing: (read) => [
      'Rotate Extrude',
      ...solidScriptListingOptions([
        read.changed('angle') && ['Angle ', read.value('angle')],
        read.changed('sides') && ['Sides ', read.value('sides')],
        read.changed('mode') && ['Mode ', read.value('mode')],
      ]),
    ],
    execute: (run) => {
      if (run.planar) throw new Error('Rotate Extrude cannot be inside a Linear Extrude');
      const flat = solidScriptShapeJoin(run.local(true), 'rotate_extrude');
      const name = run.text(SOLID_SCRIPT_SHAPE_NAME_KEY).trim();
      return flat
        ? run.placed([solidScriptShapeNamed(solidScriptRotateExtrude(flat, run.fields(), new THREE.Matrix4()), name)])
        : [];
    },
  }),
];

/** Commands that combine the shapes between them and their End into one. */
export const SOLID_SCRIPT_COMMANDS_COMBINE: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'hull',
    named: true,
    label: 'Hull',
    category: 'Combine',
    description: 'Wrap brushes or points in one solid',
    manual:
      'Wraps the brushes, Point lines and the optional Points From List between this line and its End in one convex solid, like shrink wrap stretched around them. A list of vectors such as the points Scatter Points writes can be handed over in Points From List, so Hull (From [Spots]) wraps those points. Points inside the wrap are ignored, so the result is never hollow or dented. Mode chooses how the brush combines with the ones before it: Additive, Subtractive or Intersecting. Example: two small spheres far apart give a capsule. Scatter Points on a Cube, then Hull From the points, gives an irregular rock.',
    stops: ['Fewer than four corners, or corners that all lie in one plane.', 'A missing End line.'],
    nesting: 'open',
    parameters: [
      solidScriptParameterOptional(
        'points',
        'Points From List',
        'points3',
        'Optional: a list of x, y, z points, such as a list variable [Spots] from Scatter Points, or vectors written [0, 0, 0], [2, 0, 0], [0, 2, 0], [0, 0, 2]. Point lines and brushes inside add more.',
      ),
      solidScriptParameterMode(),
    ],
    listing: (read) => [
      'Hull',
      ...solidScriptListingOptions([
        read.changed('points') && ['From ', read.value('points')],
        read.changed('mode') && ['Mode ', read.value('mode')],
      ]),
    ],
    execute: (run) => run.hulled(solidScriptHullListed(run)),
  }),
  new SolidScriptCommand({
    id: 'minkowski',
    label: 'Minkowski',
    category: 'Combine',
    description: 'Grow a brush by sweeping others over it',
    manual:
      'Grows the first shape between this line and its End by the shapes after it, as if their middle were swept over every point of the first. A small Sphere after a Cube rounds every edge and corner. A flat Cylinder after a Square inside a Linear Extrude gives rounded corners. Each later shape counts as its convex hull. Mode chooses how the brush combines with the ones before it: Additive, Subtractive or Intersecting. Example: Cube 2, 2, 1 then Sphere Radius 0.2 gives a box 2.4 by 2.4 by 1.4 with soft edges.',
    stops: ['Too many corner points: use fewer Sides.', SOLID_SCRIPT_STOPS_END],
    nesting: 'open',
    parameters: [solidScriptParameterMode()],
    listing: (read) => [
      'Minkowski',
      ...solidScriptListingOptions([read.changed('mode') && ['Mode ', read.value('mode')]]),
    ],
    execute: (run) => run.placed(solidScriptMinkowski(run.local(run.planar), 'minkowski', run.planar)),
  }),
];
