import * as THREE from 'three';
import { SolidScriptCommand, type SolidScriptCommandParameter } from './solid_script_command.js';
import {
  solidScriptListingOptions,
  type SolidScriptListingPiece,
  type SolidScriptListingValues,
} from './solid_script_command_listing.js';
import { solidScriptParameter } from './solid_script_command_parameters.js';
import { solidScriptColorRead, solidScriptParameterColor } from './solid_script_color_field.js';
import {
  solidScriptWidgetAtParameter,
  solidScriptWidgetLabel,
  solidScriptWidgetLabelParameter,
  solidScriptWidgetLimit,
  solidScriptWidgetLimitParameters,
  solidScriptWidgetPoint,
  solidScriptWidgetWritesParameter,
} from './solid_script_widget_fields.js';
import { SOLID_SCRIPT_WIDGET_COMMAND_PREFIX } from '@/solid_script/language/solid_script_widget.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';

/** Letters of the axes, for handle labels. */
const SOLID_SCRIPT_WIDGET_AXES = ['X', 'Y', 'Z'] as const;

/** Distance from a Widget Point's point to each of its arrow handles. */
const SOLID_SCRIPT_WIDGET_POINT_GAP = 0.4;

/** What one axis handle of a Point or Size needs. */
interface SolidScriptWidgetAxisHandle {
  /** Axis, 0 for x. */
  index: number;
  /** Point of the handle for a value of 0, in the line's coordinates. */
  origin: THREE.Vector3;
  /** Move of the handle for a value of 1, in the line's coordinates. */
  direction: THREE.Vector3;
  /** Smallest value a drag writes, or null for no limit. */
  min: number | null;
  /** Whether a ruler runs from the origin to the handle. */
  ruler: boolean;
}

/**
 * Adds one handle that changes one of x, y and z of the Vector Input in Writes,
 * placed by the Transform around the line.
 *
 * @param run The running line.
 * @param shown Vector shown.
 * @param handle Axis handle.
 */
function solidScriptWidgetAxisAdd(
  run: SolidScriptBlockRun,
  shown: readonly [number, number, number],
  handle: SolidScriptWidgetAxisHandle,
): void {
  const origin = handle.origin.clone().applyMatrix4(run.matrix());
  const direction = handle.direction.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(run.matrix()));
  run.widgetAdd({
    kind: 'Slider',
    label: `${solidScriptWidgetLabel(run, 'Value')} ${SOLID_SCRIPT_WIDGET_AXES[handle.index]}`,
    value: shown[handle.index]!,
    writes: run.text('writes').trim(),
    origin: origin.toArray(),
    direction: direction.toArray(),
    min: handle.min,
    max: null,
    color: solidScriptColorRead(run),
    component: { index: handle.index, vector: shown },
    ruler: handle.ruler,
    axis: null,
  });
}

/**
 * Reads the Shows vector of a line.
 *
 * @param run The running line.
 * @returns Vector.
 */
function solidScriptWidgetShown(run: SolidScriptBlockRun): [number, number, number] {
  const [x = 0, y = 0, z = 0] = run.fields().vector('shows', [0, 0, 0]);
  return [x, y, z];
}

/**
 * Adds the six face handles of a Widget Size line.
 *
 * @param run The running line.
 * @returns No shapes.
 */
function solidScriptWidgetSizeRun(run: SolidScriptBlockRun): [] {
  const shown = solidScriptWidgetShown(run);
  const center = new THREE.Vector3(...run.fields().vector('at', [0, 0, 0]));
  for (const index of [0, 1, 2])
    for (const side of [1, -1]) {
      const direction = new THREE.Vector3().setComponent(index, side * 0.5);
      solidScriptWidgetAxisAdd(run, shown, { index, origin: center, direction, min: 0, ruler: true });
    }
  return [];
}

/**
 * Adds the three arrow handles of a Widget Point line, each a little beside the
 * point along its axis.
 *
 * @param run The running line.
 * @returns No shapes.
 */
