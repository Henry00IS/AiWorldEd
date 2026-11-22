import * as THREE from 'three';
import { solidScriptGeometryFrame } from './solid_script_geometry.js';
import type { SolidScriptBlockRun } from './solid_script_machine_types.js';
import { solidScriptEachUsed } from './solid_script_each_uses.js';
import { solidScriptAlignDirectionMatrix, solidScriptForwardMatrix } from './solid_script_transforms.js';
import {
  SolidScriptPoint,
  solidScriptValueNumber,
  solidScriptValueNumbers,
  type SolidScriptValue,
} from './solid_script_value.js';

/** Per-point values of one Place At Points copy, such as $Point and $Index. */
type SolidScriptPlaceFills = Readonly<Record<string, SolidScriptValue>>;

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

/** Where one copy of Place At Points stands, and which line inside builds it. */
export interface SolidScriptPlaced {
  matrix: THREE.Matrix4;
  /** Choice of the line inside, wrapping; null builds every line. */
  choice: number | null;
}

/** Words of Build: every line inside at each point, or one chosen per point. */
export const SOLID_SCRIPT_PLACE_BUILD = ['Every Line', 'One Line'] as const;

/**
 * Copies of a Place At Points line: the matrix that stands a shape at each
 * point, in the frame of the blocks around it, and with Build One Line the
 * Choice of line for that point. Directions, Forward, Lift, Align To Normal,
 * Rotation, Scale and Choice may each change per point.
 *
 * @param run Running line.
 * @returns One copy per point.
 */
export function solidScriptPlaceMatrices(run: SolidScriptBlockRun): SolidScriptPlaced[] {
  const points = solidScriptPlacePoints(run, 'at', 'At');
  const directionOf = solidScriptPlaceDirections(run, points, 'directions', 'Directions');
  const forwardOf = solidScriptPlaceDirections(run, points, 'forward', 'Forward');
  const parent = run.matrix();
  const one = solidScriptPlaceOneWanted(run);
  return points.map((point, index) => {
    const direction = directionOf(index);
    const fills = solidScriptPlaceFills(point, direction, index, points.length);
    const matrix = solidScriptPlaceCopyMatrix(run, point, direction, fills, forwardOf(index));
    return { matrix: parent.clone().multiply(matrix), choice: one ? solidScriptPlaceChoice(run, fills) : null };
  });
}

/**
 * Matrix of one copy, from its per-point Lift, Align To Normal, Rotation and
 * Scale.
 *
 * @param run Running line.
 * @param point Point to stand on.
 * @param direction Up direction, or null for world up.
 * @param fills Per-point values.
 * @param forward Front direction, or null.
 * @returns Matrix in the frame of the line.
 */
function solidScriptPlaceCopyMatrix(
  run: SolidScriptBlockRun,
  point: THREE.Vector3,
  direction: THREE.Vector3 | null,
  fills: SolidScriptPlaceFills,
  forward: THREE.Vector3 | null,
): THREE.Matrix4 {
  const lift = solidScriptValueNumber(run.valueWith('lift', fills));
  if (lift === undefined) throw new Error('Lift needs a number of metres, such as 0');
  const align = run.valueWith('align', fills);
  if (align !== undefined && typeof align !== 'boolean') throw new Error('Align To Normal needs Yes or No');
  const rotate = solidScriptPlaceEachRotate(run, fills);
  const scale = solidScriptPlaceEachScale(run, fills);
  return solidScriptPlaceAtMatrix(point, direction, lift, align === true, rotate, scale, forward);
}

/**
 * Tells whether Build asks for one line per point; empty means every line.
 *
 * @param run Running line.
 * @returns True for One Line.
 */
function solidScriptPlaceOneWanted(run: SolidScriptBlockRun): boolean {
  const typed = run.text('build').trim() || 'Every Line';
  const found = SOLID_SCRIPT_PLACE_BUILD.find((word) => word.toLowerCase() === typed.toLowerCase());
  if (!found) throw new Error(`Build needs Every Line or One Line, not ${typed}`);
  return found === 'One Line';
}

