import { solidScriptShapePolygonPoints } from './solid_script_shape.js';
import * as THREE from 'three';
import type { SolidScriptGeometryLeaf } from './solid_script_geometry.js';
import { solidScriptGeometryFaceMatrix } from './solid_script_geometry.js';
import { solidScriptKindNamed, solidScriptKindOf } from './solid_script_kinds.js';
import type { SolidScriptBlockArguments } from './solid_script_block_arguments.js';
import { solidScriptEachUsed } from './solid_script_each_uses.js';
import type { SolidScriptBlockRun } from './solid_script_machine_types.js';
import {
  solidScriptOutlineTransform,
  solidScriptResizeFactors,
  solidScriptResizeSize,
  solidScriptShapeTransform,
} from './solid_script_reshape.js';
import { solidScriptRunValueOptional } from './solid_script_run_optional.js';
import { solidScriptOfEmpty } from './solid_script_select.js';
import { SolidScriptElement, SolidScriptPathElement, type SolidScriptValue } from './solid_script_value.js';
import { solidScriptPathMap, solidScriptPathSample } from './solid_script_path_model.js';
import {
  solidScriptMoveMatrix,
  solidScriptOffsetMatrix,
  solidScriptRotateMatrix,
  solidScriptScaleMatrix,
} from './solid_script_transforms.js';

/**
 * Brushes and meshes, flat outlines, or a list of points, that a transform line
 * works on.
 */
export type SolidScriptTransformPicked =
  | { readonly kind: 'leaves'; readonly leaves: readonly SolidScriptGeometryLeaf[] }
  | { readonly kind: 'points'; readonly points: readonly THREE.Vector3[] }
  | {
      readonly kind: 'outlines';
      readonly outlines: readonly SolidScriptPathElement[];
      readonly points: readonly THREE.Vector3[];
    };

/** What the values of Of turned out to be, collected one by one. */
interface SolidScriptTransformTargets {
  leaves: SolidScriptGeometryLeaf[];
  points: THREE.Vector3[];
  outlines: SolidScriptPathElement[];
}

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
  const on = solidScriptRunValueOptional(run, 'on');
  if (on === undefined) return new THREE.Matrix4();
  const values = solidScriptTransformFlat(on);
  if (values.length !== 1)
    throw new Error('On takes one face or one object; give a single face or object, such as [Wall.Faces.First]');
  const value = values[0];
  if (value === undefined)
    throw new Error('On takes one face or one object; give a single face or object, such as [Wall.Faces.First]');
  if (value instanceof SolidScriptElement && value.kind === 'face') return solidScriptTransformFaceOn(run, value);
  if (value instanceof SolidScriptElement && value.kind === 'brush') return solidScriptTransformBrushOn(run, value);
  throw new Error(`On takes a face or an object, not ${solidScriptKindNamed(value)}`);
}

/**
 * Works out the script-space transform of what a transform line picked, from
 * the line's fields, such as a Move By of its By.
 */
export type SolidScriptTransformWorldOf = (
  run: SolidScriptBlockRun,
  picked: SolidScriptTransformPicked,
  args: SolidScriptBlockArguments,
) => THREE.Matrix4;

/**
 * Transforms the brushes, meshes, outlines or points in Of. When a field reads
 * a per-item value, such as By [=Vector(0, [$Index], 0)], each brush, outline
 * or point gets its own transform, with [$Item] the item, [$Index] its place in
 * Of from 0 and [$Count] how many there are; else they all move as one.
 *
 * @param run Running line.
 * @param label Command, for messages.
 * @param keys Keys of the fields that may change per item.
 * @param worldOf Transform of what is picked.
 */
export function solidScriptTransformEach(
  run: SolidScriptBlockRun,
  label: string,
  keys: readonly string[],
  worldOf: SolidScriptTransformWorldOf,
): void {
  const picked = solidScriptTransformPicked(run, label);
  const each = keys.includes('around') && solidScriptTransformAroundWord(run) === 'Each Center';
  if (!each && !keys.some((key) => solidScriptEachUsed(run.source(key)))) {
    solidScriptTransformWrite(run, label, picked, [worldOf(run, picked, run.fields())]);
    return;
  }
  const items = solidScriptTransformItems(run, picked);
  const worlds = items.map(({ item, part }, index) =>
    worldOf(run, part, run.fieldsWith({ $Item: item, $Index: index, $Count: items.length })),
  );
  solidScriptTransformWrite(run, label, picked, worlds);
}

