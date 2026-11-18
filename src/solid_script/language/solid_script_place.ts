import * as THREE from 'three';
import type { SolidScriptBlockRun } from './solid_script_machine_types.js';
import { solidScriptPlaceMatrix } from './solid_script_transforms.js';
import { solidScriptValueNumber } from './solid_script_value.js';

/**
 * Reads a list of x, y, z points from a field that already turns text into
 * points.
 *
 * @param run Running line.
 * @param key Field key.
 * @param label Field caption, for messages.
 * @returns Points.
 */
export function solidScriptPlacePoints(run: SolidScriptBlockRun, key: string, label: string): THREE.Vector3[] {
  const listed = run.value(key);
  if (!Array.isArray(listed))
    throw new Error(`${label} needs a list of points, such as [0, 0, 0], [1, 0, 0], not a single value`);
  return listed.map((entry) => solidScriptPlacePoint(entry, label));
}

/**
 * Reads one x, y, z point.
 *
 * @param value Value.
 * @param label Field caption, for messages.
 * @returns Point.
 */
function solidScriptPlacePoint(value: unknown, label: string): THREE.Vector3 {
  if (!Array.isArray(value) || value.length < 3 || value.some((entry) => typeof entry !== 'number'))
    throw new Error(`${label} needs points written as vectors, such as [0, 0, 0], [1, 0, 0]`);
  const x = value[0];
  const y = value[1];
  const z = value[2];
  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number')
    throw new Error(`${label} needs points written as vectors, such as [0, 0, 0], [1, 0, 0]`);
  return new THREE.Vector3(x, y, z);
}

/**
 * Matrices that stand a shape at each point of a Place At Points line, in the
 * frame of the blocks around it.
 *
 * @param run Running line.
 * @returns One matrix per point.
 */
export function solidScriptPlaceMatrices(run: SolidScriptBlockRun): THREE.Matrix4[] {
  const points = solidScriptPlacePoints(run, 'at', 'At');
  const directions = solidScriptPlaceDirections(run, points.length);
  const lift = solidScriptValueNumber(run.value('lift'));
  if (lift === undefined) throw new Error('Lift needs a number of metres, such as 0');
  const parent = run.matrix();
  return points.map((point, index) =>
    parent.clone().multiply(solidScriptPlaceMatrix(point, directions[index] ?? null, lift)),
  );
}

/**
 * Reads optional directions, one per point, or none when the field is empty.
 *
 * @param run Running line.
 * @param count How many points At has.
 * @returns A direction for each point, or an empty list.
 */
function solidScriptPlaceDirections(run: SolidScriptBlockRun, count: number): THREE.Vector3[] {
  if (run.text('directions').trim() === '') return [];
  const directions = solidScriptPlacePoints(run, 'directions', 'Directions');
  if (directions.length !== count)
    throw new Error(
      `Directions needs one direction for each point in At, or leave it empty; At has ${count} and Directions has ${directions.length}`,
    );
  return directions;
}
