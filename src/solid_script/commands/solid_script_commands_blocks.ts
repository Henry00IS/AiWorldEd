import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptListingOptions } from './solid_script_command_listing.js';
import { solidScriptParameter, solidScriptParameterCenter } from './solid_script_command_parameters.js';
import {
  solidScriptMirrorMatrix,
  solidScriptRotateMatrix,
  solidScriptScaleMatrix,
  solidScriptTranslateMatrix,
} from '@/solid_script/language/solid_script_transforms.js';

/** What stops every block that must hold something. */
const SOLID_SCRIPT_STOPS_EMPTY = 'Nothing between this line and its End.';

/** What stops every block without its End. */
const SOLID_SCRIPT_STOPS_END = 'A missing End line.';

/**
 * Commands that move, turn, stretch or mirror the shapes between them and their
 * End.
 */
export const SOLID_SCRIPT_COMMANDS_TRANSFORMS: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'translate',
    label: 'Translate',
    category: 'Transforms',
    description: 'Move shapes',
    manual:
      'Moves every shape between this line and its End by the given distance along X, Y and Z in metres. Blocks can be nested: a Translate inside another adds both moves. Example: by 0, 0, 2.5 lifts a lintel onto two posts 2.5 metres high; by [=[i] * 2], 0, 0 inside a Repeat moves each round two metres further.',
    stops: [
      'A value that is not one number or three numbers separated by commas.',
      SOLID_SCRIPT_STOPS_EMPTY,
      SOLID_SCRIPT_STOPS_END,
    ],
    nesting: 'open',
    parameters: [solidScriptParameter('v', 'Offset', 'vector3', '0, 0, 0', 'Distance along X, Y and Z in metres.')],
    listing: (read) => ['Translate', 'by ', read.value('v')],
    execute: (run) => run.transformed(solidScriptTranslateMatrix(run.fields())),
  }),
  new SolidScriptCommand({
    id: 'rotate',
    label: 'Rotate',
    category: 'Transforms',
    description: 'Turn shapes',
    manual:
      'Turns every shape between this line and its End around the origin, first around X, then Y, then Z, in degrees. To turn a shape around its own middle, build it centred, or move it after turning it. Example: by 0, 0, 90 turns a box a quarter turn around the upright Z axis.',
    stops: [
      'A value that is not one number or three numbers separated by commas.',
      SOLID_SCRIPT_STOPS_EMPTY,
      SOLID_SCRIPT_STOPS_END,
    ],
    nesting: 'open',
    parameters: [solidScriptParameter('a', 'Angles', 'vector3', '0, 0, 0', 'Degrees around X, then Y, then Z.')],
    listing: (read) => ['Rotate', 'by ', read.value('a'), ' degrees'],
    execute: (run) => run.transformed(solidScriptRotateMatrix(run.fields())),
  }),
  new SolidScriptCommand({
    id: 'scale',
    label: 'Scale',
    category: 'Transforms',
    description: 'Stretch or shrink shapes',
    manual:
      'Stretches or shrinks every shape between this line and its End, measured from the origin: 1 keeps the size, 2 doubles it, 0.5 halves it. Example: by 1, 1, 2 makes a sphere twice as tall, like an egg; by [=[i] + 1], 1, 1 inside a Repeat stretches each round more.',
    stops: [
      'A value that is not one number or three numbers separated by commas.',
      SOLID_SCRIPT_STOPS_EMPTY,
      SOLID_SCRIPT_STOPS_END,
    ],
    nesting: 'open',
    parameters: [
      solidScriptParameter('v', 'Factors', 'vector3', '1, 1, 1', 'Stretch factor along X, Y and Z; 1 keeps the size.'),
    ],
    listing: (read) => ['Scale', 'by ', read.value('v')],
    execute: (run) => run.transformed(solidScriptScaleMatrix(run.fields())),
  }),
  new SolidScriptCommand({
    id: 'mirror',
    label: 'Mirror',
    category: 'Transforms',
    description: 'Flip shapes to the other side',
    manual:
      'Flips every shape between this line and its End to the other side of a mirror through the origin. The direction says which way the mirror faces: 1, 0, 0 flips left and right. Example: build one post at X = 2, then the same post inside Mirror across 1, 0, 0 to get its twin at X = -2.',
    stops: ['A direction of 0, 0, 0.', SOLID_SCRIPT_STOPS_EMPTY, SOLID_SCRIPT_STOPS_END],
    nesting: 'open',
    parameters: [solidScriptParameter('v', 'Plane Normal', 'vector3', '1, 0, 0', 'Direction the mirror faces.')],
    listing: (read) => ['Mirror', 'across ', read.value('v')],
    execute: (run) => run.transformed(solidScriptMirrorMatrix(run.fields())),
  }),
  new SolidScriptCommand({
    id: 'linear_extrude',
    label: 'Linear Extrude',
    category: 'Transforms',
    description: 'Pull flat outlines up into solids',
    manual:
      'Pulls the flat outlines between this line and its End (Square, Circle, Polygon) straight up along Z into solids. Top Scale below 1 narrows the top, for a tapered shape. Example: a Polygon star with height 0.2 gives a star-shaped tile.',
    stops: [
      'A height of 0 or less.',
      'A solid such as Cube between this line and its End; only flat outlines can be extruded.',
      'A Linear Extrude inside another one.',
      SOLID_SCRIPT_STOPS_EMPTY,
      SOLID_SCRIPT_STOPS_END,
    ],
    nesting: 'open',
    parameters: [
      solidScriptParameter('height', 'Height', 'number', '1', 'How far the outlines are pulled up along Z, in metres.'),
      solidScriptParameterCenter(),
      solidScriptParameter(
        'scale',
        'Top Scale',
        'vector2',
        '1, 1',
        'Size of the top outline relative to the base; 1 keeps it.',
      ),
    ],
    listing: (read) => [
      'Linear Extrude',
      'height ',
      read.value('height'),
      ...solidScriptListingOptions([
        !read.on('center') && ['Not Centered'],
        read.changed('scale') && ['Top Scale ', read.value('scale')],
      ]),
    ],
    execute: (run) => run.extruded(run.fields()),
  }),
];