/**
 * Splits what a transform line picked into its items: each brush or mesh, each
 * outline, or each point.
 *
 * @param run Running line.
 * @param picked What Of gave.
 * @returns Each item, as a value and as its own pick.
 */
function solidScriptTransformItems(
  run: SolidScriptBlockRun,
  picked: SolidScriptTransformPicked,
): { item: SolidScriptValue; part: SolidScriptTransformPicked }[] {
  if (picked.kind === 'leaves')
    return picked.leaves.map((leaf) => ({ item: run.elements.brush(leaf), part: { kind: 'leaves', leaves: [leaf] } }));
  if (picked.kind === 'points')
    return picked.points.map((point) => ({
      item: [point.x, point.y, point.z],
      part: { kind: 'points', points: [point] },
    }));
  return picked.outlines.map((outline) => ({
    item: outline,
    part: { kind: 'outlines', outlines: [outline], points: solidScriptTransformOutlinePoints(run, [outline]) },
  }));
}

/**
 * Applies script-space transforms to what a transform line picked: one for all
 * of it, or one per item.
 *
 * @param run Running line.
 * @param label Command, for messages.
 * @param picked What Of gave.
 * @param worlds One transform for everything, or one per item.
 */
function solidScriptTransformWrite(
  run: SolidScriptBlockRun,
  label: string,
  picked: SolidScriptTransformPicked,
  worlds: readonly THREE.Matrix4[],
): void {
  const worldAt = (index: number): THREE.Matrix4 => worlds[worlds.length === 1 ? 0 : index]!;
  if (picked.kind === 'points') {
    solidScriptTransformWritePoints(
      run,
      label,
      picked.points.map((point, index) => point.clone().applyMatrix4(worldAt(index))),
    );
    return;
  }
  if (picked.kind === 'outlines') {
    if (run.text('into').trim() !== '') throw new Error(`${label} changes a path where it is; leave Into empty`);
    picked.outlines.forEach((element, index) => {
      const drawn = run.pathDrawn(element);
      if (drawn) run.pathReplace(element, solidScriptOutlineTransform(drawn, worldAt(index)));
      else
        element.path = solidScriptPathMap(element.path, ([x = 0, y = 0, z = 0]) =>
          new THREE.Vector3(x, y, z).applyMatrix4(worldAt(index)).toArray(),
        );
    });
    return;
  }
  picked.leaves.forEach((leaf, index) => solidScriptTransformReplace(run, leaf, worldAt(index)));
}

/**
 * Script-space transform of a local transform in the line's space.
 *
 * @param local Works out the transform in the current space from the fields.
 * @returns Transform of what is picked.
 */
export function solidScriptTransformLocal(
  local: (args: SolidScriptBlockArguments) => THREE.Matrix4,
): SolidScriptTransformWorldOf {
  return (run, _, args) => solidScriptTransformWorld(run.matrix(), local(args));
}

/** Words of Around: the point Rotate By and Scale By work about. */
export const SOLID_SCRIPT_TRANSFORM_AROUND = ['Origin', 'Combined Center', 'Each Center'] as const;

/**
 * Reads Around, stopping on a word it does not know.
 *
 * @param run Running line.
 * @returns Around word.
 */
function solidScriptTransformAroundWord(run: SolidScriptBlockRun): (typeof SOLID_SCRIPT_TRANSFORM_AROUND)[number] {
  const typed = run.text('around').trim();
  const found = SOLID_SCRIPT_TRANSFORM_AROUND.find((word) => word.toLowerCase() === typed.toLowerCase());
  if (!found) throw new Error(`Around must be Origin, Combined Center or Each Center, not "${typed}"`);
  return found;
}

/**
 * Applies a local change about the point Around names: the origin of the
 * current space, the combined center of what is picked, or, with Each Center,
 * the center of each item, which then changes on its own.
 *
 * @param label Command, for messages.
 * @param local Change in the current space.
 * @returns Transform of what is picked.
 */
export function solidScriptTransformAround(
  label: string,
  local: (args: SolidScriptBlockArguments) => THREE.Matrix4,
): SolidScriptTransformWorldOf {
  return (run, picked, args) =>
    solidScriptTransformAroundWord(run) === 'Origin'
      ? solidScriptTransformWorld(run.matrix(), local(args))
      : solidScriptTransformAboutCenter(run, label, picked, local(args));
}

