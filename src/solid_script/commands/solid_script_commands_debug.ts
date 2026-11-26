import * as THREE from 'three';
import { SolidScriptCommand, type SolidScriptCommandParameter } from './solid_script_command.js';
import { solidScriptListingOptions } from './solid_script_command_listing.js';
import { solidScriptParameter, solidScriptParameterWords } from './solid_script_command_parameters.js';
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

/** Shapes the Debug blocks draw, with the fields each reads and what it shows. */
const SOLID_SCRIPT_DEBUG_SHAPES = [
  {
    word: 'Line',
    fields: ['to'],
    detail: 'a line from Position to To',
    example: "Debug Line At '0, 0, 0' To '0, 2, 0'",
  },
  { word: 'Arrow', fields: ['to'], detail: 'an arrow from Position to To', example: 'Debug Arrow At [Start] To [End]' },
  {
    word: 'Ray',
    fields: ['normal', 'distance'],
    detail: 'an arrow from Position along Normal, Distance long',
    example: 'Debug Ray At [Hit] Normal [Face.Normal] Distance 1',
  },
  {
    word: 'Box',
    fields: ['size'],
    detail: 'the edges of a box of Size around Position',
    example: "Debug Box At [Center] Size '2, 1, 1'",
  },
  {
    word: 'Circle',
    fields: ['normal', 'radius'],
    detail: 'a circle of Radius around Position, facing Normal',
    example: 'Debug Circle At [Center] Radius 1',
  },
  {
    word: 'Sphere',
    fields: ['radius'],
    detail: 'three circles of Radius around Position',
    example: 'Debug Sphere At [Center] Radius 1',
  },
  { word: 'Text', fields: ['text'], detail: 'Text at Position', example: 'Debug Text At [Top] Text Width [Width]' },
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
 * Draws the shape of a Debug line in the scene.
 *
 * @param run The running line.
 * @param shape Shape the block draws.
 * @returns No shapes.
 */
function solidScriptDebugDrawRun(run: SolidScriptBlockRun, shape: SolidScriptDebugShape): [] {
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

/** The fields only some shapes read, by key. */
const SOLID_SCRIPT_DEBUG_FIELDS: Readonly<Record<string, SolidScriptCommandParameter>> = {
  to: solidScriptParameter('to', 'To', 'vector3', '0, 1, 0', 'Where it ends, such as 0, 2, 0.'),
  normal: {
    ...solidScriptParameter('normal', 'Normal', 'vector3', '0, 1, 0', 'The direction, such as 0, 1, 0.'),
    direction: true,
  },
  distance: solidScriptParameter('distance', 'Distance', 'number', '1', 'Length of the ray, such as 2.'),
  size: solidScriptParameter('size', 'Size', 'vector3', '1, 1, 1', 'Size of the box, such as 2, 1, 1.'),
  radius: solidScriptParameter('radius', 'Radius', 'number', '0.5', 'Radius, such as 1.'),
  text: solidScriptParameter('text', 'Text', 'message', 'Here', 'Text to show, such as Width [Width].'),
};

/** Fields every Debug block ends with: Color and Space. */
const SOLID_SCRIPT_DEBUG_TAIL: readonly SolidScriptCommandParameter[] = [
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
];

/** Text every Debug manual shares about what it is for, Space and Color. */
const SOLID_SCRIPT_DEBUG_MANUAL =
  'It shows while the object is selected, to see where a point, a direction or a size ends up; it builds nothing and a bake leaves it out. Space Global, the default, reads the coordinates from the origin like everything else, so Transform blocks around the line are ignored; Space Local follows them, so inside a Transform Move 0, 2, 0 a Debug Line from 0, 0, 0 starts where the solids inside start. Color picks its colour.';

/**
 * Builds the Debug block of one shape: Position, its own fields, Color and
 * Space.
 *
 * @param shape Shape, with its fields and text.
 * @returns Command.
 */
function solidScriptDebugCommand(shape: (typeof SOLID_SCRIPT_DEBUG_SHAPES)[number]): SolidScriptCommand {
  const label = `Debug ${shape.word}`;
  const own = shape.fields.map((key) => SOLID_SCRIPT_DEBUG_FIELDS[key] as SolidScriptCommandParameter);
  return new SolidScriptCommand({
    id: `debug_${shape.word.toLowerCase()}`,
    label,
    category: 'Widgets',
    description: `Draw ${shape.detail} in the scene to see a value`,
    synonyms: ['debug draw', 'gizmo', 'visualize'],
    manual: `Draws ${shape.detail} in the scene. ${SOLID_SCRIPT_DEBUG_MANUAL} Example: ${shape.example}.`,
    stops: ['A Space that is not Global or Local.', 'A Color that is not a colour.'],
    parameters: [
      solidScriptParameter('at', 'Position', 'vector3', '0, 0, 0', 'Where it starts or its center, such as 0, 1, 0.'),
      ...own,
      ...SOLID_SCRIPT_DEBUG_TAIL,
    ],
    listing: (read) => [
      label,
      ' At ',
      read.value('at'),
      ...solidScriptListingOptions([
        ...own.map((field) => read.changed(field.key) && [`${field.label} `, read.value(field.key)]),
        read.text('color') !== '' && ['Color ', read.value('color')],
        read.changed('space') && ['Space ', read.value('space')],
      ]),
    ],
    execute: (run) => solidScriptDebugDrawRun(run, shape.word),
  });
}

/** The Debug blocks, one per shape. */
export const SOLID_SCRIPT_COMMANDS_DEBUG: readonly SolidScriptCommand[] =
  SOLID_SCRIPT_DEBUG_SHAPES.map(solidScriptDebugCommand);
