import * as THREE from 'three';
import type { SolidScriptGeometryLeaf } from './solid_script_geometry.js';
import { solidScriptGeometryFaceMatrix } from './solid_script_geometry.js';
import { solidScriptKindNamed, solidScriptKindOf } from './solid_script_kinds.js';
import type { SolidScriptBlockRun } from './solid_script_machine_types.js';
import { solidScriptResizeFactors, solidScriptResizeSize, solidScriptShapeTransform } from './solid_script_reshape.js';
import { solidScriptOfEmpty } from './solid_script_select.js';
import { SolidScriptElement, type SolidScriptValue } from './solid_script_value.js';
import {
  solidScriptMoveMatrix,
  solidScriptOffsetMatrix,
  solidScriptRotateMatrix,
  solidScriptScaleMatrix,
} from './solid_script_transforms.js';

/** Brushes and meshes, or a list of points, that a transform line works on. */
export type SolidScriptTransformPicked =
  | { readonly kind: 'leaves'; readonly leaves: readonly SolidScriptGeometryLeaf[] }
  | { readonly kind: 'points'; readonly points: readonly THREE.Vector3[] };

/**
 * Matrix that applies a local transform in the current space: local numbers are
 * in that space, and the result is stored in script space.
 *
 * @param space Current context matrix.
 * @param local Transform in that space.
 * @returns Matrix to apply to script-space points.
 */
export function solidScriptTransformWorld(space: THREE.Matrix4, local: THREE.Matrix4): THREE.Matrix4 {
  if (Math.abs(space.determinant()) < 1e-9)
    throw new Error('Transform cannot work in a space that squashes shapes flat');
  return space.clone().multiply(local).multiply(space.clone().invert());
}

/**
 * Matrix of the Transform block: On, then Move, then Rotate, then Scale.
 *
 * @param run Running line.
 * @returns Space its lines work in, relative to the parent space.
 */
export function solidScriptTransformSpace(run: SolidScriptBlockRun): THREE.Matrix4 {
  const fields = run.fields();
  return solidScriptTransformOnMatrix(run)
    .multiply(solidScriptMoveMatrix(fields, 'move'))
    .multiply(solidScriptRotateMatrix(fields, 'rotate'))
    .multiply(solidScriptScaleMatrix(fields, 'scale'));
}

/**
 * Space of On: a face's Place On Face frame, or a brush's center with world
 * axes, or the identity when On is empty.
 *
 * @param run Running line.
 * @returns Matrix.
 */
export function solidScriptTransformOnMatrix(run: SolidScriptBlockRun): THREE.Matrix4 {
  if (run.text('on').trim() === '') return new THREE.Matrix4();
  const values = solidScriptTransformFlat(run.value('on'));
  if (values.length !== 1)
    throw new Error('On takes one face or one brush; give a single face or brush, such as [Wall.Faces.First]');
  const value = values[0];
  if (value === undefined)
    throw new Error('On takes one face or one brush; give a single face or brush, such as [Wall.Faces.First]');
  if (value instanceof SolidScriptElement && value.kind === 'face') return solidScriptTransformFaceOn(run, value);
  if (value instanceof SolidScriptElement && value.kind === 'brush') return solidScriptTransformBrushOn(run, value);
  throw new Error(`On takes a face or a brush, not ${solidScriptKindNamed(value)}`);
}

/**
 * Applies a local transform to the brushes, meshes or points in Of.
 *
 * @param run Running line.
 * @param label Command, for messages.
 * @param local Transform in the current space.
 */
export function solidScriptTransformApply(run: SolidScriptBlockRun, label: string, local: THREE.Matrix4): void {
  solidScriptTransformApplyWorld(run, label, solidScriptTransformWorld(run.matrix(), local));
}

/**
 * Applies a script-space transform to the brushes, meshes or points in Of.
 *
 * @param run Running line.
 * @param label Command, for messages.
 * @param world Transform in script space.
 */
export function solidScriptTransformApplyWorld(run: SolidScriptBlockRun, label: string, world: THREE.Matrix4): void {
  const picked = solidScriptTransformPicked(run, label);
  if (picked.kind === 'points') {
    solidScriptTransformWritePoints(
      run,
      label,
      picked.points.map((point) => point.clone().applyMatrix4(world)),
    );
    return;
  }
  for (const leaf of picked.leaves) solidScriptTransformReplace(run, leaf, world);
}

