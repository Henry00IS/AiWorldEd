import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptListingOptions } from './solid_script_command_listing.js';
import {
  solidScriptParameter,
  solidScriptParameterCenter,
  solidScriptParameterRings,
  solidScriptParameterSides,
} from './solid_script_command_parameters.js';
import {
  solidScriptCircleOutline,
  solidScriptCubePoints,
  solidScriptCylinderPoints,
  solidScriptPolygonOutline,
  solidScriptPolyhedronPoints,
  solidScriptSpherePoints,
  solidScriptSquarePoints,
} from '@/solid_script/language/solid_script_primitives.js';

/** Commands that build one convex solid each. */
export const SOLID_SCRIPT_COMMANDS_SOLIDS: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'cube',
    label: 'Cube',
    category: 'Solids',
    description: 'Build a box',
    manual:
      'Builds a box with the given width (X), depth (Y) and height (Z) in metres. Its middle sits on the origin, the centre of the generator; switch Center off to put its corner there instead, so it grows along X, Y and Z. Example: a size of 2, 1, 0.2 gives a flat slab two metres wide.',
    stops: ['A size of 0 or less on any axis.', 'A size that is not one number or three numbers separated by commas.'],
    parameters: [
      solidScriptParameter('size', 'Size', 'vector3', '1, 1, 1', 'Width (X), depth (Y) and height (Z) in metres.'),
      solidScriptParameterCenter(),
    ],
    listing: (read) => [
      'Cube',
      read.value('size'),
      ...solidScriptListingOptions([!read.on('center') && ['Not Centered']]),
    ],
    execute: (run) => run.solid(solidScriptCubePoints(run.fields())),
  }),
  new SolidScriptCommand({
    id: 'sphere',
    label: 'Sphere',
    category: 'Solids',
    description: 'Build a ball',
    manual:
      'Builds a faceted ball with its middle on the origin. Sides sets the faces around it, Rings the bands from bottom to top; more of either looks rounder but costs more polygons. Example: radius 0.5 with 8 sides and 4 rings gives a low-poly ball one metre across.',
    stops: ['A radius of 0 or less.', 'Sides outside 3 to 64 or Rings outside 2 to 32, or a count with decimals.'],
    parameters: [
      solidScriptParameter('r', 'Radius', 'number', '1', 'Distance from the middle to the surface in metres.'),
      solidScriptParameterSides(),
      solidScriptParameterRings(),
    ],
    listing: (read) => [
      'Sphere',
      'radius ',
      read.value('r'),
      ...solidScriptListingOptions([
        read.changed('sides') && ['Sides ', read.value('sides')],
        read.changed('rings') && ['Rings ', read.value('rings')],
      ]),
    ],
    execute: (run) => run.solid(solidScriptSpherePoints(run.fields())),
  }),
  new SolidScriptCommand({
    id: 'cylinder',
    label: 'Cylinder',
    category: 'Solids',
    description: 'Build a cylinder or cone',
    manual:
      'Builds a faceted cylinder around the Z axis, centred on the origin; switch Center off to stand it on the origin instead. Give the top a different radius to make a tapered cone, or 0 for a point. Sides sets the faces around it. Example: height 2, bottom radius 1 and top radius 0 gives a pointed cone.',
    stops: [
      'A height of 0 or less.',
      'A negative radius, or both radii at 0.',
      'Sides outside 3 to 64, or a count with decimals.',
    ],
    parameters: [
      solidScriptParameter('h', 'Height', 'number', '1', 'Height along Z in metres.'),
      solidScriptParameter('r1', 'Bottom Radius', 'number', '1', 'Radius at the bottom in metres.'),
      solidScriptParameter('r2', 'Top Radius', 'number', '1', 'Radius at the top in metres; 0 makes a pointed cone.'),
      solidScriptParameterCenter(),
      solidScriptParameterSides(),
    ],
    listing: (read) => [
      'Cylinder',
      'height ',
      read.value('h'),
      ', radius ',
      read.value('r1'),
      read.text('r1') !== read.text('r2') && ' to ',
      read.text('r1') !== read.text('r2') && read.value('r2'),
      ...solidScriptListingOptions([
        !read.on('center') && ['Not Centered'],
        read.changed('sides') && ['Sides ', read.value('sides')],
      ]),
    ],
    execute: (run) => run.solid(solidScriptCylinderPoints(run.fields())),
  }),
  new SolidScriptCommand({
    id: 'polyhedron',
    label: 'Polyhedron',
    category: 'Solids',
    description: 'Build a solid around corner points',
    manual:
      'Builds the convex solid that wraps corner points, like shrink wrap around pins. Write each point as x, y, z and separate the points with semicolons. Points inside the wrap are ignored, so the result is never hollow or dented. Example: 0, 0, 0; 1, 0, 0; 0, 1, 0; 0, 0, 1 gives a small three-sided pyramid.',
    stops: ['Fewer than four points, or a point that is not x, y, z.', 'Points that all lie in one plane.'],
    parameters: [
      solidScriptParameter(
        'points',
        'Points',
        'points3',
        '0, 0, 0; 1, 0, 0; 0, 1, 0; 0, 0, 1',
        'At least four corner points in metres: x, y, z for each, separated by semicolons.',
      ),
    ],
    listing: (read) => ['Polyhedron', 'around ', read.value('points')],
    execute: (run) => run.solid(solidScriptPolyhedronPoints(run.fields())),
  }),
];

