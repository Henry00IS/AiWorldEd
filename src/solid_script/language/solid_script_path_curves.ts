import * as THREE from 'three';
import {
  SOLID_SCRIPT_PATH_SHAPE_EPSILON,
  solidScriptPathCornerSides,
  solidScriptPathCount,
  solidScriptPathOpen,
} from './solid_script_path_shape.js';

/**
 * Points along a curve from From to To that leaves From toward its handle and
 * comes into To from its handle.
 *
 * @param from Start point.
 * @param fromHandle Point the curve heads for as it leaves From.
 * @param toHandle Point the curve comes from as it reaches To.
 * @param to End point.
 * @param count How many points.
 * @param label Command, for messages.
 * @returns Points.
 */
export function solidScriptPathBezier(
  from: THREE.Vector3,
  fromHandle: THREE.Vector3,
  toHandle: THREE.Vector3,
  to: THREE.Vector3,
  count: number,
  label: string,
): THREE.Vector3[] {
  if (from.distanceTo(to) <= SOLID_SCRIPT_PATH_SHAPE_EPSILON)
    throw new Error(`${label} needs From and To at different points`);
  const steps = solidScriptPathCount(count, label);
  return new THREE.CubicBezierCurve3(from, fromHandle, toHandle, to).getPoints(steps - 1);
}

/**
 * A smooth path that runs through every one of the points, bending gently
 * between them, with Sides points on each stretch.
 *
 * @param points Points to pass through, at least 2.
 * @param sides Segments on each stretch between two points, 1 to 64.
 * @param closed True when the last point joins the first.
 * @param label Command, for messages.
 * @returns Points.
 */
export function solidScriptPathSmooth(
  points: readonly THREE.Vector3[],
  sides: number,
  closed: boolean,
  label: string,
): THREE.Vector3[] {
  const path = solidScriptPathOpen(points, closed, label);
  const segments = solidScriptPathCornerSides(sides, label);
  const stretches = closed ? path.length : path.length - 1;
  const curve = new THREE.CatmullRomCurve3(path, closed, 'centripetal');
  const smooth = curve.getPoints(stretches * segments);
  if (closed) smooth.pop();
  return smooth;
}