/**
 * Moves the brushes, meshes or points in Of by a distance in the current space.
 *
 * @param run Running line.
 */
export function solidScriptTransformMove(run: SolidScriptBlockRun): void {
  solidScriptTransformApply(run, 'Move By', solidScriptOffsetMatrix(solidScriptRunVector(run, 'by', [0, 0, 0])));
}

/**
 * Moves the brushes, meshes or points in Of so their combined center sits at
 * To, a point in script space.
 *
 * @param run Running line.
 */
export function solidScriptTransformMoveTo(run: SolidScriptBlockRun): void {
  const picked = solidScriptTransformPicked(run, 'Move To');
  const to = solidScriptRunVector(run, 'to', [0, 0, 0]);
  const center = solidScriptTransformCenter(solidScriptTransformPickedPoints(picked));
  solidScriptTransformApplyWorld(
    run,
    'Move To',
    solidScriptOffsetMatrix([to[0] - center.x, to[1] - center.y, to[2] - center.z]),
  );
}

/**
 * Turns the brushes, meshes or points in Of around their combined center, by
 * the To angles in the current space.
 *
 * @param run Running line.
 */
export function solidScriptTransformRotateTo(run: SolidScriptBlockRun): void {
  solidScriptTransformAboutCenter(run, 'Rotate To', solidScriptRotateMatrix(run.fields(), 'to'));
}

/**
 * Stretches the brushes, meshes or points in Of about their combined center so
 * they measure exactly To, in metres, in the current space.
 *
 * @param run Running line.
 */
export function solidScriptTransformScaleTo(run: SolidScriptBlockRun): void {
  const space = run.matrix();
  if (Math.abs(space.determinant()) < 1e-9)
    throw new Error('Scale To cannot work in a space that squashes shapes flat');
  const inverse = space.clone().invert();
  const points = solidScriptTransformPickedPoints(solidScriptTransformPicked(run, 'Scale To')).map((point) =>
    point.clone().applyMatrix4(inverse),
  );
  const box = new THREE.Box3().setFromPoints(points);
  const extent = box.getSize(new THREE.Vector3()).toArray();
  const size = solidScriptRunVector(run, 'to', [2, 2, 2]);
  if (size.some((value) => value <= 0)) throw new Error('To needs a size above 0 on every axis, such as 2, 2, 2');
  const axes = run.planar ? 2 : 3;
  const factors: [number, number, number] = [1, 1, 1];
  for (let axis = 0; axis < axes; axis++) {
    const span = extent[axis] ?? 0;
    const target = size[axis] ?? 0;
    if (!(span > 1e-9))
      throw new Error(
        `Scale To cannot stretch shapes that are flat along ${'XYZ'[axis]} to ${target}; check that they have thickness along that axis`,
      );
    factors[axis] = target / span;
  }
  const center = box.getCenter(new THREE.Vector3());
  const local = solidScriptOffsetMatrix([center.x, center.y, center.z])
    .multiply(new THREE.Matrix4().makeScale(...factors))
    .multiply(solidScriptOffsetMatrix([-center.x, -center.y, -center.z]));
  solidScriptTransformApply(run, 'Scale To', local);
}

/**
 * Applies a local transform about the combined center of the selection, in the
 * current space.
 *
 * @param run Running line.
 * @param label Command, for messages.
 * @param local Transform about the origin of the current space, moved to the
 *   center.
 */
function solidScriptTransformAboutCenter(run: SolidScriptBlockRun, label: string, local: THREE.Matrix4): void {
  const space = run.matrix();
  if (Math.abs(space.determinant()) < 1e-9)
    throw new Error(`${label} cannot work in a space that squashes shapes flat`);
  const inverse = space.clone().invert();
  const center = solidScriptTransformCenter(
    solidScriptTransformPickedPoints(solidScriptTransformPicked(run, label)).map((point) =>
      point.clone().applyMatrix4(inverse),
    ),
  );
  const about = solidScriptOffsetMatrix([center.x, center.y, center.z])
    .multiply(local)
    .multiply(solidScriptOffsetMatrix([-center.x, -center.y, -center.z]));
  solidScriptTransformApply(run, label, about);
}

