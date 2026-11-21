import * as THREE from 'three';
import { SOLID_SCRIPT_ANCHOR_FLAT, SOLID_SCRIPT_ANCHOR_SOLID } from '@/solid_script/language/solid_script_anchor.js';
import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptListingOptions } from './solid_script_command_listing.js';
import {
  solidScriptParameter,
  solidScriptParameterAnchor,
  solidScriptParameterMode,
  solidScriptParameterOptional,
  solidScriptParameterRings,
  solidScriptParameterSides,
} from './solid_script_command_parameters.js';
import {
  solidScriptCircleOutline,
  solidScriptCubeBody,
  solidScriptCylinderPiece,
  solidScriptPolygonOutline,
  solidScriptPolyhedronPoints,
  solidScriptSpherePiece,
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
      'Builds a box with the given width (X), height (Y) and depth (Z) in metres. Anchor picks the spot of the box that sits on the origin, the center of the generator: Center, Center, Center ⭐ by default, so its middle sits there; Center, Bottom, Center ⭐ makes it stand on the origin, and Left, Bottom, Back puts its corner there so it grows along X, Y and Z. Mode chooses how the solid combines with the ones before it: Additive, Subtractive or Intersecting. Example: a size of 2, 0.2, 1 gives a flat slab two metres wide.',
    stops: ['A size of 0 or less on any axis.', 'A size that is not one number or three numbers separated by commas.'],
    parameters: [
      solidScriptParameter(
        'size',
        'Size',
        'vector3',
        '1, 1, 1',
        'Width (X), height (Y) and depth (Z) in metres, such as 2, 1, 2.',
      ),
      solidScriptParameterAnchor(SOLID_SCRIPT_ANCHOR_SOLID),
      solidScriptParameterMode(),
    ],
    listing: (read) => [
      'Cube',
      read.value('size'),
      ...solidScriptListingOptions([
        read.changed('anchor') && ['Anchor ', read.value('anchor')],
        read.changed('mode') && ['Mode ', read.value('mode')],
      ]),
    ],
    execute: (run) => run.solid(solidScriptCubeBody(run.fields())),
  }),
  new SolidScriptCommand({
    id: 'sphere',
    label: 'Sphere',
    category: 'Solids',
    description: 'Build a ball',
    manual:
      'Builds a faceted ball with its middle on the origin by default (Center, Center, Center ⭐); Center, Bottom, Center ⭐ makes it stand on the origin. Sides sets the faces around it, Rings the bands from bottom to top. More of either looks rounder but costs more polygons. Mode chooses how the solid combines with the ones before it: Additive, Subtractive or Intersecting. Example: radius 0.5 with 8 sides and 4 rings gives a low-poly ball one metre across.',
    stops: ['A radius of 0 or less.', 'Sides outside 3 to 64 or Rings outside 2 to 32, or a count with decimals.'],
    parameters: [
      solidScriptParameter(
        'r',
        'Radius',
        'number',
        '1',
        'Distance from the middle to the surface in metres, such as 1.',
      ),
      solidScriptParameterSides(),
      solidScriptParameterRings(),
      solidScriptParameterAnchor(SOLID_SCRIPT_ANCHOR_SOLID),
      solidScriptParameterMode(),
    ],
    listing: (read) => [
      'Sphere',
      'Radius ',
      read.value('r'),
      ...solidScriptListingOptions([
        read.changed('sides') && ['Sides ', read.value('sides')],
        read.changed('rings') && ['Rings ', read.value('rings')],
        read.changed('anchor') && ['Anchor ', read.value('anchor')],
        read.changed('mode') && ['Mode ', read.value('mode')],
      ]),
    ],
    execute: (run) => {
      const piece = solidScriptSpherePiece(run.fields());
      return run.solid(piece.body, piece.faceUvs);
    },
  }),
  new SolidScriptCommand({
    id: 'cylinder',
    label: 'Cylinder',
    category: 'Solids',
    description: 'Build a cylinder or cone',
    manual:
      'Builds a faceted cylinder standing up along the Y axis. By default its middle sits on the origin (Center, Center, Center ⭐); Center, Bottom, Center ⭐ makes it stand on the origin. Give the top a different radius to make a tapered cone, or 0 for a point. Sides sets the faces around it. Mode chooses how the solid combines with the ones before it: Additive, Subtractive or Intersecting. Example: height 2, bottom radius 1 and top radius 0 gives a pointed cone.',
    stops: [
      'A height of 0 or less.',
      'A negative radius, or both radii at 0.',
      'Sides outside 3 to 64, or a count with decimals.',
    ],
    parameters: [
      solidScriptParameter('h', 'Height', 'number', '1', 'Height along Y in metres, such as 2.'),
      solidScriptParameter('r1', 'Bottom Radius', 'number', '1', 'Radius at the bottom in metres, such as 1.'),
      solidScriptParameter(
        'r2',
        'Top Radius',
        'number',
        '1',
        'Radius at the top in metres, such as 0.5. 0 makes a pointed cone.',
      ),
      solidScriptParameterAnchor(SOLID_SCRIPT_ANCHOR_SOLID),
      solidScriptParameterSides(),
      solidScriptParameterMode(),
    ],
    listing: (read) => [
      'Cylinder',
      'Height ',
      read.value('h'),
      ', Radius ',
      read.value('r1'),
      read.text('r1') !== read.text('r2') && ' To ',
      read.text('r1') !== read.text('r2') && read.value('r2'),
      ...solidScriptListingOptions([
        read.changed('anchor') && ['Anchor ', read.value('anchor')],
        read.changed('sides') && ['Sides ', read.value('sides')],
        read.changed('mode') && ['Mode ', read.value('mode')],
      ]),
    ],
    execute: (run) => {
      const piece = solidScriptCylinderPiece(run.fields());
      return run.solid(piece.body, piece.faceUvs);
    },
  }),
  new SolidScriptCommand({
    id: 'polyhedron',
    label: 'Polyhedron',
    category: 'Solids',
    description: 'Build a solid around Point lines',
    manual:
      'Builds the convex solid that wraps the corner points given by the Point lines between this line and its End, like shrink wrap around pins. Points inside the wrap are ignored, so the result is never hollow or dented. The lines inside may use Repeat, For Each, If, Set and moves such as Transform, so corners can come from loops and formulas. Points From List adds the points of a list variable too, such as [Corners]. Mode chooses how the solid combines with the ones before it: Additive, Subtractive or Intersecting. Example: Points at 0, 0, 0 and 1, 0, 0 and 0, 1, 0 and 0, 0, 1 give a small three-sided pyramid.',
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
        'Optional: a list of x, y, z points, such as a list variable [Corners] or vectors written [0, 0, 0], [2, 0, 0], [0, 2, 0], [0, 0, 2]. Point lines inside add more.',
      ),
      solidScriptParameterMode(),
    ],
    listing: (read) => [
      'Polyhedron',
      ...solidScriptListingOptions([
        read.changed('points') && ['From ', read.value('points')],
        read.changed('mode') && ['Mode ', read.value('mode')],
      ]),
    ],
    execute: (run) => run.solidFromPoints(solidScriptPolyhedronPoints(run.fields(), run.gathered('points').points)),
  }),
  new SolidScriptCommand({
    id: 'point',
    label: 'Point',
    category: 'Solids',
    // A corner builds nothing on its own, so it has no Name or Into.
    named: false,
    description: 'Add a corner to a Polyhedron or Polygon',
    manual:
      'Adds one corner point at X, Y and Z in metres to the Polyhedron or Polygon around this line, moved by any Transform, Rotate or other move between them. A Polygon uses X and Y of its drawing and ignores Z. Each value may be a variable or a formula, so a Repeat around a Point can place many corners. Example: inside Repeat [I] From 0 To 5, Point [=Cos([I] * 60)], [=Sin([I] * 60)], 0 adds the six corners of a hexagon.',
    stops: ['Being placed outside a Polyhedron or Polygon.', 'A position that is not x, y, z.'],
    parameters: [
      solidScriptParameter(
        'position',
        'Position',
        'vector3',
        '0, 0, 0',
        'X, Y and Z of the corner in metres, such as 1, 0, 0.',
      ),
    ],
    listing: (read) => ['Point', read.value('position')],
    execute: (run) => {
      const xyz = run.fields().vector('position', [0, 0, 0]);
      return run.point(new THREE.Vector3(xyz[0], xyz[1], xyz[2] ?? 0), null);
    },
  }),
];

