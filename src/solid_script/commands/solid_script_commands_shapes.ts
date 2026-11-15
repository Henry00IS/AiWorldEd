import { SolidScriptCommandModule } from './solid_script_command_module.js';
import { solidScriptParameter, solidScriptParameterCenter } from './solid_script_command_parameters.js';

/** Commands that make one convex solid. */
export const SOLID_SCRIPT_COMMANDS_SOLIDS: readonly SolidScriptCommandModule[] = [
  new SolidScriptCommandModule({
    module: 'cube',
    label: 'Cube',
    category: 'Solids',
    description: 'A box of the given width, depth and height in metres.',
    parameters: [
      solidScriptParameter('size', 'Size', 'vector3', '[1, 1, 1]', 'Width (X), depth (Y) and height (Z) in metres.'),
      solidScriptParameterCenter(),
    ],
  }),
  new SolidScriptCommandModule({
    module: 'sphere',
    label: 'Sphere',
    category: 'Solids',
    description: 'A faceted ball around the origin. Detail sets how many facets it gets.',
    parameters: [solidScriptParameter('r', 'Radius', 'number', '1', 'Radius in metres.')],
  }),
  new SolidScriptCommandModule({
    module: 'cylinder',
    label: 'Cylinder',
    category: 'Solids',
    description: 'A faceted cylinder or cone standing on the origin. Different radii make a cone.',
    parameters: [
      solidScriptParameter('h', 'Height', 'number', '1', 'Height along Z in metres.'),
      solidScriptParameter('r1', 'Bottom Radius', 'number', '1', 'Radius at the bottom in metres.'),
      solidScriptParameter('r2', 'Top Radius', 'number', '1', 'Radius at the top in metres; 0 makes a pointed cone.'),
      solidScriptParameterCenter(),
    ],
  }),
  new SolidScriptCommandModule({
    module: 'polyhedron',
    label: 'Polyhedron',
    category: 'Solids',
    description: 'The convex solid around a list of [x, y, z] points.',
    parameters: [
      solidScriptParameter(
        'points',
        'Points',
        'expression',
        '[[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]]',
        'At least four [x, y, z] corner points in metres.',
      ),
    ],
  }),
];

/** Commands that draw a 2D outline for Linear Extrude. */
export const SOLID_SCRIPT_COMMANDS_PLANAR: readonly SolidScriptCommandModule[] = [
  new SolidScriptCommandModule({
    module: 'square',
    label: 'Square',
    category: '2D Shapes',
    description: 'A rectangle outline; place it inside Linear Extrude.',
    parameters: [
      solidScriptParameter('size', 'Size', 'vector2', '[1, 1]', 'Width (X) and depth (Y) in metres.'),
      solidScriptParameterCenter(),
    ],
  }),
  new SolidScriptCommandModule({
    module: 'circle',
    label: 'Circle',
    category: '2D Shapes',
    description: 'A faceted circle outline; place it inside Linear Extrude.',
    parameters: [solidScriptParameter('r', 'Radius', 'number', '1', 'Radius in metres.')],
  }),
  new SolidScriptCommandModule({
    module: 'polygon',
    label: 'Polygon',
    category: '2D Shapes',
    description: 'An outline through [x, y] points; place it inside Linear Extrude. It may be concave.',
    parameters: [
      solidScriptParameter(
        'points',
        'Points',
        'expression',
        '[[0, 0], [2, 0], [1, 2]]',
        'At least three [x, y] points in metres, in order around the outline.',
      ),
    ],
  }),
];
