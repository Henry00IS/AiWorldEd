import * as THREE from 'three';
import { SolidScriptCommand, type SolidScriptCommandParameter } from './solid_script_command.js';
import { solidScriptListingOptions } from './solid_script_command_listing.js';
import {
  solidScriptParameter,
  solidScriptParameterWhen,
  solidScriptParameterWords,
} from './solid_script_command_parameters.js';
import { solidScriptColorRead, solidScriptParameterColor } from './solid_script_color_field.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import {
  solidScriptDebugArrow,
  solidScriptDebugBox,
  solidScriptDebugCircle,
  solidScriptDebugSegment,
  solidScriptDebugSphere,
  type SolidScriptDebugSegment,
} from '@/solid_script/language/solid_script_debug_shapes.js';

/** Shapes Debug Draw draws, with what each means. */
const SOLID_SCRIPT_DEBUG_SHAPES = [
  { word: 'Line', detail: 'A line from Position to To' },
  { word: 'Arrow', detail: 'An arrow from Position to To' },
  { word: 'Ray', detail: 'An arrow from Position along Normal, Distance long' },
  { word: 'Box', detail: 'The edges of a box of Size around Position' },
  { word: 'Circle', detail: 'A circle of Radius around Position, facing Normal' },
  { word: 'Sphere', detail: 'Three circles of Radius around Position' },
  { word: 'Text', detail: 'Text at Position' },
] as const;

/**
 * Space words: Global ignores the Transform blocks around the line, Local
 * follows them.
 */
const SOLID_SCRIPT_DEBUG_SPACES = [
  {
    word: 'Global',
    detail: 'Coordinates from the origin, like everything else; Transform blocks around it are ignored',
  },
  { word: 'Local', detail: 'Follows the Transform blocks around the line, like the solids inside them' },
];

/** Name of a shape, as typed with any case. */
type SolidScriptDebugShape = (typeof SOLID_SCRIPT_DEBUG_SHAPES)[number]['word'];

/** Reads a vector field of the running line. */
type SolidScriptDebugVector = (key: string, fallback: [number, number, number]) => THREE.Vector3;

/**
 * Builds the segments of a shape, in the coordinates the line typed.
 *
 * @param shape Shape.
 * @param run The running line.
 * @param vector Reads a vector field.
 * @returns Segments.
 */
function solidScriptDebugSegments(
  shape: SolidScriptDebugShape,
  run: SolidScriptBlockRun,
  vector: SolidScriptDebugVector,
): SolidScriptDebugSegment[] {
  const at = vector('at', [0, 0, 0]);
  const radius = (): number => run.fields().number('radius', 0.5);
  if (shape === 'Line') return [solidScriptDebugSegment(at, vector('to', [0, 1, 0]))];
  if (shape === 'Arrow') return solidScriptDebugArrow(at, vector('to', [0, 1, 0]));
  if (shape === 'Box') return solidScriptDebugBox(at, vector('size', [1, 1, 1]));
  if (shape === 'Circle') return solidScriptDebugCircle(at, radius(), vector('normal', [0, 1, 0]));
  if (shape === 'Sphere') return solidScriptDebugSphere(at, radius());
  if (shape === 'Text') return [];
  const normal = vector('normal', [0, 1, 0]);
  const length = run.fields().number('distance', 1);
  return solidScriptDebugArrow(at, at.clone().add(normal.clone().normalize().multiplyScalar(length)));
}

/**
 * Reads the Shape field.
 *
 * @param run The running line.
 * @returns Shape.
 */
function solidScriptDebugShapeRead(run: SolidScriptBlockRun): SolidScriptDebugShape {
  const typed = run.text('shape').trim().toLowerCase();
  const found = SOLID_SCRIPT_DEBUG_SHAPES.find((shape) => shape.word.toLowerCase() === typed);
  if (!found) throw run.fields().error('shape', 'must be Line, Arrow, Ray, Box, Circle, Sphere or Text', typed);
  return found.word;
}

/**
 * Tells whether the line draws in Local space, following the Transform blocks
 * around it.
 *
 * @param run The running line.
 * @returns True for Local, false for Global or left off.
 */
function solidScriptDebugLocal(run: SolidScriptBlockRun): boolean {
  const space = run.text('space').trim().toLowerCase();
  if (space !== '' && space !== 'global' && space !== 'local')
    throw run.fields().error('space', 'must be Global or Local', space);
  return space === 'local';
}

/**
 * Draws the shape of a Debug Draw line in the scene.
 *
 * @param run The running line.
 * @returns No shapes.
 */