/** Commands that draw a flat path for Linear Extrude. */
export const SOLID_SCRIPT_COMMANDS_PLANAR: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'square',
    draws: true,
    label: 'Square',
    category: '2D Shapes',
    description: 'Draw a rectangle path',
    manual:
      'Draws a flat rectangle with the given width (X) and depth (Y of the drawing, which runs to the back once extruded) in metres, centered on the origin; Anchor picks another spot of it, such as Left, Front for the corner that ends up front left. It only works inside a Linear Extrude, which pulls it up into a solid, or a Rotate Extrude. A Name lets later lines inside the same block move, turn or scale it, such as Move By 1, 0, 0 Of Ring. Into writes the path to a variable, so Move By 1, 0, 0 Of [Ring] moves exactly this one, even when another path has the same Name. Example: a size of 3, 0.2 extruded by 1 gives a thin wall.',
    stops: ['A size of 0 or less on either axis.', 'Being placed outside a Linear Extrude or Rotate Extrude.'],
    parameters: [
      solidScriptParameter(
        'size',
        'Size',
        'vector2',
        '1, 1',
        'Width (X) and depth (drawing Y) in metres, such as 2, 2.',
      ),
      solidScriptParameterAnchor(SOLID_SCRIPT_ANCHOR_FLAT),
    ],
    listing: (read) => [
      'Square',
      read.value('size'),
      ...solidScriptListingOptions([read.changed('anchor') && ['Anchor ', read.value('anchor')]]),
    ],
    execute: (run) => run.pathFlat(solidScriptSquarePoints(run.fields())),
  }),
  new SolidScriptCommand({
    id: 'circle',
    draws: true,
    label: 'Circle',
    category: '2D Shapes',
    description: 'Draw a circle path',
    manual:
      'Draws a flat faceted circle around the origin; Anchor moves another spot of it there, such as Left, Front for its corner. It only works inside a Linear Extrude or Rotate Extrude. A Name lets later lines inside the same block move, turn or scale it, such as Move By 1, 0, 0 Of Ring. Into writes the path to a variable, so Move By 1, 0, 0 Of [Ring] moves exactly this one, even when another path has the same Name. Sides sets how many straight edges go around it. Example: radius 1 with 6 sides extruded by 0.3 gives a hexagonal tile.',
    stops: [
      'A radius of 0 or less.',
      'Sides outside 3 to 64.',
      'Being placed outside a Linear Extrude or Rotate Extrude.',
    ],
    parameters: [
      solidScriptParameter('r', 'Radius', 'number', '1', 'Distance from the middle to the edge in metres, such as 1.'),
      solidScriptParameterSides(),
      solidScriptParameterAnchor(SOLID_SCRIPT_ANCHOR_FLAT),
    ],
    listing: (read) => [
      'Circle',
      'Radius ',
      read.value('r'),
      ...solidScriptListingOptions([
        read.changed('sides') && ['Sides ', read.value('sides')],
        read.changed('anchor') && ['Anchor ', read.value('anchor')],
      ]),
    ],
    execute: (run) => run.pathFlat(solidScriptCircleOutline(run.fields())),
  }),
  new SolidScriptCommand({
    id: 'polygon',
    draws: true,
    label: 'Polygon',
    category: '2D Shapes',
    description: 'Draw a path through Point lines',
    manual:
      'Draws a flat path through the Point lines between this line and its End, in order around the edge. Each Point gives X and Y, and Z is ignored. Unlike the solids it may be dented (concave), such as an L or a star. It is split into convex solids when extruded. It only works inside a Linear Extrude or Rotate Extrude. A Name lets later lines inside the same block move, turn or scale it, such as Move By 1, 0, 0 Of Ring. Into writes the path to a variable, so Move By 1, 0, 0 Of [Ring] moves exactly this one, even when another path has the same Name. The lines inside may use Repeat, For Each, If and Set, and Points From List adds the points of a list variable such as [Path]. Example: Points at 0, 0 and 2, 0 and 2, 1 and 1, 1 and 1, 2 and 0, 2 give an L.',
    stops: [
      'Fewer than three points.',
      'Being placed outside a Linear Extrude or Rotate Extrude.',
      'A missing End line.',
    ],
    nesting: 'open',
    parameters: [
      solidScriptParameterOptional(
        'points',
        'Points From List',
        'points2',
        'Optional: a list of x, y points in path order, such as a list variable [Path]. Point lines inside add more.',
      ),
    ],
    listing: (read) => [
      'Polygon',
      ...solidScriptListingOptions([read.changed('points') && ['From ', read.value('points')]]),
    ],
    execute: (run) => run.pathFlat(solidScriptPolygonOutline(run.fields(), run.gathered('points').points)),
  }),
];
