import * as THREE from 'three';
import type { SolidScriptBlockRun } from './solid_script_machine_types.js';
import { solidScriptPathDistinct } from './solid_script_path.js';
import { SolidScriptPoint, solidScriptValueNumber } from './solid_script_value.js';

/**
 * Sizes each ring of a sweep by the Scale of its path point, about that point,
 * so a sweep can taper. Scale is worked out once per point, with [$Point],
 * [$Index] and [$Count]; 1 keeps the profile as it is.
 *
 * @param run Running Sweep Along Path line.
 * @param rings One ring per path point, plus the first again when closed.
 * @param path Path points as given.
 * @param closed True when the path loops.
 * @returns Rings, sized.
 */
export function solidScriptSweepScaled(
  run: SolidScriptBlockRun,
  rings: readonly THREE.Vector3[][],
  path: readonly THREE.Vector3[],
  closed: boolean,
): THREE.Vector3[][] {
  const points = solidScriptPathDistinct(path, closed);
  const scales = points.map((point, index) => solidScriptSweepScale(run, point, index, points.length));
  return rings.map((ring, index) => {
    const at = index % points.length;
    const center = points[at] ?? new THREE.Vector3();
    const scale = scales[at] ?? 1;
    return ring.map((corner) => corner.clone().sub(center).multiplyScalar(scale).add(center));
  });
}

/**
 * Reads the Scale of one path point: a number of 0 or more.
 *
 * @param run Running line.
 * @param point Path point.
 * @param index Its number from 0.
 * @param count Number of path points.
 * @returns Scale.
 */
function solidScriptSweepScale(run: SolidScriptBlockRun, point: THREE.Vector3, index: number, count: number): number {
  const fills = { $Point: new SolidScriptPoint([point.x, point.y, point.z], [0, 1, 0]), $Index: index, $Count: count };
  const scale = solidScriptValueNumber(run.valueWith('scale', fills));
  if (scale === undefined || scale < 0)
    throw new Error('Scale needs a number of 0 or more, such as 1 or [=1 - [$Index] / [$Count]]');
  return scale;
}