/**
 * Moves what is picked so its center sits at To, a point in script space.
 *
 * @param _ Running line.
 * @param picked What is moved.
 * @param args Fields.
 * @returns Transform.
 */
export const solidScriptTransformMoveTo: SolidScriptTransformWorldOf = (_, picked, args) => {
  const to = solidScriptTransformVectorField(args, 'to', [0, 0, 0]);
  const center = solidScriptTransformCenter(solidScriptTransformPickedPoints(picked));
  return solidScriptOffsetMatrix([to[0] - center.x, to[1] - center.y, to[2] - center.z]);
};

/**
 * Turns what is picked around its center by the To angles in the current space.
 *
 * @param run Running line.
 * @param picked What is turned.
 * @param args Fields.
 * @returns Transform.
 */
export const solidScriptTransformRotateTo: SolidScriptTransformWorldOf = (run, picked, args) =>
  solidScriptTransformAboutCenter(run, 'Rotate To', picked, solidScriptRotateMatrix(args, 'to'));

/**
 * Stretches what is picked about its center so it measures exactly To, in
 * metres, in the current space.
 *
 * @param run Running line.
 * @param picked What is stretched.
 * @param args Fields.
 * @returns Transform.
 */
export const solidScriptTransformScaleTo: SolidScriptTransformWorldOf = (run, picked, args) => {
  const inverse = solidScriptTransformInverse(run, 'Scale To');
  const points = solidScriptTransformPickedPoints(picked).map((point) => point.clone().applyMatrix4(inverse));
  const box = new THREE.Box3().setFromPoints(points);
  const extent = box.getSize(new THREE.Vector3()).toArray();
  const size = solidScriptTransformVectorField(args, 'to', [2, 2, 2]);
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
  return solidScriptTransformWorld(run.matrix(), local);
};

/**
 * Stretches what is picked to an exact size, measured in the current space
 * about its origin.
 *
 * @param run Running line.
 * @param picked What is stretched.
 * @param args Fields.
 * @returns Transform.
 */
export const solidScriptTransformResize: SolidScriptTransformWorldOf = (run, picked, args) => {
  const inverse = solidScriptTransformInverse(run, 'Resize');
  const points = solidScriptTransformPickedPoints(picked).map((point) => point.clone().applyMatrix4(inverse));
  const extent = new THREE.Box3().setFromPoints(points).getSize(new THREE.Vector3()).toArray();
  const [x, y, z] = solidScriptResizeFactors(extent, solidScriptResizeSize(args), args.flag('keep'), run.planar);
  return solidScriptTransformWorld(run.matrix(), new THREE.Matrix4().makeScale(x, y, z));
};

/**
 * Inverse of the line's space, which must not squash shapes flat.
 *
 * @param run Running line.
 * @param label Command, for messages.
 * @returns Inverse matrix.
 */
function solidScriptTransformInverse(run: SolidScriptBlockRun, label: string): THREE.Matrix4 {
  const space = run.matrix();
  if (Math.abs(space.determinant()) < 1e-9)
    throw new Error(`${label} cannot work in a space that squashes shapes flat`);
  return space.clone().invert();
}

/**
 * A local transform about the center of what is picked, in the current space.
 *
 * @param run Running line.
 * @param label Command, for messages.
 * @param picked What is transformed.
 * @param local Transform about the origin of the current space, moved to the
 *   center.
 * @returns Script-space transform.
 */
function solidScriptTransformAboutCenter(
  run: SolidScriptBlockRun,
  label: string,
  picked: SolidScriptTransformPicked,
  local: THREE.Matrix4,
): THREE.Matrix4 {
  const inverse = solidScriptTransformInverse(run, label);
  const center = solidScriptTransformCenter(
    solidScriptTransformPickedPoints(picked).map((point) => point.clone().applyMatrix4(inverse)),
  );
  const about = solidScriptOffsetMatrix([center.x, center.y, center.z])
    .multiply(local)
    .multiply(solidScriptOffsetMatrix([-center.x, -center.y, -center.z]));
  return solidScriptTransformWorld(run.matrix(), about);
}

