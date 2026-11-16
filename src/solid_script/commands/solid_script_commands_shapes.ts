import * as THREE from 'three';
import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptListingOptions } from './solid_script_command_listing.js';
import {
  solidScriptParameter,
  solidScriptParameterCenter,
  solidScriptParameterOptional,
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
      'Builds a box with the given width (X), depth (Y) and height (Z) in metres. Its middle sits on the origin, the centre of the generator. Switch Center off to put its corner there instead, so it grows along X, Y and Z. Example: a size of 2, 1, 0.2 gives a flat slab two metres wide.',
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
      'Builds a faceted ball with its middle on the origin. Sides sets the faces around it, Rings the bands from bottom to top. More of either looks rounder but costs more polygons. Example: radius 0.5 with 8 sides and 4 rings gives a low-poly ball one metre across.',
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
      'Builds a faceted cylinder around the Z axis, centred on the origin. Switch Center off to stand it on the origin instead. Give the top a different radius to make a tapered cone, or 0 for a point. Sides sets the faces around it. Example: height 2, bottom radius 1 and top radius 0 gives a pointed cone.',
    stops: [
      'A height of 0 or less.',
      'A negative radius, or both radii at 0.',
      'Sides outside 3 to 64, or a count with decimals.',
    ],
    parameters: [
      solidScriptParameter('h', 'Height', 'number', '1', 'Height along Z in metres.'),
      solidScriptParameter('r1', 'Bottom Radius', 'number', '1', 'Radius at the bottom in metres.'),
      solidScriptParameter('r2', 'Top Radius', 'number', '1', 'Radius at the top in metres. 0 makes a pointed cone.'),
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
    description: 'Build a solid around Point lines',
    manual:
      'Builds the convex solid that wraps the corner points given by the Point lines between this line and its End, like shrink wrap around pins. Points inside the wrap are ignored, so the result is never hollow or dented. The lines inside may use Repeat, For Each, If, Set and moves such as Translate, so corners can come from loops and formulas. Points From List adds the points of a list variable too, such as [Corners]. Example: Points at 0, 0, 0 and 1, 0, 0 and 0, 1, 0 and 0, 0, 1 give a small three-sided pyramid.',
    stops: [
      'Fewer than four points.',
      'Points that all lie in one plane.',
      'A solid or flat shape among the Point lines.',
      'A missing End line.',
    ],
    nesting: 'open',
    parameters: [
      solidScriptParameterOptional(
        'points',
        'Points From List',
        'points3',
        'Optional: a list of x, y, z points, such as a list variable [Corners]. Point lines inside add more.',
      ),
    ],
    listing: (read) => [
      'Polyhedron',
      ...solidScriptListingOptions([read.changed('points') && ['From ', read.value('points')]]),
    ],
    execute: (run) => run.solid(solidScriptPolyhedronPoints(run.fields(), run.gathered('points').points)),
  }),
  new SolidScriptCommand({
    id: 'point',
    label: 'Point',
    category: 'Solids',
    description: 'Add a corner to a Polyhedron or Polygon',
    manual:
      'Adds one corner point at X, Y and Z in metres to the Polyhedron or Polygon around this line, moved by any Translate, Rotate or other move between them. A Polygon uses X and Y and ignores Z. Each value may be a variable or a formula, so a Repeat around a Point can place many corners. Example: inside Repeat [I] from 0 to 5, Point [=Cos([I] * 60)], [=Sin([I] * 60)], 0 adds the six corners of a hexagon.',
    stops: ['Being placed outside a Polyhedron or Polygon.', 'A position that is not x, y, z.'],
    parameters: [
      solidScriptParameter('position', 'Position', 'vector3', '0, 0, 0', 'X, Y and Z of the corner in metres.'),
    ],
    listing: (read) => ['Point', read.value('position')],
    execute: (run) => {
      const xyz = run.fields().vector('position', [0, 0, 0]);
      return run.point(new THREE.Vector3(xyz[0], xyz[1], xyz[2] ?? 0), null);
    },
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
    description: 'Draw an outline through Point lines',
    manual:
      'Draws a flat outline through the Point lines between this line and its End, in order around the edge. Each Point gives X and Y, and Z is ignored. Unlike the solids it may be dented (concave), such as an L or a star. It is split into convex brushes when extruded. It only works inside a Linear Extrude. The lines inside may use Repeat, For Each, If and Set, and Points From List adds the points of a list variable such as [Outline]. Example: Points at 0, 0 and 2, 0 and 2, 1 and 1, 1 and 1, 2 and 0, 2 give an L.',
    stops: ['Fewer than three points.', 'Being placed outside a Linear Extrude.', 'A missing End line.'],
    nesting: 'open',
    parameters: [
      solidScriptParameterOptional(
        'points',
        'Points From List',
        'points2',
        'Optional: a list of x, y points in outline order, such as a list variable [Outline]. Point lines inside add more.',
      ),
    ],
    listing: (read) => [
      'Polygon',
      ...solidScriptListingOptions([read.changed('points') && ['From ', read.value('points')]]),
    ],
    execute: (run) => run.outline(solidScriptPolygonOutline(run.fields(), run.gathered('points').points)),
  }),
];