/**
 * Reads a vector field, or the fallback when the field is left off.
 *
 * @param run Running line.
 * @param key Field key.
 * @param fallback Value when the field is left off.
 * @returns X, Y and Z.
 */
function solidScriptRunVector(
  run: SolidScriptBlockRun,
  key: string,
  fallback: readonly number[],
): [number, number, number] {
  if (run.text(key).trim() === '') return [fallback[0] ?? 0, fallback[1] ?? 0, fallback[2] ?? 0];
  const value = run.value(key);
  if (solidScriptKindOf(value) !== 'Vector')
    throw new Error(`${key === 'by' ? 'By' : 'To'} needs one number or three numbers separated by commas`);
  const items = Array.isArray(value) ? value : [];
  return [
    typeof items[0] === 'number' ? items[0] : 0,
    typeof items[1] === 'number' ? items[1] : 0,
    typeof items[2] === 'number' ? items[2] : 0,
  ];
}

/**
 * Stretches the brushes, meshes or points in Of to an exact size, measured in
 * the current space about its origin.
 *
 * @param run Running line.
 */
export function solidScriptTransformResize(run: SolidScriptBlockRun): void {
  const space = run.matrix();
  if (Math.abs(space.determinant()) < 1e-9) throw new Error('Resize cannot work in a space that squashes shapes flat');
  const inverse = space.clone().invert();
  const points = solidScriptTransformPickedPoints(solidScriptTransformPicked(run, 'Resize')).map((point) =>
    point.clone().applyMatrix4(inverse),
  );
  const extent = new THREE.Box3().setFromPoints(points).getSize(new THREE.Vector3()).toArray();
  const size = solidScriptResizeSize(run.fields());
  const [x, y, z] = solidScriptResizeFactors(extent, size, run.fields().flag('keep'), run.planar);
  solidScriptTransformApply(run, 'Resize', new THREE.Matrix4().makeScale(x, y, z));
}

/**
 * Reads Of, or [$Selected.Brushes] when Of is empty, as brushes and meshes or
 * as a list of points, not both at once.
 *
 * @param run Running line.
 * @param label Command, for messages.
 * @returns Leaves or points.
 */
export function solidScriptTransformPicked(run: SolidScriptBlockRun, label: string): SolidScriptTransformPicked {
  const given = run.ofValues();
  const values = given ?? run.selectedGet('brushes');
  if (values.length === 0) throw new Error(solidScriptTransformEmpty(label, given !== null));
  const leaves: SolidScriptGeometryLeaf[] = [];
  const points: THREE.Vector3[] = [];
  for (const value of values) solidScriptTransformCollect(run, label, value, leaves, points);
  if (leaves.length > 0 && points.length > 0)
    throw new Error(`${label} works on brushes and meshes, or on a list of points, not both at once`);
  return points.length > 0 ? { kind: 'points', points } : { kind: 'leaves', leaves };
}

/**
 * Name of a single variable in Of, when Of is only that name in brackets.
 *
 * @param run Running line.
 * @returns Name, or null when Of is empty or not one name.
 */
export function solidScriptTransformOfName(run: SolidScriptBlockRun): string | null {
  const match = /^\[([A-Za-z][A-Za-z0-9]*)\]$/.exec(run.source('of').trim());
  return match?.[1] ?? null;
}

/**
 * Flattens a value or a list of values into one list.
 *
 * @param value Value or list.
 * @returns Items.
 */
function solidScriptTransformFlat(value: SolidScriptValue): SolidScriptValue[] {
  return Array.isArray(value) && solidScriptKindOf(value) !== 'Vector'
    ? value.flatMap(solidScriptTransformFlat)
    : [value];
}

/**
 * Face frame of a face in On, as Place On Face uses.
 *
 * @param run Running line.
 * @param element Face.
 * @returns Matrix.
 */
function solidScriptTransformFaceOn(run: SolidScriptBlockRun, element: SolidScriptElement): THREE.Matrix4 {
  const faces = run.elements.faces(element);
  if (faces.length !== 1) throw new Error('On takes one face or one brush; give a single face or brush');
  const face = faces[0];
  if (!face) throw new Error('On takes one face or one brush; give a single face or brush');
  return solidScriptGeometryFaceMatrix(face);
}

/**
 * Space at a brush's center, with world axes.
 *
 * @param run Running line.
 * @param element Brush.
 * @returns Matrix.
 */
