import * as THREE from 'three';
import type { SolidScriptBlockRun } from './solid_script_machine_types.js';
import { solidScriptPathDistinct } from './solid_script_path.js';
import { SolidScriptPoint, solidScriptValueNumber, solidScriptValueNumbers } from './solid_script_value.js';

/**
 * Sizes each ring of a sweep by the Scale of its path point, about that point,
 * so a sweep can taper, and turns it by the Twist of that point, in degrees
 * about the way the path runs there. Scale and Twist are worked out once per
 * point, with [$Point], [$Index] and [$Count]; Scale 1 and Twist 0 keep the
 * profile as it is.
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
  const twists = points.map((point, index) => solidScriptSweepTwist(run, point, index, points.length));
  return rings.map((ring, index) => {
    const at = index % points.length;
    const center = points[at] ?? new THREE.Vector3();
    const turn = new THREE.Quaternion().setFromAxisAngle(
      solidScriptSweepRingAxis(ring),
      THREE.MathUtils.degToRad(twists[at] ?? 0),
    );
    const scale = scales[at] ?? 1;
    return ring.map((corner) => corner.clone().sub(center).multiplyScalar(scale).applyQuaternion(turn).add(center));
  });
}

/**
 * Reads the Up of each path point, the way the profile's up side faces on the
 * stretch that starts there; empty gives none, so the profile turns as little
 * as it can.
 *
 * @param run Running Sweep Along Path line.
 * @param path Path points as given.
 * @param closed True when the path loops.
 * @returns Up per path point, or none.
 */
export function solidScriptSweepUps(
  run: SolidScriptBlockRun,
  path: readonly THREE.Vector3[],
  closed: boolean,
): (THREE.Vector3 | null)[] {
  if (run.source('up').trim() === '') return [];
  const points = solidScriptPathDistinct(path, closed);
  return points.map((point, index) => {
    const numbers = solidScriptValueNumbers(run.valueWith('up', solidScriptSweepFills(point, index, points.length)));
    if (numbers?.length !== 3) throw new Error('Up needs three numbers, such as 0, 0, 1 or [=[$Point.Normal]]');
    const up = new THREE.Vector3(numbers[0], numbers[1], numbers[2]);
    return up.lengthSq() > 0 ? up.normalize() : null;
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
  const scale = solidScriptValueNumber(run.valueWith('scale', solidScriptSweepFills(point, index, count)));
  if (scale === undefined || scale < 0)
    throw new Error('Scale needs a number of 0 or more, such as 1 or [=1 - [$Index] / [$Count]]');
  return scale;
}

/**
 * Reads the Twist of one path point, in degrees.
 *
 * @param run Running line.
 * @param point Path point.
 * @param index Its number from 0.
 * @param count Number of path points.
 * @returns Twist.
 */
function solidScriptSweepTwist(run: SolidScriptBlockRun, point: THREE.Vector3, index: number, count: number): number {
  const twist = solidScriptValueNumber(run.valueWith('twist', solidScriptSweepFills(point, index, count)));
  if (twist === undefined) throw new Error('Twist needs a number of degrees, such as 0 or [=[$Index] * 15]');
  return twist;
}

/**
 * What Scale, Twist and Up read for one path point.
 *
 * @param point Path point.
 * @param index Its number from 0.
 * @param count Number of path points.
 * @returns Fills.
 */
function solidScriptSweepFills(
  point: THREE.Vector3,
  index: number,
  count: number,
): { $Point: SolidScriptPoint; $Index: number; $Count: number } {
  return { $Point: new SolidScriptPoint([point.x, point.y, point.z], [0, 1, 0]), $Index: index, $Count: count };
}

/**
 * The way a ring faces, from its corners, which is the way the path runs
 * through it.
 *
 * @param ring Ring corners.
 * @returns Unit direction.
 */
function solidScriptSweepRingAxis(ring: readonly THREE.Vector3[]): THREE.Vector3 {
  const normal = new THREE.Vector3();
  ring.forEach((corner, index) => {
    const next = ring[(index + 1) % ring.length] ?? corner;
    normal.x += (corner.y - next.y) * (corner.z + next.z);
    normal.y += (corner.z - next.z) * (corner.x + next.x);
    normal.z += (corner.x - next.x) * (corner.y + next.y);
  });
  return normal.lengthSq() > 0 ? normal.normalize() : new THREE.Vector3(0, 1, 0);
}