function solidScriptDebugDrawRun(run: SolidScriptBlockRun): [] {
  const shape = solidScriptDebugShapeRead(run);
  const matrix = solidScriptDebugLocal(run) ? run.matrix() : new THREE.Matrix4();
  const vector: SolidScriptDebugVector = (key, fallback) => new THREE.Vector3(...run.fields().vector(key, fallback));
  const segments = solidScriptDebugSegments(shape, run, vector).map(([ax, ay, az, bx, by, bz]) =>
    solidScriptDebugSegment(
      new THREE.Vector3(ax, ay, az).applyMatrix4(matrix),
      new THREE.Vector3(bx, by, bz).applyMatrix4(matrix),
    ),
  );
  const at = vector('at', [0, 0, 0]).applyMatrix4(matrix).toArray();
  const label = shape === 'Text' ? run.text('text') : '';
  run.widgetAdd({ kind: 'Draw', label, at, color: solidScriptColorRead(run), segments });
  return [];
}

/**
 * Marks a field as shown only for some shapes.
 *
 * @param parameter Field.
 * @param shapes Shapes that use it.
 * @returns Field, marked.
 */
const solidScriptDebugFor = (parameter: SolidScriptCommandParameter, shapes: readonly SolidScriptDebugShape[]) =>
  solidScriptParameterWhen(parameter, 'shape', shapes);

/** The Debug Draw command. */
export const SOLID_SCRIPT_COMMANDS_DEBUG: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'debug_draw',
    label: 'Debug Draw',
    category: 'Widgets',
    description: 'Draw a line, box, circle, ray or text in the scene to see a value',
    manual:
      'Draws a Shape in the scene while the object is selected, to see where a point, a direction or a size ends up; it builds nothing and a bake leaves it out. Line and Arrow go from Position to To, Ray goes from Position along Normal for Distance, Box shows the edges of a box of Size around Position, Circle has a Radius around Position and faces Normal, Sphere shows three circles of Radius, and Text shows Text at Position. Space Global, the default, reads the coordinates from the origin like everything else, so Transform blocks around the line are ignored; Space Local follows them, so inside a Transform Move 0, 2, 0 a Line from 0, 0, 0 starts where the solids inside start. Color picks its colour. Example: Debug Draw Ray Position [Hit] Normal [Face.Normal] Distance 1.',
    stops: [
      'A Shape that is not one of the seven.',
      'A Space that is not Global or Local.',
      'A Color that is not a colour.',
    ],
    parameters: [
      solidScriptParameterWords(
        'shape',
        'Shape',
        'text',
        'Line',
        'What to draw, such as Ray.',
        SOLID_SCRIPT_DEBUG_SHAPES,
      ),
      solidScriptParameter('at', 'Position', 'vector3', '0, 0, 0', 'Where it starts or its center, such as 0, 1, 0.'),
      solidScriptDebugFor(
        solidScriptParameter('to', 'To', 'vector3', '0, 1, 0', 'Where a Line or Arrow ends, such as 0, 2, 0.'),
        ['Line', 'Arrow'],
      ),
      solidScriptDebugFor(
        {
          ...solidScriptParameter(
            'normal',
            'Normal',
            'vector3',
            '0, 1, 0',
            'Direction of a Ray, or the way a Circle faces, such as 0, 1, 0.',
          ),
          direction: true,
        },
        ['Ray', 'Circle'],
      ),
      solidScriptDebugFor(solidScriptParameter('distance', 'Distance', 'number', '1', 'Length of a Ray, such as 2.'), [
        'Ray',
      ]),
      solidScriptDebugFor(
        solidScriptParameter('size', 'Size', 'vector3', '1, 1, 1', 'Size of a Box, such as 2, 1, 1.'),
        ['Box'],
      ),
      solidScriptDebugFor(
        solidScriptParameter('radius', 'Radius', 'number', '0.5', 'Radius of a Circle or Sphere, such as 1.'),
        ['Circle', 'Sphere'],
      ),
      solidScriptDebugFor(
        solidScriptParameter('text', 'Text', 'message', 'Here', 'Text to show, such as Width [Width].'),
        ['Text'],
      ),
      solidScriptParameterColor(
        'Colour of the drawing, a name such as Red or a hex colour such as #ff0000. Left off, the theme colour.',
      ),
      {
        ...solidScriptParameterWords(
          'space',
          'Space',
          'text',
          'Global',
          'Global reads coordinates from the origin; Local follows the Transform blocks around the line, such as Local.',
          SOLID_SCRIPT_DEBUG_SPACES,
        ),
        optional: true,
      },
    ],
    listing: (read) => [
      'Debug Draw',
      read.value('shape'),
      ' At ',
      read.value('at'),
      ...solidScriptListingOptions([
        read.changed('to') && ['To ', read.value('to')],
        read.changed('normal') && ['Normal ', read.value('normal')],
        read.changed('distance') && ['Distance ', read.value('distance')],
        read.changed('size') && ['Size ', read.value('size')],
        read.changed('radius') && ['Radius ', read.value('radius')],
        read.changed('text') && ['Text ', read.value('text')],
        read.text('color') !== '' && ['Color ', read.value('color')],
        read.changed('space') && ['Space ', read.value('space')],
      ]),
    ],
    execute: solidScriptDebugDrawRun,
  }),
];