function solidScriptTransformBrushOn(run: SolidScriptBlockRun, element: SolidScriptElement): THREE.Matrix4 {
  const leaf = run.leafLatest(run.elements.leaf(element));
  const center = solidScriptTransformCenter(leaf.points);
  return solidScriptOffsetMatrix([center.x, center.y, center.z]);
}

/**
 * Replaces a leaf with its transformed copy.
 *
 * @param run Running line.
 * @param leaf Target.
 * @param world Transform in script space.
 */
function solidScriptTransformReplace(
  run: SolidScriptBlockRun,
  leaf: SolidScriptGeometryLeaf,
  world: THREE.Matrix4,
): void {
  const shaped = solidScriptShapeTransform(run.leafLatest(leaf), world);
  if (shaped.kind === 'solid' || shaped.kind === 'mesh') run.leafReplace(leaf, shaped);
}

/**
 * Writes a transformed point list to Into, or back to a variable in Of.
 *
 * @param run Running line.
 * @param label Command, for messages.
 * @param points Transformed points.
 */
function solidScriptTransformWritePoints(
  run: SolidScriptBlockRun,
  label: string,
  points: readonly THREE.Vector3[],
): void {
  const list: SolidScriptValue = points.map((point) => [point.x, point.y, point.z]);
  const into = run
    .text('into')
    .trim()
    .replace(/^\[(.*)\]$/s, '$1');
  if (into !== '') {
    run.variableSet(into, list);
    return;
  }
  const name = solidScriptTransformOfName(run);
  if (name === null)
    throw new Error(`${label} needs a variable in Of or Into to write the points back; give one such as [Spots]`);
  run.variableSet(name, list);
}

/**
 * Tells why a line has nothing to transform.
 *
 * @param label Command, for messages.
 * @param given True when Of was set.
 * @returns Message.
 */
function solidScriptTransformEmpty(label: string, given: boolean): string {
  return given
    ? `${label} has nothing in Of; check that Of holds brushes, meshes or a list of points`
    : solidScriptOfEmpty(label, 'brushes');
}

/**
 * Adds one Of or selection value as a leaf or a point.
 *
 * @param run Running line.
 * @param label Command, for messages.
 * @param value Value.
 * @param leaves Leaves already collected.
 * @param points Points already collected.
 */
function solidScriptTransformCollect(
  run: SolidScriptBlockRun,
  label: string,
  value: SolidScriptValue,
  leaves: SolidScriptGeometryLeaf[],
  points: THREE.Vector3[],
): void {
  if (solidScriptKindOf(value) === 'Vector') {
    points.push(solidScriptTransformVector(value));
    return;
  }
  if (value instanceof SolidScriptElement && value.kind === 'brush') {
    const leaf = run.leafLatest(run.elements.leaf(value));
    if (!leaves.includes(leaf)) leaves.push(leaf);
    return;
  }
  throw new Error(
    `${label} takes brushes, meshes or points, not ${solidScriptKindNamed(value)}; give those in Of, or leave Of empty to use [$Selected.Brushes]`,
  );
}

/**
 * Reads a Vector value as a 3D point.
 *
 * @param value Vector.
 * @returns Point.
 */
function solidScriptTransformVector(value: SolidScriptValue): THREE.Vector3 {
  const items = Array.isArray(value) ? value : [];
  const x = typeof items[0] === 'number' ? items[0] : 0;
  const y = typeof items[1] === 'number' ? items[1] : 0;
  const z = typeof items[2] === 'number' ? items[2] : 0;
  return new THREE.Vector3(x, y, z);
}

/**
 * Points of leaves, or the points list itself.
 *
 * @param picked Targets.
 * @returns Points in script space.
 */
function solidScriptTransformPickedPoints(picked: SolidScriptTransformPicked): THREE.Vector3[] {
  return picked.kind === 'points' ? [...picked.points] : picked.leaves.flatMap((leaf) => leaf.points);
}

/**
 * Combined center of points.
 *
 * @param points Points.
 * @returns Center, or the origin when there are none.
 */
function solidScriptTransformCenter(points: readonly THREE.Vector3[]): THREE.Vector3 {
  if (points.length === 0) return new THREE.Vector3();
  return new THREE.Box3().setFromPoints([...points]).getCenter(new THREE.Vector3());
}