/** Commands that draw a flat outline for Linear Extrude. */
export const SOLID_SCRIPT_COMMANDS_PLANAR: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'square',
    label: 'Square',
    category: '2D Shapes',
    description: 'Draw a rectangle outline',
    manual:
      'Draws a flat rectangle with the given width (X) and depth (Y) in metres, centred on the origin unless Center is off. It only works inside a Linear Extrude, which pulls it up into a solid. Example: a size of 3, 0.2 extruded by 1 gives a thin wall.',
    stops: ['A size of 0 or less on either axis.', 'Being placed outside a Linear Extrude.'],
    parameters: [
      solidScriptParameter('size', 'Size', 'vector2', '1, 1', 'Width (X) and depth (Y) in metres.'),
      solidScriptParameterCenter(),
    ],
    listing: (read) => [
      'Square',
      read.value('size'),
      ...solidScriptListingOptions([!read.on('center') && ['Not Centered']]),
    ],
    execute: (run) => run.outline(solidScriptSquarePoints(run.fields())),
  }),
  new SolidScriptCommand({
    id: 'circle',
    label: 'Circle',
    category: '2D Shapes',
    description: 'Draw a circle outline',
    manual:
      'Draws a flat faceted circle around the origin. It only works inside a Linear Extrude. Sides sets how many straight edges go around it. Example: radius 1 with 6 sides extruded by 0.3 gives a hexagonal tile.',
    stops: ['A radius of 0 or less.', 'Sides outside 3 to 64.', 'Being placed outside a Linear Extrude.'],
    parameters: [
      solidScriptParameter('r', 'Radius', 'number', '1', 'Distance from the middle to the edge in metres.'),
      solidScriptParameterSides(),
    ],
    listing: (read) => [
      'Circle',
      'radius ',
      read.value('r'),
      ...solidScriptListingOptions([read.changed('sides') && ['Sides ', read.value('sides')]]),
    ],
    execute: (run) => run.outline(solidScriptCircleOutline(run.fields())),
  }),
  new SolidScriptCommand({
    id: 'polygon',
    label: 'Polygon',
    category: '2D Shapes',
    description: 'Draw an outline through points',
    manual:
      'Draws a flat outline through points in order around the edge: x, y for each, separated by semicolons. Unlike the solids it may be dented (concave), such as an L or a star; it is split into convex brushes when extruded. It only works inside a Linear Extrude. Example: 0, 0; 2, 0; 2, 1; 1, 1; 1, 2; 0, 2 gives an L.',
    stops: ['Fewer than three points, or a point that is not x, y.', 'Being placed outside a Linear Extrude.'],
    parameters: [
      solidScriptParameter(
        'points',
        'Points',
        'points2',
        '0, 0; 2, 0; 1, 2',
        'At least three points in metres in order around the outline: x, y for each, separated by semicolons.',
      ),
    ],
    listing: (read) => ['Polygon', 'through ', read.value('points')],
    execute: (run) => run.outline(solidScriptPolygonOutline(run.fields())),
  }),
];
