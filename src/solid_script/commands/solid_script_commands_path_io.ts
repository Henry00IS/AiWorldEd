import * as THREE from 'three';
import { solidScriptParameter, solidScriptParameterInto } from './solid_script_command_parameters.js';
import { solidScriptFaceWriteValue } from './solid_script_face_of.js';
import { solidScriptPathStraight, type SolidScriptPath } from '@/solid_script/language/solid_script_path_model.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import { SolidScriptPathElement, type SolidScriptValue } from '@/solid_script/language/solid_script_value.js';
import { solidScriptVectorRead } from '@/solid_script/language/solid_script_vector.js';

/**
 * Reads a Path field: a Path, or a list of points for an open straight one.
 *
 * @param run Running line.
 * @param label Command, for messages.
 * @param key Key of the field.
 * @param field Caption of the field, for messages.
 * @returns Path.
 */
export function solidScriptPathSource(
  run: SolidScriptBlockRun,
  label: string,
  key = 'path',
  field = 'Path',
): SolidScriptPath<number[]> {
  const raw = run.values(key);
  if (raw.length === 1 && raw[0] instanceof SolidScriptPathElement) return raw[0].path;
  const given = run.value(key);
  const points = Array.isArray(given) ? given.map((point) => solidScriptVectorRead(point)) : [];
  if (points.length < 2 || points.some((point) => point === undefined))
    throw new Error(`${label} needs a Path or a list of points in ${field}, such as [Rail]`);
  return solidScriptPathStraight(points as number[][], false);
}

/**
 * Lists the Paths a value holds: one Path, or a list of Paths.
 *
 * @param item Value.
 * @returns Paths, or undefined when it is not made of Paths.
 */
function solidScriptPathsOf(item: SolidScriptValue): SolidScriptPath<number[]>[] | undefined {
  if (item instanceof SolidScriptPathElement) return [item.path];
  if (!Array.isArray(item) || item.length === 0) return undefined;
  return item.every((entry) => entry instanceof SolidScriptPathElement)
    ? item.map((entry) => (entry as SolidScriptPathElement).path)
    : undefined;
}

/**
 * Reads a field of several Paths: Paths separated by commas, such as [Rail],
 * [Spur], a list of Paths, or the points of one straight open Path.
 *
 * @param run Running line.
 * @param label Command, for messages.
 * @param key Key of the field.
 * @param field Caption of the field, for messages.
 * @returns Paths, in the order given.
 */
export function solidScriptPathsSource(
  run: SolidScriptBlockRun,
  label: string,
  key: string,
  field: string,
): SolidScriptPath<number[]>[] {
  const given = run.values(key).map(solidScriptPathsOf);
  if (given.length > 0 && given.every((paths) => paths !== undefined))
    return given.flat() as SolidScriptPath<number[]>[];
  return [solidScriptPathSource(run, label, key, field)];
}

/**
 * Writes a changed path to Into as a new Path.
 *
 * @param run Running line.
 * @param path Path.
 */
export function solidScriptPathWrite(run: SolidScriptBlockRun, path: SolidScriptPath<number[]>): void {
  const vectors = path.points.map(([x = 0, y = 0, z = 0]) => new THREE.Vector3(x, y, z));
  const [made] = run.pathsMake([{ points: vectors, closed: path.closed }]);
  if (!made) return;
  made.path = path;
  solidScriptFaceWriteValue(run, 'into', made);
}

/**
 * The Into field of the blocks that write a Path.
 *
 * @returns Field.
 */
export function solidScriptPathIntoField() {
  return {
    ...solidScriptParameterInto('the changed path, a Path', 'Path', 'what is made', 'label'),
    hint: 'Variable to write the changed path to, such as Rail to replace it.',
    optional: false,
    default: 'Path',
  };
}

/**
 * A field that takes a Path, or a list of points.
 *
 * @param key Key of the stored value.
 * @param label Visible caption.
 * @param fallback Value of a new command line.
 * @param hint Hover text.
 * @returns Field.
 */
export function solidScriptPathField(key: string, label: string, fallback: string, hint: string) {
  return solidScriptParameter(key, label, 'points3', fallback, hint);
}