/**
 * Reads the Choice of one point, rounded to a whole number.
 *
 * @param run Running line.
 * @param fills Per-point values.
 * @returns Choice, any whole number; it wraps over the lines inside.
 */
function solidScriptPlaceChoice(run: SolidScriptBlockRun, fills: SolidScriptPlaceFills): number {
  const choice = solidScriptValueNumber(run.valueWith('choice', fills));
  if (choice === undefined) throw new Error('Choice needs a whole number, such as 0 or [=RandomInt(0, 999, [$Index])]');
  return Math.round(choice);
}

/**
 * Per-point values of one copy: [$Point] with its Position and Normal, the
 * Normal being its direction or world up, and [$Index] and [$Count].
 *
 * @param point Point to stand on.
 * @param direction Up direction, or null for world up.
 * @param index Point number from 0.
 * @param count Number of points.
 * @returns Values by name.
 */
function solidScriptPlaceFills(
  point: THREE.Vector3,
  direction: THREE.Vector3 | null,
  index: number,
  count: number,
): SolidScriptPlaceFills {
  const normal = direction && direction.lengthSq() > 1e-18 ? direction.clone().normalize() : new THREE.Vector3(0, 1, 0);
  return {
    $Point: new SolidScriptPoint([point.x, point.y, point.z], [normal.x, normal.y, normal.z]),
    $Index: index,
    $Count: count,
  };
}

/**
 * Reads an optional field of directions, such as Directions or Forward: one
 * direction for every point, a list with one per point, or a direction worked
 * out per point, such as [=Vector(0, 1, [$X])], where [$Point.Normal] is still
 * world up.
 *
 * @param run Running line.
 * @param points Points of At.
 * @param key Field key.
 * @param label Field caption, for messages.
 * @returns The direction for the point at a position, or null when empty.
 */
function solidScriptPlaceDirections(
  run: SolidScriptBlockRun,
  points: readonly THREE.Vector3[],
  key: string,
  label: string,
): (index: number) => THREE.Vector3 | null {
  const source = run.source(key);
  if (source.trim() === '') return () => null;
  if (solidScriptEachUsed(source))
    return (index) =>
      solidScriptPlacePoint(
        solidScriptPlaceSingle(
          run.valueWith(key, solidScriptPlaceFills(points[index] ?? new THREE.Vector3(), null, index, points.length)),
        ),
        label,
      );
  const directions = solidScriptPlacePoints(run, key, label);
  const [first] = directions;
  if (first && directions.length === 1) return () => first;
  if (directions.length !== points.length)
    throw new Error(
      `${label} needs one direction, or one for each point in At, or leave it empty; At has ${points.length} and ${label} has ${directions.length}`,
    );
  return (index) => directions[index] ?? null;
}

/**
 * Unwraps a list that holds a single vector, the way a points field keeps one
 * vector.
 *
 * @param value Value.
 * @returns The vector, or the value as it was.
 */
function solidScriptPlaceSingle(value: SolidScriptValue): SolidScriptValue {
  return Array.isArray(value) && value.length === 1 && Array.isArray(value[0]) ? value[0] : value;
}

/** Radians per degree, as the Rotate block uses. */
const SOLID_SCRIPT_PLACE_DEGREES = Math.PI / 180;

/**
 * Rotation that stands a shape with its up (Y) along a direction the way Place
 * On Face does: X across, Y out, Z down the surface.
 *
 * @param direction Way up should point.
 * @returns Rotation.
 */
export function solidScriptPlaceAlignMatrix(direction: THREE.Vector3): THREE.Matrix4 {
  if (direction.lengthSq() < 1e-18) throw new Error('Align To Normal needs a direction that is not 0, 0, 0');
  const normal = direction.clone().normalize();
  const { across, up } = solidScriptGeometryFrame(normal);
  return new THREE.Matrix4().makeBasis(across, normal, up.clone().negate());
}

