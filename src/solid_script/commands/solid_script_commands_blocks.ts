import * as THREE from 'three';
import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptListingOptions } from './solid_script_command_listing.js';
import {
  solidScriptParameter,
  solidScriptParameterAnchor,
  solidScriptParameterMode,
  solidScriptParameterOptional,
} from './solid_script_command_parameters.js';
import { SOLID_SCRIPT_ANCHOR_HEIGHT } from '@/solid_script/language/solid_script_anchor.js';
import { solidScriptMinkowski, solidScriptRotateExtrude } from '@/solid_script/language/solid_script_reshape.js';
import {
  SOLID_SCRIPT_SHAPE_NAME_KEY,
  solidScriptShapeJoin,
  solidScriptShapeNamed,
} from '@/solid_script/language/solid_script_shape.js';
import { solidScriptHullListed } from '@/solid_script/language/solid_script_hull.js';
import { SOLID_SCRIPT_SIDES } from '@/solid_script/language/solid_script_primitives.js';

/** What stops every block without its End. */
const SOLID_SCRIPT_STOPS_END = 'A missing End line.';

/** Commands that pull or spin flat paths into solids. */
export const SOLID_SCRIPT_COMMANDS_TRANSFORMS: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'linear_extrude',
    named: true,
    intoList: true,
    label: 'Linear Extrude',
    category: 'Transforms',
    description: 'Pull flat paths up into solids',
    manual:
      'Lays the flat paths between this line and its End (Square, Circle, Polygon) on the ground, their Y running to the back, and pulls them straight up along Y into solids. Anchor is Center by default, so the middle of its height sits on the origin; Bottom makes the extrusion stand on the paths. Top Scale below 1 narrows the top, for a tapered shape. Mode chooses how the solid combines with the ones before it: Additive, Subtractive or Intersecting. Into is always a list of the solids it built, even when there is only one. Example: a Polygon star with height 0.2 gives a star-shaped tile.',
    stops: [
      'A height of 0 or less.',
      'A solid such as Cube between this line and its End. Only flat paths can be extruded.',
      'A Linear Extrude inside another one.',
      SOLID_SCRIPT_STOPS_END,
    ],
    nesting: 'open',
    parameters: [
      solidScriptParameter(
        'height',
        'Height',
        'number',
        '1',
        'How far the paths are pulled up along Y, in metres, such as 2.',
      ),
      solidScriptParameterAnchor(SOLID_SCRIPT_ANCHOR_HEIGHT),
      solidScriptParameter(
        'scale',
        'Top Scale',
        'vector2',
        '1, 1',
        'Size of the top path relative to the base, such as 0.5, 0.5 to taper it. 1 keeps it.',
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
    description: 'Spin flat paths around the Y axis',
    manual:
      "Spins the flat paths between this line and its End (Square, Circle, Polygon) around the upright Y axis, like clay on a potter's wheel. The path's X is the distance from the axis and its Y the height. Angle below 360 leaves a gap, for a partial ring or a curved wall. Each piece becomes one solid per side. Into is always a list of those solids, even when there is only one. Mode chooses how each solid combines with the ones before it: Additive, Subtractive or Intersecting. Example: a Square of 0.5, 2 moved to X = 3 and spun 360 degrees gives a round tower wall.",
    stops: [
      'A path with points at X below 0.',
      'An angle of 0 or more than 360.',
      'A solid such as Cube between this line and its End.',
      SOLID_SCRIPT_STOPS_END,
    ],
    nesting: 'open',
    parameters: [
      solidScriptParameter(
        'angle',
        'Angle',
        'number',
        '360',
        'How far to spin, in degrees, such as 180 for a half ring. 360 is a full ring.',
      ),
      solidScriptParameter(
        'sides',
        'Sides',
        'count',
        String(SOLID_SCRIPT_SIDES.default),
        'Solids per full turn, 3 to 128, such as 16. More sides look rounder and cost more polygons.',
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
    description: 'Wrap solids or points in one solid',
    manual:
      'Wraps the solids, Point lines and the optional Points From List between this line and its End in one convex solid, like shrink wrap stretched around them. A list of vectors such as the points Scatter Points writes can be handed over in Points From List, so Hull (From [Spots]) wraps those points. Points inside the wrap are ignored, so the result is never hollow or dented. Mode chooses how the solid combines with the ones before it: Additive, Subtractive or Intersecting. Example: two small spheres far apart give a capsule. Scatter Points on a Cube, then Hull From the points, gives an irregular rock.',
    stops: ['Fewer than four corners, or corners that all lie in one plane.', 'A missing End line.'],
    nesting: 'open',
    parameters: [
      solidScriptParameterOptional(
        'points',
        'Points From List',
        'points3',
        'Optional: a list of x, y, z points, such as a list variable [Spots] from Scatter Points, or vectors written [0, 0, 0], [2, 0, 0], [0, 2, 0], [0, 0, 2]. Point lines and solids inside add more.',
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
    description: 'Grow a solid by sweeping others over it',
    manual:
      'Grows the first shape between this line and its End by the shapes after it, as if their middle were swept over every point of the first. A small Sphere after a Cube rounds every edge and corner. A flat Cylinder after a Square inside a Linear Extrude gives rounded corners. Each later shape counts as its convex hull. Mode chooses how the solid combines with the ones before it: Additive, Subtractive or Intersecting. Example: Cube 2, 2, 1 then Sphere Radius 0.2 gives a box 2.4 by 2.4 by 1.4 with soft edges.',
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