/** Commands that combine the shapes between them and their End into one. */
export const SOLID_SCRIPT_COMMANDS_COMBINE: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'union',
    label: 'Union',
    category: 'Combine',
    description: 'Join shapes into one',
    manual:
      'Joins the shapes between this line and its End into one object, so later blocks treat them as a whole. Example: put two crossing boxes in a Union, then cut a hole through both with Difference.',
    stops: [SOLID_SCRIPT_STOPS_EMPTY, SOLID_SCRIPT_STOPS_END],
    nesting: 'open',
    parameters: [],
    listing: () => ['Union'],
    execute: (run) => run.combined('union'),
  }),
  new SolidScriptCommand({
    id: 'difference',
    label: 'Difference',
    category: 'Combine',
    description: 'Cut shapes out of the first one',
    manual:
      'Keeps the first shape between this line and its End and cuts every later shape out of it. Example: a Cube followed by a Cylinder gives a block with a round hole where the cylinder was.',
    stops: [
      'A first line that builds no shape, so there is nothing to cut from.',
      SOLID_SCRIPT_STOPS_EMPTY,
      SOLID_SCRIPT_STOPS_END,
    ],
    nesting: 'open',
    parameters: [],
    listing: () => ['Difference'],
    execute: (run) => run.combined('difference'),
  }),
  new SolidScriptCommand({
    id: 'intersection',
    label: 'Intersection',
    category: 'Combine',
    description: 'Keep only where shapes overlap',
    manual:
      'Keeps only the space that every shape between this line and its End fills at the same time. Example: a Cube and a slightly larger Sphere, both centred, give a box with rounded corners.',
    stops: [SOLID_SCRIPT_STOPS_EMPTY, SOLID_SCRIPT_STOPS_END],
    nesting: 'open',
    parameters: [],
    listing: () => ['Intersection'],
    execute: (run) => run.combined('intersection'),
  }),
  new SolidScriptCommand({
    id: 'hull',
    label: 'Hull',
    category: 'Combine',
    description: 'Wrap shapes in one solid',
    manual:
      'Wraps all shapes between this line and its End in one convex solid, like shrink wrap stretched around them. Example: two small spheres far apart give a capsule; four thin cylinders at the corners give a table top with round edges.',
    stops: [SOLID_SCRIPT_STOPS_EMPTY, SOLID_SCRIPT_STOPS_END],
    nesting: 'open',
    parameters: [],
    listing: () => ['Hull'],
    execute: (run) => run.hulled(),
  }),
];
