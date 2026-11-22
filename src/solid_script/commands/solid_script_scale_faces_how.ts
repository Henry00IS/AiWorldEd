import * as THREE from 'three';
import { solidScriptFaceEach, solidScriptFaceEachNumber } from './solid_script_face_each.js';
import type { SolidScriptFaceFacts } from '@/solid_script/language/solid_script_geometry.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import type { SolidScriptScaleFaceHow } from '@/solid_script/language/solid_script_scale_faces.js';
import { solidScriptValueNumbers, type SolidScriptValue } from '@/solid_script/language/solid_script_value.js';

/**
 * Reads how Scale Faces scales each face: its Factor, its Center (the face's
 * own center when empty) and its Axis (every direction when empty).
 *
 * @param run Running Scale Faces line.
 * @param faces Faces the line works on.
 * @returns How a face is scaled.
 */
export function solidScriptScaleFacesHowOf(
  run: SolidScriptBlockRun,
  faces: readonly SolidScriptFaceFacts[],
): (face: SolidScriptFaceFacts) => SolidScriptScaleFaceHow {
  const factorOf = solidScriptFaceEachNumber(run, 'factor', faces, 'Factor needs a number, such as 1 or 0.5', 1);
  const centerOf = solidScriptFaceEach(run, 'center', faces);
  const axisOf = solidScriptFaceEach(run, 'axis', faces);
  return (face) => {
    const axis = solidScriptScaleFacesVector(axisOf(face), 'Axis');
    if (axis && axis.lengthSq() < 1e-18) throw new Error('Axis needs a direction that is not 0, 0, 0');
    return {
      factor: factorOf(face),
      center: solidScriptScaleFacesVector(centerOf(face), 'Center') ?? face.center,
      axis: axis ? axis.normalize() : null,
    };
  };
}

/**
 * Reads an optional x, y, z value; empty gives null.
 *
 * @param value Field value.
 * @param label Field caption, for messages.
 * @returns Vector, or null.
 */
function solidScriptScaleFacesVector(value: SolidScriptValue, label: string): THREE.Vector3 | null {
  if (value === undefined || (typeof value === 'string' && value.trim() === '')) return null;
  const numbers = solidScriptValueNumbers(value);
  if (numbers?.length !== 3) throw new Error(`${label} needs three numbers, such as 0, 1, 0`);
  return new THREE.Vector3(numbers[0], numbers[1], numbers[2]);
}