function solidScriptWidgetPointRun(run: SolidScriptBlockRun): [] {
  const shown = solidScriptWidgetShown(run);
  for (const index of [0, 1, 2]) {
    const origin = new THREE.Vector3(...shown).setComponent(index, SOLID_SCRIPT_WIDGET_POINT_GAP);
    const direction = new THREE.Vector3().setComponent(index, 1);
    solidScriptWidgetAxisAdd(run, shown, { index, origin, direction, min: null, ruler: false });
  }
  return [];
}

/**
 * Reads the Axis of a Widget Angle line as a unit vector.
 *
 * @param run The running line.
 * @returns Unit axis in the line's coordinates.
 */
function solidScriptWidgetAngleAxis(run: SolidScriptBlockRun): THREE.Vector3 {
  const fields = run.fields();
  const axis = new THREE.Vector3(...fields.vector('axis', [0, 1, 0]));
  if (axis.lengthSq() < 1e-12) throw fields.error('axis', 'a direction that is not 0, 0, 0', axis.length());
  return axis.normalize();
}

/**
 * Returns the unit arm of a dial at 0 degrees: x made square to the axis, or z
 * for an axis close to x.
 *
 * @param axis Unit axis.
 * @returns Unit arm.
 */
function solidScriptWidgetAngleArm(axis: THREE.Vector3): THREE.Vector3 {
  const start = Math.abs(axis.x) > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  return start.addScaledVector(axis, -axis.dot(start)).normalize();
}

/**
 * Adds the dial of a Widget Angle line, placed by the Transform around it.
 *
 * @param run The running line.
 * @returns No shapes.
 */
function solidScriptWidgetAngleRun(run: SolidScriptBlockRun): [] {
  const axis = solidScriptWidgetAngleAxis(run);
  const linear = new THREE.Matrix3().setFromMatrix4(run.matrix());
  const arm = solidScriptWidgetAngleArm(axis).multiplyScalar(run.fields().number('radius', 1));
  run.widgetAdd({
    kind: 'Slider',
    label: solidScriptWidgetLabel(run, 'Angle'),
    value: run.fields().number('shows', 0),
    writes: run.text('writes').trim(),
    origin: solidScriptWidgetPoint(run, 'at', [0, 0, 0]).toArray(),
    direction: arm.applyMatrix3(linear).toArray(),
    min: solidScriptWidgetLimit(run, 'min'),
    max: solidScriptWidgetLimit(run, 'max'),
    color: solidScriptColorRead(run),
    component: null,
    ruler: true,
    axis: axis.applyMatrix3(linear).normalize().toArray(),
  });
  return [];
}

/**
 * Adds the arrow of a Widget Direction line, placed by the Transform around it.
 *
 * @param run The running line.
 * @returns No shapes.
 */
function solidScriptWidgetDirectionRun(run: SolidScriptBlockRun): [] {
  const fields = run.fields();
  const value = new THREE.Vector3(...fields.vector('shows', [0, 1, 0]));
  if (value.lengthSq() < 1e-12) throw fields.error('shows', 'a direction that is not 0, 0, 0', value.length());
  run.widgetAdd({
    kind: 'Aim',
    label: solidScriptWidgetLabel(run, 'Direction'),
    writes: run.text('writes').trim(),
    origin: solidScriptWidgetPoint(run, 'at', [0, 0, 0]).toArray(),
    value: value.normalize().toArray(),
    length: fields.number('length', 1),
    frame: new THREE.Matrix3().setFromMatrix4(run.matrix()).toArray(),
    color: solidScriptColorRead(run),
  });
  return [];
}

/**
 * Returns the Shows and Writes fields of a widget that changes a Vector Input.
 *
 * @param shows Hover text of Shows.
 * @param writes Hover text of Writes.
 * @returns Fields.
 */
function solidScriptWidgetVectorFields(shows: string, writes: string): SolidScriptCommandParameter[] {
  return [
    solidScriptParameter('shows', 'Shows', 'vector3', '1, 1, 1', shows),
    solidScriptWidgetWritesParameter(writes),
  ];
}

/**
 * Lists a handle line: its Shows, Writes and the options it changed.
 *
 * @param name Block name.
 * @param read Reads the line's fields.
 * @returns Listing parts.
 */
