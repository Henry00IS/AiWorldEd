import * as THREE from 'three';
import { solidScriptEigenSymmetric } from './solid_script_eigen.js';
import { solidScriptNoiseWord } from './solid_script_functions_noise.js';
import { solidScriptMatrixRead, solidScriptMatrixRows } from './solid_script_functions_matrix.js';
import { solidScriptMemberRound } from './solid_script_members.js';
import { solidScriptValueText, type SolidScriptValue } from './solid_script_value.js';
import { solidScriptVectorThreeRequire } from './solid_script_vector.js';

/** What PrincipalAxes gives. */
export const SOLID_SCRIPT_PRINCIPAL_OUTPUTS = ['Axes', 'Spread', 'Center'] as const;

/** What MatrixSvd gives. */
export const SOLID_SCRIPT_SVD_OUTPUTS = ['S', 'U', 'V'] as const;

/**
 * Rounds a vector into a list of numbers.
 *
 * @param vector Vector.
 * @returns Rounded numbers.
 */
function solidScriptPrincipalNumbers(vector: THREE.Vector3): number[] {
  return vector.toArray().map((value) => solidScriptMemberRound(value) + 0);
}

/**
 * Reads the points of PrincipalAxes.
 *
 * @param value List of points.
 * @param usage How to call the function, for the message.
 * @returns Points, at least one.
 */
function solidScriptPrincipalPoints(value: SolidScriptValue, usage: string): THREE.Vector3[] {
  const points = (Array.isArray(value) ? value : []).map((entry) => {
    return solidScriptVectorThreeRequire(entry, `${usage} needs points as vectors, not ${solidScriptValueText(entry)}`);
  });
  if (points.length === 0) throw new Error(`${usage} needs a list of at least one point`);
  return points;
}

/**
 * Averages, over the points, the product of their offsets from the middle along
 * each pair of axes.
 *
 * @param points Points.
 * @param center Their middle.
 * @returns Three rows of three numbers.
 */
function solidScriptPrincipalSpread(points: readonly THREE.Vector3[], center: THREE.Vector3): number[][] {
  const offsets = points.map((point) => point.clone().sub(center).toArray());
  return [0, 1, 2].map((row) =>
    [0, 1, 2].map(
      (column) => offsets.reduce((sum, offset) => sum + (offset[row] ?? 0) * (offset[column] ?? 0), 0) / points.length,
    ),
  );
}

/**
 * Gives the main axes of a cloud of points, the axis with the widest spread
 * first; or the spread along each, or the middle.
 *
 * @param points Points, at least one.
 * @param output What to give.
 * @returns Axes, spread or middle.
 */
function solidScriptPrincipalOf(
  points: readonly THREE.Vector3[],
  output: (typeof SOLID_SCRIPT_PRINCIPAL_OUTPUTS)[number],
): number[] | number[][] {
  const center = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(points.length);
  if (output === 'Center') return solidScriptPrincipalNumbers(center);
  const spread = solidScriptPrincipalSpread(points, center);
  const eigen = solidScriptEigenSymmetric(spread);
  if (output === 'Spread') return eigen.values.map((value) => solidScriptMemberRound(Math.sqrt(Math.max(0, value))));
  return eigen.vectors.map(solidScriptPrincipalNumbers);
}

/**
 * Gives the main axes, spread or middle of the points; with Groups, every point
 * gets the result of the points in its own group.
 *
 * @param args Points, optional Output and optional Groups.
 * @returns One result, or one per point.
 */
