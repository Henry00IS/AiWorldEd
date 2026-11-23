import * as THREE from 'three';
import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptListingOptions } from './solid_script_command_listing.js';
import { solidScriptParameter, solidScriptParameterOptional } from './solid_script_command_parameters.js';
import { SOLID_SCRIPT_WIDGET_COMMAND_PREFIX } from '@/solid_script/language/solid_script_widget.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';

/** Id of the Widget Slider command. */
export const SOLID_SCRIPT_COMMAND_WIDGET_SLIDER = `${SOLID_SCRIPT_WIDGET_COMMAND_PREFIX}slider`;

/**
 * Reads an optional number field, or null when it is left off.
 *
 * @param run The running line.
 * @param key Field key.
 * @returns Number or null.
 */
function solidScriptWidgetLimit(run: SolidScriptBlockRun, key: string): number | null {
  return run.source(key).trim() === '' ? null : run.fields().number(key, 0);
}

/**
 * Adds the slider of a Widget Slider line, placed by the Transform around it.
 *
 * @param run The running line.
 * @returns No shapes.
 */
function solidScriptWidgetSliderRun(run: SolidScriptBlockRun): [] {
  const fields = run.fields();
  const along = new THREE.Vector3(...fields.vector('along', [0, 1, 0]));
  if (along.lengthSq() < 1e-12) throw fields.error('along', 'a direction that is not 0, 0, 0', along.length());
  const at = new THREE.Vector3(...fields.vector('at', [0, 0, 0]));
  const matrix = run.matrix();
  const origin = at.clone().applyMatrix4(matrix);
  const direction = at.clone().add(along.normalize()).applyMatrix4(matrix).sub(origin);
  const writes = run.text('writes').trim();
  run.widgetAdd({
    kind: 'Slider',
    label: run.text('caption').trim() || writes || 'Value',
    value: fields.number('shows', 0),
    writes,
    origin: origin.toArray(),
    direction: direction.toArray(),
    min: solidScriptWidgetLimit(run, 'min'),
    max: solidScriptWidgetLimit(run, 'max'),
  });
  return [];
}

/** Commands that put handles in the scene for the Generator tool. */
export const SOLID_SCRIPT_COMMANDS_WIDGETS: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: SOLID_SCRIPT_COMMAND_WIDGET_SLIDER,
    label: 'Widget Slider',
    category: 'Widgets',
    description: 'Drag a handle in the scene to change an input',
    manual:
      'Puts a handle in the scene that you drag while editing the generator (select it with Bounds, then click Edit). The handle sits at At, moved along Along by the value of Shows, and it slides only along that line. Dragging it writes the value under the mouse into the Input named by Writes, snapped to the grid and kept between Minimum and Maximum; then the script runs and the handle moves to whatever Shows gives. Without Writes the handle only shows the value. So the script decides: if it clamps or resets the value, the handle stops there, and when you let go the input keeps the value the handle shows. One drag is one undo step. Shows is usually the input itself or a value worked out from it. Example: Input Height, Number, Default 2, then Set Tall [=Min([Height], 5)], then Widget Slider Shows [Tall] Writes Height Along 0, 1, 0, then Cube of size 1, [Tall], 1: the handle stops at 5.',
    stops: ['A Writes that names no Input above the line.', 'An Along of 0, 0, 0.'],
    parameters: [
      solidScriptParameter('shows', 'Shows', 'number', '0', 'Value the handle shows, such as [Height].'),
      solidScriptParameterOptional(
        'writes',
        'Writes',
        'name',
        'Name of the Input a drag writes into, such as Height. Left off, the handle only shows the value.',
      ),
      solidScriptParameter(
        'at',
        'At',
        'vector3',
        '0, 0, 0',
        'Point the handle sits at for a value of 0, such as 0, 0, 0.',
      ),
      solidScriptParameter('along', 'Along', 'vector3', '0, 1, 0', 'Direction the handle slides in, such as 0, 1, 0.'),
      solidScriptParameterOptional(
        'min',
        'Minimum',
        'number',
        'Smallest value a drag writes, such as 0. Left off, no limit.',
      ),
      solidScriptParameterOptional(
        'max',
        'Maximum',
        'number',
        'Largest value a drag writes, such as 10. Left off, no limit.',
      ),
      solidScriptParameterOptional(
        'caption',
        'Caption',
        'text',
        'Caption beside the handle, such as Height. Left off, Writes is shown.',
      ),
    ],
    listing: (read) => [
      'Widget Slider',
      read.value('shows'),
      ' Writes ',
      read.value('writes'),
      ...solidScriptListingOptions([
        read.text('min') !== '' && ['Min ', read.value('min')],
        read.text('max') !== '' && ['Max ', read.value('max')],
      ]),
    ],
    execute: solidScriptWidgetSliderRun,
  }),
];
