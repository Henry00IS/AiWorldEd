import * as THREE from 'three';
import type { SolidScriptCommandParameter } from './solid_script_command.js';
import {
  solidScriptParameter,
  solidScriptParameterDefines,
  solidScriptParameterOptional,
} from './solid_script_command_parameters.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import { solidScriptNameWords } from '@/solid_script/language/solid_script_name_words.js';

/**
 * Describes the Writes field of a widget: the Input it changes, offered from
 * the script's Inputs.
 *
 * @param hint Hover text.
 * @returns Field.
 */
export function solidScriptWidgetWritesParameter(hint: string): SolidScriptCommandParameter {
  return solidScriptParameterDefines(solidScriptParameterOptional('writes', 'Writes', 'name', hint), ['Inputs']);
}

/**
 * Describes the At field of a widget: where it sits, placed by the Transform
 * around the line.
 *
 * @param hint Hover text.
 * @returns Field.
 */
export function solidScriptWidgetAtParameter(hint: string): SolidScriptCommandParameter {
  return solidScriptParameter('at', 'At', 'vector3', '0, 0, 0', hint);
}

/**
 * Describes the Label field of a widget.
 *
 * @param hint Hover text.
 * @returns Field.
 */
export function solidScriptWidgetLabelParameter(hint: string): SolidScriptCommandParameter {
  return solidScriptParameterOptional('label', 'Label', 'text', hint);
}

/**
 * Reads the Label of a widget line, or else the name in Writes in words.
 *
 * @param run The running line.
 * @param fallback Label when both are left off.
 * @returns Label.
 */
export function solidScriptWidgetLabel(run: SolidScriptBlockRun, fallback: string): string {
  return run.text('label').trim() || solidScriptNameWords(run.text('writes').trim()) || fallback;
}

/**
 * Reads a point field of a widget line and places it by the Transform around
 * the line.
 *
 * @param run The running line.
 * @param key Field key.
 * @param fallback Point when the field is left off.
 * @returns Point in script coordinates.
 */
export function solidScriptWidgetPoint(
  run: SolidScriptBlockRun,
  key: string,
  fallback: [number, number, number],
): THREE.Vector3 {
  return new THREE.Vector3(...run.fields().vector(key, fallback)).applyMatrix4(run.matrix());
}

/**
 * Describes the optional Minimum and Maximum fields of a widget.
 *
 * @param least Example of a Minimum.
 * @param most Example of a Maximum.
 * @returns Fields.
 */
export function solidScriptWidgetLimitParameters(least: string, most: string): SolidScriptCommandParameter[] {
  return [
    solidScriptParameterOptional(
      'min',
      'Minimum',
      'number',
      `Smallest value a drag writes, such as ${least}. Left off, no limit.`,
    ),
    solidScriptParameterOptional(
      'max',
      'Maximum',
      'number',
      `Largest value a drag writes, such as ${most}. Left off, no limit.`,
    ),
  ];
}

/**
 * Reads an optional number field, or null when it is left off.
 *
 * @param run The running line.
 * @param key Field key.
 * @returns Number or null.
 */
export function solidScriptWidgetLimit(run: SolidScriptBlockRun, key: string): number | null {
  return run.source(key).trim() === '' ? null : run.fields().number(key, 0);
}