/**
 * Reads a vector field, or the fallback when the field is left off.
 *
 * @param args Fields.
 * @param key Field key.
 * @param fallback Value when the field is left off.
 * @returns X, Y and Z.
 */
function solidScriptTransformVectorField(
  args: SolidScriptBlockArguments,
  key: string,
  fallback: readonly number[],
): [number, number, number] {
  const value = args.value(key);
  if (value === undefined || value === '') return [fallback[0] ?? 0, fallback[1] ?? 0, fallback[2] ?? 0];
  if (solidScriptKindOf(value) !== 'Vector')
    throw new Error('To needs one number or three numbers separated by commas');
  const items = Array.isArray(value) ? value : [];
  return [
    typeof items[0] === 'number' ? items[0] : 0,
    typeof items[1] === 'number' ? items[1] : 0,
    typeof items[2] === 'number' ? items[2] : 0,
  ];
}

/**
 * Reads Of, or [$Selected.Objects] when Of is empty, as brushes and meshes or
 * as a list of points, not both at once.
 *
 * @param run Running line.
 * @param label Command, for messages.
 * @returns Leaves or points.
 */
export function solidScriptTransformPicked(run: SolidScriptBlockRun, label: string): SolidScriptTransformPicked {
  const given = run.ofValues();
  const values = given ?? run.selectedGet('objects');
  if (values.length === 0) throw new Error(solidScriptTransformEmpty(label, given !== null));
  const targets: SolidScriptTransformTargets = { leaves: [], points: [], outlines: [] };
  for (const value of values) solidScriptTransformCollect(run, label, value, targets);
  const { leaves, points, outlines } = targets;
  if (outlines.length > 0 && leaves.length + points.length > 0)
    throw new Error(`${label} works on paths on their own, not mixed with objects or points`);
  if (outlines.length > 0)
    return { kind: 'outlines', outlines, points: solidScriptTransformOutlinePoints(run, outlines) };
  if (leaves.length > 0 && points.length > 0)
    throw new Error(`${label} works on objects, or on a list of points, not both at once`);
  return points.length > 0 ? { kind: 'points', points } : { kind: 'leaves', leaves };
}

/**
 * Points of flat outlines, at Z 0.
 *
 * @param run Running line.
 * @param outlines Outline elements.
 * @returns Points in script space.
 */
function solidScriptTransformOutlinePoints(
  run: SolidScriptBlockRun,
  outlines: readonly SolidScriptPathElement[],
): THREE.Vector3[] {
  return outlines.flatMap((element) => {
    const drawn = run.pathDrawn(element);
    if (drawn) return solidScriptShapePolygonPoints(drawn).map(([x, y]) => new THREE.Vector3(x, y, 0));
    return solidScriptPathSample(element.path).map(([x = 0, y = 0, z = 0]) => new THREE.Vector3(x, y, z));
  });
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
  if (faces.length !== 1) throw new Error('On takes one face or one object; give a single face or object');
  const face = faces[0];
  if (!face) throw new Error('On takes one face or one object; give a single face or object');
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
    ? `${label} has nothing in Of; check that Of holds objects or a list of points`
    : solidScriptOfEmpty(label, 'objects');
}

/**
 * Adds one Of or selection value as a leaf, an outline or a point.
 *
 * @param run Running line.
 * @param label Command, for messages.
 * @param value Value.
 * @param targets What was collected so far.
 */
function solidScriptTransformCollect(
  run: SolidScriptBlockRun,
  label: string,
  value: SolidScriptValue,
  targets: SolidScriptTransformTargets,
): void {
  if (solidScriptKindOf(value) === 'Vector') {
    targets.points.push(solidScriptTransformVector(value));
    return;
  }
  if (value instanceof SolidScriptPathElement) {
    if (!targets.outlines.includes(value)) targets.outlines.push(value);
    return;
  }
  if (value instanceof SolidScriptElement && value.kind === 'brush') {
    const leaf = run.leafLatest(run.elements.leaf(value));
    if (!targets.leaves.includes(leaf)) targets.leaves.push(leaf);
    return;
  }
  throw new Error(
    `${label} takes objects, paths or points, not ${solidScriptKindNamed(value)}; give those in Of, or leave Of empty to use [$Selected.Objects]`,
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
  return picked.kind === 'leaves' ? picked.leaves.flatMap((leaf) => leaf.points) : [...picked.points];
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