function solidScriptPrincipalAxes(args: readonly SolidScriptValue[]): SolidScriptValue {
  const usage = 'PrincipalAxes(points, output, groups)';
  const points = solidScriptPrincipalPoints(args[0], usage);
  const output = solidScriptNoiseWord(args[1], SOLID_SCRIPT_PRINCIPAL_OUTPUTS, usage);
  const groups = Array.isArray(args[2]) ? args[2].map((group) => solidScriptValueText(group)) : [];
  if (groups.length === 0) return solidScriptPrincipalOf(points, output);
  if (groups.length !== points.length) throw new Error(`${usage} needs one group per point in Groups, or none`);
  const results = new Map<string, SolidScriptValue>();
  return groups.map((group) => {
    if (!results.has(group))
      results.set(
        group,
        solidScriptPrincipalOf(
          points.filter((_point, index) => groups[index] === group),
          output,
        ),
      );
    return results.get(group);
  });
}

/**
 * Splits the turn and scale part of a matrix into a turn U, stretches S and a
 * turn V, so the matrix is U times S times V turned around; U mirrors when the
 * matrix does.
 *
 * @param matrix Matrix.
 * @returns U and V as matrices and S, largest first.
 */
function solidScriptPrincipalSvd(matrix: THREE.Matrix4): { u: THREE.Matrix4; s: number[]; v: THREE.Matrix4 } {
  const linear = new THREE.Matrix3().setFromMatrix4(matrix);
  const product = linear.clone().transpose().multiply(linear).elements;
  const eigen = solidScriptEigenSymmetric(
    [0, 1, 2].map((row) => [0, 1, 2].map((column) => product[column * 3 + row] ?? 0)),
  );
  const raw = eigen.values.map((value) => Math.sqrt(Math.max(0, value)));
  const s = raw.map((value) => (value > Math.max(raw[0] ?? 0, 1) * 1e-6 ? value : 0));
  const [v0, v1, v2] = eigen.vectors as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  const v2Right = v0.clone().cross(v1).dot(v2) < 0 ? v2.clone().negate() : v2;
  const lefts = [v0, v1, v2Right].map((axis) => axis.clone().applyMatrix3(linear));
  const [u0, u1, u2] = solidScriptPrincipalComplete(lefts, s);
  return {
    u: new THREE.Matrix4().makeBasis(u0 ?? v0, u1 ?? v1, u2 ?? v2),
    s,
    v: new THREE.Matrix4().makeBasis(v0, v1, v2Right),
  };
}

/**
 * Makes the left axes square to each other and unit length, filling in any
 * whose stretch is too small to give a direction; the third keeps its side when
 * its stretch gives one, so a mirroring matrix gives a mirroring U.
 *
 * @param lefts Left axes from the stretches.
 * @param s Stretches, largest first; 0 where too small to give a direction.
 * @returns Three unit axes.
 */
function solidScriptPrincipalComplete(lefts: THREE.Vector3[], s: readonly number[]): THREE.Vector3[] {
  const [a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()] = lefts;
  const first = (s[0] ?? 0) > 0 ? a.normalize() : new THREE.Vector3(1, 0, 0);
  const helper = Math.abs(first.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const guess = (s[1] ?? 0) > 0 ? b : helper;
  const second = guess.sub(first.clone().multiplyScalar(guess.dot(first))).normalize();
  const third = first.clone().cross(second);
  return [first, second, (s[2] ?? 0) > 0 && c.dot(third) < 0 ? third.negate() : third];
}

/** Functions on point clouds and matrices that find main axes. */
export const SOLID_SCRIPT_FUNCTIONS_PRINCIPAL = {
  principal_axes: solidScriptPrincipalAxes,
  matrix_svd: (args: readonly SolidScriptValue[]): number[] | number[][] => {
    const usage = 'MatrixSvd(matrix, output)';
    const parts = solidScriptPrincipalSvd(solidScriptMatrixRead(args[0], usage));
    const output = solidScriptNoiseWord(args[1], SOLID_SCRIPT_SVD_OUTPUTS, usage);
    if (output === 'S') return parts.s.map((value) => solidScriptMemberRound(value) + 0);
    return solidScriptMatrixRows(output === 'U' ? parts.u : parts.v).map((row) =>
      row.map((value) => solidScriptMemberRound(value) + 0),
    );
  },
};
