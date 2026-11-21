import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import type { SolidScriptFaceFacts } from '@/solid_script/language/solid_script_geometry.js';
import { solidScriptEachRead } from '@/solid_script/language/solid_script_each_read.js';
import { solidScriptValueNumber, type SolidScriptValue } from '@/solid_script/language/solid_script_value.js';

/**
 * Reads a field that may change per face, with [$Face] the face, [$Index] its
 * place in the list from 0 and [$Count] how many faces there are.
 *
 * @param run Running line.
 * @param key Field key.
 * @param faces Faces the line works on, in list order.
 * @returns The value for a face; undefined when the field is empty.
 */
export function solidScriptFaceEach(
  run: SolidScriptBlockRun,
  key: string,
  faces: readonly SolidScriptFaceFacts[],
): (face: SolidScriptFaceFacts) => SolidScriptValue {
  const order = new Map(faces.map((face, index) => [face, index]));
  const read = solidScriptEachRead(run, key, faces.length, (index) => ({
    $Face: run.elements.face(faces[index]!),
    $Index: index,
    $Count: faces.length,
  }));
  return (face) => read(order.get(face) ?? -1);
}

/**
 * Reads a number field that may change per face; an empty field, or one that
 * reads blank text, gives the fallback.
 *
 * @param run Running line.
 * @param key Field key.
 * @param faces Faces the line works on, in list order.
 * @param needs Message when a face's value is not a number, such as "Distance
 *   needs a number of metres, such as 0.2".
 * @param fallback Value of an empty field.
 * @returns The number for a face.
 */
export function solidScriptFaceEachNumber(
  run: SolidScriptBlockRun,
  key: string,
  faces: readonly SolidScriptFaceFacts[],
  needs: string,
  fallback?: number,
): (face: SolidScriptFaceFacts) => number {
  const read = solidScriptFaceEach(run, key, faces);
  return (face) => {
    const value = read(face);
    const blank = value === undefined || (typeof value === 'string' && value.trim() === '');
    const number = blank ? fallback : solidScriptValueNumber(value);
    if (number === undefined) throw new Error(needs);
    return number;
  };
}