/**
 * Matrix that stands a shape at a point, with lift, optional align, and a
 * per-point rotation and scale.
 *
 * @param position Where the origin goes, in metres.
 * @param direction Where up (Y) should point, or null to keep world up.
 * @param lift Metres to move out along up after the turn.
 * @param align True to use the Place On Face frame; false uses the shortest
 *   turn.
 * @param rotate Per-point rotation, after the lift.
 * @param scale Per-point scale, after the rotation.
 * @param forward Where the front (Z) should point, square to up; null keeps the
 *   turn above.
 * @returns Matrix.
 */
export function solidScriptPlaceAtMatrix(
  position: THREE.Vector3,
  direction: THREE.Vector3 | null,
  lift: number,
  align: boolean,
  rotate: THREE.Matrix4,
  scale: THREE.Matrix4,
  forward: THREE.Vector3 | null = null,
): THREE.Matrix4 {
  const front = forward ? solidScriptForwardMatrix(direction ?? new THREE.Vector3(0, 1, 0), forward) : null;
  const oriented =
    front ??
    (!direction
      ? new THREE.Matrix4()
      : align
        ? solidScriptPlaceAlignMatrix(direction)
        : solidScriptAlignDirectionMatrix(direction));
  return new THREE.Matrix4()
    .makeTranslation(position.x, position.y, position.z)
    .multiply(oriented)
    .multiply(new THREE.Matrix4().makeTranslation(0, lift, 0))
    .multiply(rotate)
    .multiply(scale);
}

/**
 * Rotation of one Place At Points copy, from its 🔁 Rotation field.
 *
 * @param run Running line.
 * @param fills Per-point values.
 * @returns Rotation.
 */
function solidScriptPlaceEachRotate(run: SolidScriptBlockRun, fills: SolidScriptPlaceFills): THREE.Matrix4 {
  const [x, y, z] = solidScriptPlaceEachVector(run, 'rotation', fills, [0, 0, 0]);
  return new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler(
      x * SOLID_SCRIPT_PLACE_DEGREES,
      y * SOLID_SCRIPT_PLACE_DEGREES,
      z * SOLID_SCRIPT_PLACE_DEGREES,
      'ZYX',
    ),
  );
}

/**
 * Scale of one Place At Points copy, from its 🔁 Scale field.
 *
 * @param run Running line.
 * @param fills Per-point values.
 * @returns Scale.
 */
function solidScriptPlaceEachScale(run: SolidScriptBlockRun, fills: SolidScriptPlaceFills): THREE.Matrix4 {
  const [x, y, z] = solidScriptPlaceEachVector(run, 'scale', fills, [1, 1, 1]);
  return new THREE.Matrix4().makeScale(x, y, z);
}

/**
 * Reads a per-point vector field, with [$Point], [$Index] and [$Count] filled
 * in.
 *
 * @param run Running line.
 * @param key Field key.
 * @param fills Per-point values.
 * @param fallback Value when the field is empty.
 * @returns Three numbers.
 */
function solidScriptPlaceEachVector(
  run: SolidScriptBlockRun,
  key: string,
  fills: SolidScriptPlaceFills,
  fallback: readonly [number, number, number],
): [number, number, number] {
  const numbers = solidScriptValueNumbers(run.valueWith(key, fills));
  if (!numbers || numbers.length < 3)
    throw new Error(`${key === 'rotation' ? 'Rotation' : 'Scale'} needs three numbers, such as ${fallback.join(', ')}`);
  const x = numbers[0];
  const y = numbers[1];
  const z = numbers[2];
  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number')
    throw new Error(`${key === 'rotation' ? 'Rotation' : 'Scale'} needs three numbers, such as ${fallback.join(', ')}`);
  return [x, y, z];
}
