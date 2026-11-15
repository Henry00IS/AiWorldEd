import { SolidScriptCommandModule } from './solid_script_command_module.js';
import { solidScriptParameter, solidScriptParameterCenter } from './solid_script_command_parameters.js';

/** Commands that move, turn or shape the lines up to their End. */
export const SOLID_SCRIPT_COMMANDS_TRANSFORMS: readonly SolidScriptCommandModule[] = [
  new SolidScriptCommandModule({
    module: 'translate',
    label: 'Translate',
    category: 'Transforms',
    description: 'Moves everything up to its End.',
    opensBlock: true,
    parameters: [solidScriptParameter('v', 'Offset', 'vector3', '[0, 0, 1]', 'Distance along X, Y and Z in metres.')],
  }),
  new SolidScriptCommandModule({
    module: 'rotate',
    label: 'Rotate',
    category: 'Transforms',
    description: 'Turns everything up to its End around the origin.',
    opensBlock: true,
    parameters: [solidScriptParameter('a', 'Angles', 'vector3', '[0, 0, 45]', 'Degrees around X, then Y, then Z.')],
  }),
  new SolidScriptCommandModule({
    module: 'scale',
    label: 'Scale',
    category: 'Transforms',
    description: 'Stretches everything up to its End from the origin.',
    opensBlock: true,
    parameters: [solidScriptParameter('v', 'Factors', 'vector3', '[1, 1, 2]', 'Stretch factor along X, Y and Z.')],
  }),
  new SolidScriptCommandModule({
    module: 'mirror',
    label: 'Mirror',
    category: 'Transforms',
    description: 'Mirrors everything up to its End across a plane through the origin.',
    opensBlock: true,
    parameters: [
      solidScriptParameter('v', 'Plane Normal', 'vector3', '[1, 0, 0]', 'Direction the mirror plane faces.'),
    ],
  }),
  new SolidScriptCommandModule({
    module: 'linear_extrude',
    label: 'Linear Extrude',
    category: 'Transforms',
    description: 'Pulls the 2D shapes up to its End upwards into solids.',
    opensBlock: true,
    parameters: [
      solidScriptParameter('height', 'Height', 'number', '1', 'Extrusion height along Z in metres.'),
      solidScriptParameterCenter(),
      solidScriptParameter('scale', 'Top Scale', 'vector2', '[1, 1]', 'Size of the top outline relative to the base.'),
    ],
  }),
];

/** Commands that combine the shapes up to their End into one. */
export const SOLID_SCRIPT_COMMANDS_COMBINE: readonly SolidScriptCommandModule[] = [
  new SolidScriptCommandModule({
    module: 'union',
    label: 'Union',
    category: 'Combine',
    description: 'Joins the shapes up to its End.',
    opensBlock: true,
    parameters: [],
  }),
  new SolidScriptCommandModule({
    module: 'difference',
    label: 'Difference',
    category: 'Combine',
    description: 'Keeps the first shape and cuts every later shape up to its End out of it.',
    opensBlock: true,
    parameters: [],
  }),
  new SolidScriptCommandModule({
    module: 'intersection',
    label: 'Intersection',
    category: 'Combine',
    description: 'Keeps only where all shapes up to its End overlap.',
    opensBlock: true,
    parameters: [],
  }),
  new SolidScriptCommandModule({
    module: 'hull',
    label: 'Hull',
    category: 'Combine',
    description: 'Wraps the shapes up to its End in one convex solid, like shrink wrap.',
    opensBlock: true,
    parameters: [],
  }),
];