function solidScriptWidgetVectorListing(name: string, read: SolidScriptListingValues): SolidScriptListingPiece[] {
  return [
    name,
    read.value('shows'),
    ' Writes ',
    read.value('writes'),
    ...solidScriptListingOptions([
      read.changed('at') && ['At ', read.value('at')],
      read.text('label') !== '' && ['Label ', read.value('label')],
      read.text('color') !== '' && ['Color ', read.value('color')],
    ]),
  ];
}

/** Fields every handle widget ends with. */
const SOLID_SCRIPT_WIDGET_HANDLE_TAIL: SolidScriptCommandParameter[] = [
  solidScriptWidgetLabelParameter(
    'Name beside the handles, such as Size. Left off, the name in Writes is shown in words, so BoxSize shows Box Size.',
  ),
  solidScriptParameterColor('Colour of the handles, a name such as Green or a hex colour such as #4cbf5a.'),
];

/** Widget Size, Widget Point, Widget Angle and Widget Direction. */
export const SOLID_SCRIPT_COMMANDS_WIDGET_HANDLES: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: `${SOLID_SCRIPT_WIDGET_COMMAND_PREFIX}size`,
    label: 'Widget Size',
    category: 'Widgets',
    description: 'Drag the faces of a box in the scene to change a size',
    manual:
      'Puts a handle on each face of a box of the size Shows around At while editing the generator. Dragging a face changes the matching x, y or z of the Vector Input named by Writes, snapped to the grid and never below 0; the box stays centred on At, the script runs, and the handles follow Shows. One drag is one undo step. Example: Input BoxSize, Type Vector, Default 2, 1, 4, then Widget Size Shows [BoxSize] Writes BoxSize, then Cube of size [BoxSize].',
    stops: ['A Writes that names no Input above the line.', 'A Color that is not a colour.'],
    parameters: [
      ...solidScriptWidgetVectorFields(
        'Size the box shows, such as [BoxSize].',
        'Name of the Vector Input a drag writes into, such as BoxSize.',
      ),
      solidScriptWidgetAtParameter('Center of the box, such as 0, 0, 0.'),
      ...SOLID_SCRIPT_WIDGET_HANDLE_TAIL,
    ],
    listing: (read) => solidScriptWidgetVectorListing('Widget Size', read),
    execute: solidScriptWidgetSizeRun,
  }),
  new SolidScriptCommand({
    id: `${SOLID_SCRIPT_WIDGET_COMMAND_PREFIX}point`,
    label: 'Widget Point',
    category: 'Widgets',
    description: 'Drag a point in the scene to change a position',
    manual:
      'Puts three arrow handles beside the point Shows while editing the generator, one along each of x, y and z, placed by the Transform around the line. Dragging one moves the point along that axis and writes it into the Vector Input named by Writes, snapped to the grid; the script runs and the handles follow Shows. One drag is one undo step. Example: Input Spot, Type Vector, Default 0, 2, 0, then Widget Point Shows [Spot] Writes Spot, then Transform Move [Spot] holding a Sphere.',
    stops: ['A Writes that names no Input above the line.', 'A Color that is not a colour.'],
    parameters: [
      ...solidScriptWidgetVectorFields(
        'Point the handles sit at, such as [Spot].',
        'Name of the Vector Input a drag writes into, such as Spot.',
      ),
      ...SOLID_SCRIPT_WIDGET_HANDLE_TAIL,
    ],
    listing: (read) => solidScriptWidgetVectorListing('Widget Point', read),
    execute: solidScriptWidgetPointRun,
  }),
  new SolidScriptCommand({
    id: `${SOLID_SCRIPT_WIDGET_COMMAND_PREFIX}angle`,
    label: 'Widget Angle',
    category: 'Widgets',
    description: 'Turn a dial in the scene to change an angle',
    manual:
      'Puts a dial handle on a circle of Radius around At while editing the generator, turned about Axis by Shows degrees from a start square to Axis (x, or z when Axis is close to x). Dragging the handle round the circle writes the angle under the mouse, in whole degrees and kept between Minimum and Maximum, into the Number Input named by Writes; the script runs and the handle follows Shows. Turning past a full circle keeps counting, so 370 stays 370. One drag is one undo step. Example: Input Turn, Number, Default 0, then Widget Angle Shows [Turn] Writes Turn Radius 2, then Transform Rotate 0, [Turn], 0 holding a Cube.',
    stops: ['A Writes that names no Input above the line.', 'An Axis of 0, 0, 0.', 'A Color that is not a colour.'],
    parameters: [
      solidScriptParameter('shows', 'Shows', 'number', '0', 'Angle in degrees the dial shows, such as [Turn].'),
      solidScriptWidgetWritesParameter('Name of the Number Input a drag writes into, such as Turn.'),
      solidScriptWidgetAtParameter('Center of the dial, such as 0, 0, 0.'),
      {
        ...solidScriptParameter('axis', 'Axis', 'vector3', '0, 1, 0', 'Axis the dial turns about, such as 0, 1, 0.'),
        direction: true,
      },
      solidScriptParameter('radius', 'Radius', 'number', '1', 'Distance from At to the handle, such as 2.'),
      ...solidScriptWidgetLimitParameters('0', '360'),
      ...SOLID_SCRIPT_WIDGET_HANDLE_TAIL,
    ],
    listing: (read) => [
      'Widget Angle',
      read.value('shows'),
      ' Writes ',
      read.value('writes'),
      ...solidScriptListingOptions([
        read.changed('at') && ['At ', read.value('at')],
        read.changed('axis') && ['Axis ', read.value('axis')],
        read.changed('radius') && ['Radius ', read.value('radius')],
        read.text('min') !== '' && ['Min ', read.value('min')],
        read.text('max') !== '' && ['Max ', read.value('max')],
        read.text('label') !== '' && ['Label ', read.value('label')],
        read.text('color') !== '' && ['Color ', read.value('color')],
      ]),
    ],
    execute: solidScriptWidgetAngleRun,
  }),
  new SolidScriptCommand({
    id: `${SOLID_SCRIPT_WIDGET_COMMAND_PREFIX}direction`,
    label: 'Widget Direction',
    category: 'Widgets',
    description: 'Drag the tip of an arrow in the scene to change a direction',
    manual:
      'Puts an arrow of Length from At along Shows while editing the generator, placed by the Transform around the line. Dragging its tip points it at the mouse, on the plane through the tip that faces the view, and writes the direction, made 1 long and rounded to three decimals, into the Vector Input named by Writes; the script runs and the arrow follows Shows. One drag is one undo step. Example: Input Facing, Type Vector, Default 0, 0, 1, then Widget Direction Shows [Facing] Writes Facing Length 2, then Debug Draw Shape Ray Normal [Facing].',
    stops: ['A Writes that names no Input above the line.', 'A Shows of 0, 0, 0.', 'A Color that is not a colour.'],
    parameters: [
      {
        ...solidScriptParameter(
          'shows',
          'Shows',
          'vector3',
          '0, 1, 0',
          'Direction the arrow points in, such as [Facing].',
        ),
        direction: true,
      },
      solidScriptWidgetWritesParameter('Name of the Vector Input a drag writes into, such as Facing.'),
      solidScriptWidgetAtParameter('Point the arrow starts at, such as 0, 0, 0.'),
      solidScriptParameter('length', 'Length', 'number', '1', 'Length of the arrow, such as 2.'),
      ...SOLID_SCRIPT_WIDGET_HANDLE_TAIL,
    ],
    listing: (read) => [
      'Widget Direction',
      read.value('shows'),
      ' Writes ',
      read.value('writes'),
      ...solidScriptListingOptions([
        read.changed('at') && ['At ', read.value('at')],
        read.changed('length') && ['Length ', read.value('length')],
        read.text('label') !== '' && ['Label ', read.value('label')],
        read.text('color') !== '' && ['Color ', read.value('color')],
      ]),
    ],
    execute: solidScriptWidgetDirectionRun,
  }),
];
