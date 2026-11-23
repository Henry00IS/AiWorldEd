import * as THREE from 'three';
import type { PathAssetPoint } from './path_asset.js';

/**
 * Gives the points strictly inside an exact circular arc from Start to End that
 * sweeps Degrees about Axis: they lie on the circle itself, not on a curve that
 * only comes close to it. A negative sweep bends to the other side, and a sweep
 * past 180 degrees takes the long way round.
 *
 * @param start Start point.
 * @param end End point.
 * @param degrees Sweep in degrees, from 1 to 359 either way.
 * @param axis Turning axis; tilted toward the stretch, only its part square to
 *   the stretch counts.
 * @param resolution Steps per quarter turn.
 * @returns Inner points in order; none for a stretch of no length.
 */
export function pathAssetArcInner(
  start: PathAssetPoint,
  end: PathAssetPoint,
  degrees: number,
  axis: PathAssetPoint,
  resolution: number,
): number[][] {
  const from = new THREE.Vector3(...start);
  const chord = new THREE.Vector3(...end).sub(from);
  const length = chord.length();
  if (length < 1e-9) return [];
  const turn = pathAssetArcAxis(chord.divideScalar(length), new THREE.Vector3(...axis));
  const sweep = THREE.MathUtils.degToRad(degrees);
  const radius = length / (2 * Math.sin(Math.abs(sweep) / 2));
  const inward = new THREE.Vector3().crossVectors(turn, chord).multiplyScalar(Math.sign(sweep));
  const centre = from
    .clone()
    .addScaledVector(chord, length / 2)
    .addScaledVector(inward, radius * Math.cos(sweep / 2));
  return pathAssetArcTurns(from.clone().sub(centre), centre, turn, sweep, resolution);
}

/**
 * Turns an arm about the centre in even steps, giving the points strictly
 * between its start and the full sweep.
 *
 * @param arm Start point less the centre.
 * @param centre Circle centre.
 * @param turn Unit turning axis.
 * @param sweep Sweep in radians.
 * @param resolution Steps per quarter turn.
 * @returns Inner points in order.
 */
function pathAssetArcTurns(
  arm: THREE.Vector3,
  centre: THREE.Vector3,
  turn: THREE.Vector3,
  sweep: number,
  resolution: number,
): number[][] {
  const steps = Math.max(2, Math.ceil((resolution * Math.abs(sweep)) / (Math.PI / 2)));
  return Array.from({ length: steps - 1 }, (_, index) =>
    arm
      .clone()
      .applyAxisAngle(turn, (sweep * (index + 1)) / steps)
      .add(centre)
      .toArray(),
  );
}

/**
 * Returns the unit axis an arc turns about: the given axis made square to the
 * stretch, or another square axis when the given one runs along it.
 *
 * @param direction Unit direction of the stretch.
 * @param axis Given axis.
 * @returns Unit axis square to the stretch.
 */
function pathAssetArcAxis(direction: THREE.Vector3, axis: THREE.Vector3): THREE.Vector3 {
  const square = axis.clone().addScaledVector(direction, -axis.dot(direction));
  if (square.lengthSq() > 1e-12) return square.normalize();
  const other = Math.abs(direction.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  return other.addScaledVector(direction, -other.dot(direction)).normalize();
}
