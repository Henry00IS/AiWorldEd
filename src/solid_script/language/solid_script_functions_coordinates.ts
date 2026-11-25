import * as THREE from 'three';
import { solidScriptExtraNumber, solidScriptExtraVector } from './solid_script_functions_extra.js';
import { solidScriptPathSample } from './solid_script_path_model.js';
import {
  SolidScriptPathElement,
  solidScriptValueNumbers,
  solidScriptValueText,
  type SolidScriptValue,
} from './solid_script_value.js';

/** A built-in function over evaluated arguments. */
type SolidScriptCoordinatesBuiltin = (args: SolidScriptValue[]) => SolidScriptValue;

/**
 * Reads an argument as a vector of three numbers.
 *
 * @param args Arguments.
 * @param usage How to call the function, for the message.
 * @returns X, Y and Z.
 */
function solidScriptCoordinatesVector(args: readonly SolidScriptValue[], usage: string): [number, number, number] {
  const numbers = solidScriptExtraVector(args, 0, usage);
  const [x, y, z] = numbers;
  if (numbers.length !== 3 || x === undefined || y === undefined || z === undefined)
    throw new Error(`${usage} needs a vector of three numbers`);
  return [x, y, z];
}

/**
 * Turns a vector around so it points the same way as a reference, keeping it
 * when it already does.
 *
 * @param args Vector and reference.
 * @returns The vector, or it reversed.
 */
function solidScriptCoordinatesFlipToward(args: readonly SolidScriptValue[]): number[] {
  const usage = 'FlipToward(vector, reference)';
  const vector = solidScriptExtraVector(args, 0, usage);
  const reference = solidScriptExtraVector(args, 1, usage);
  if (vector.length !== reference.length) throw new Error(`${usage} needs two vectors of the same size`);
  const facing = vector.reduce((total, value, axis) => total + value * (reference[axis] ?? 0), 0);
  return facing < 0 ? vector.map((value) => -value) : vector;
}

/**
 * Builds a point from cylinder coordinates around the Y axis: 0 degrees points
 * along X and 90 along Z.
 *
 * @param args Radius, degrees and height.
 * @returns Point.
 */
function solidScriptCoordinatesFromCylinder(args: readonly SolidScriptValue[]): number[] {
  const usage = 'FromCylinder(radius, degrees, height)';
  const radius = solidScriptExtraNumber(args, 0, usage);
  const radians = THREE.MathUtils.degToRad(solidScriptExtraNumber(args, 1, usage));
  return [radius * Math.cos(radians), solidScriptExtraNumber(args, 2, usage), radius * Math.sin(radians)];
}

/**
 * Builds a point from sphere coordinates: yaw turns around the Y axis from X
 * toward Z, pitch lifts from flat toward Y.
 *
 * @param args Radius, yaw and pitch in degrees.
 * @returns Point.
 */
function solidScriptCoordinatesFromSphere(args: readonly SolidScriptValue[]): number[] {
  const usage = 'FromSphere(radius, yaw, pitch)';
  const radius = solidScriptExtraNumber(args, 0, usage);
  const yaw = THREE.MathUtils.degToRad(solidScriptExtraNumber(args, 1, usage));
  const pitch = THREE.MathUtils.degToRad(solidScriptExtraNumber(args, 2, usage));
  const flat = radius * Math.cos(pitch);
  return [flat * Math.cos(yaw), radius * Math.sin(pitch), flat * Math.sin(yaw)];
}

/**
 * Reads a point as cylinder coordinates around the Y axis.
 *
 * @param args The point.
 * @returns Radius, degrees and height.
 */
function solidScriptCoordinatesToCylinder(args: readonly SolidScriptValue[]): number[] {
  const [x, y, z] = solidScriptCoordinatesVector(args, 'ToCylinder(vector)');
  return [Math.hypot(x, z), THREE.MathUtils.radToDeg(Math.atan2(z, x)), y];
}

/**
 * Reads a point as sphere coordinates.
 *
 * @param args The point.
 * @returns Radius, yaw and pitch in degrees.
 */
function solidScriptCoordinatesToSphere(args: readonly SolidScriptValue[]): number[] {
  const [x, y, z] = solidScriptCoordinatesVector(args, 'ToSphere(vector)');
  const radius = Math.hypot(x, y, z);
  const pitch = radius === 0 ? 0 : Math.asin(y / radius);
  return [radius, THREE.MathUtils.radToDeg(Math.atan2(z, x)), THREE.MathUtils.radToDeg(pitch)];
}

/**
 * Reads the width and depth of a ring: a number is the width of a circle, a
 * vector of three numbers gives its X and Z, such as a box size, and one of two
 * numbers gives width and depth.
 *
 * @param args Arguments.
 * @param usage How to call the function, for the message.
 * @returns Width and depth.
 */
function solidScriptCoordinatesRingSize(args: readonly SolidScriptValue[], usage: string): [number, number] {
  if (!Array.isArray(args[1])) {
    const width = solidScriptExtraNumber(args, 1, usage);
    return [width, width];
  }
  const size = solidScriptExtraVector(args, 1, usage);
  if (size.length === 2) return [size[0]!, size[1]!];
  if (size.length === 3) return [size[0]!, size[2]!];
  throw new Error(`${usage} needs a size of one, two or three numbers`);
}

/**
 * Builds a point on a flat oval around the up (Y) axis that fits a size: 0
 * degrees points along X and the angle turns counter-clockwise seen from above,
 * the way Rotate By turns around Y, so 90 points to the back.
 *
 * @param args Degrees, size and an optional height.
 * @returns Point.
 */
function solidScriptCoordinatesRingPoint(args: readonly SolidScriptValue[]): number[] {
  const usage = 'RingPoint(degrees, size, height)';
  const radians = THREE.MathUtils.degToRad(solidScriptExtraNumber(args, 0, usage));
  const [width, depth] = solidScriptCoordinatesRingSize(args, usage);
  const height = args.length > 2 ? solidScriptExtraNumber(args, 2, usage) : 0;
  return [Math.cos(radians) * (width / 2), height, -(Math.sin(radians) * (depth / 2))];
}

/**
 * Turns from one vector toward another at an even rate of angle, blending their
 * lengths along the way, so points on a sphere stay on it.
 *
 * @param args From, to and amount.
 * @returns Vector.
 */
function solidScriptCoordinatesSlerp(args: readonly SolidScriptValue[]): number[] {
  const usage = 'Slerp(from, to, amount)';
  const from = new THREE.Vector3(...solidScriptCoordinatesSlerpVector(args, 0, usage));
  const to = new THREE.Vector3(...solidScriptCoordinatesSlerpVector(args, 1, usage));
  const size = solidScriptExtraVector(args, 0, usage).length;
  if (size !== solidScriptExtraVector(args, 1, usage).length)
    throw new Error(`${usage} needs two vectors of the same size`);
  const amount = solidScriptExtraNumber(args, 2, usage);
  const length = from.length() + (to.length() - from.length()) * amount;
  const turned = solidScriptCoordinatesTurned(from.clone().normalize(), to.clone().normalize(), amount);
  return turned.multiplyScalar(length).toArray().slice(0, size);
}

/**
 * Reads a Slerp vector of two or three numbers with a length.
 *
 * @param args Arguments.
 * @param index Argument position.
 * @param usage How to call the function, for the message.
 * @returns X, Y and Z, with Z 0 for a flat vector.
 */
function solidScriptCoordinatesSlerpVector(
  args: readonly SolidScriptValue[],
  index: number,
  usage: string,
): [number, number, number] {
  const numbers = solidScriptExtraVector(args, index, usage);
  if (numbers.length !== 2 && numbers.length !== 3) throw new Error(`${usage} needs vectors of two or three numbers`);
  if (Math.hypot(...numbers) === 0) throw new Error(`${usage} needs vectors with a length, not ${numbers.join(', ')}`);
  return [numbers[0]!, numbers[1]!, numbers[2] ?? 0];
}

/** Angle in radians below which two directions count as the same or opposite. */
const SOLID_SCRIPT_SLERP_PARALLEL = 1e-9;

/**
 * Turns one unit direction toward another by a share of the angle between them;
 * opposite directions turn through a direction square to the first.
 *
 * @param from Unit start direction.
 * @param to Unit end direction.
 * @param amount Share of the turn.
 * @returns Unit direction.
 */
function solidScriptCoordinatesTurned(from: THREE.Vector3, to: THREE.Vector3, amount: number): THREE.Vector3 {
  const angle = Math.acos(THREE.MathUtils.clamp(from.dot(to), -1, 1));
  if (angle < SOLID_SCRIPT_SLERP_PARALLEL) return from.clone().lerp(to, amount).normalize();
  const across = Math.PI - angle < SOLID_SCRIPT_SLERP_PARALLEL ? solidScriptCoordinatesSquare(from) : null;
  if (across) {
    const turn = Math.PI * amount;
    return from.clone().multiplyScalar(Math.cos(turn)).addScaledVector(across, Math.sin(turn));
  }
  const share = Math.sin(angle);
  return from
    .clone()
    .multiplyScalar(Math.sin((1 - amount) * angle) / share)
    .addScaledVector(to, Math.sin(amount * angle) / share);
}

/**
 * A unit direction square to another, kept flat when the direction is flat.
 *
 * @param direction Unit direction.
 * @returns Square direction.
 */
function solidScriptCoordinatesSquare(direction: THREE.Vector3): THREE.Vector3 {
  if (direction.z === 0) return new THREE.Vector3(-direction.y, direction.x, 0);
  const helper = Math.abs(direction.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3().crossVectors(direction, helper).normalize();
}

/**
 * Coordinate helpers: flipping a vector toward a reference, cylinder and sphere
 * coordinates, ring points and turning between directions.
 */
/** Axis components a vector can read from, as [index, sign]. */
const SOLID_SCRIPT_COORDINATES_AXES: Readonly<Record<string, readonly [number, number]>> = {
  X: [0, 1],
  Y: [1, 1],
  Z: [2, 1],
  '-X': [0, -1],
  '-Y': [1, -1],
  '-Z': [2, -1],
};

/**
 * Reads one axis choice, such as X or -Y, as a component picker.
 *
 * @param value Argument value.
 * @param usage How to call the function, for the message.
 * @returns Picker returning one remapped coordinate.
 */
function solidScriptCoordinatesAxis(value: SolidScriptValue, usage: string): (vector: readonly number[]) => number {
  const key = typeof value === 'string' ? value.trim().toUpperCase() : '';
  const axis = SOLID_SCRIPT_COORDINATES_AXES[key];
  if (!axis) throw new Error(`${usage} needs X, Y, Z, -X, -Y or -Z, not ${solidScriptValueText(value)}`);
  const [index, sign] = axis;
  return (vector) => sign * (vector[index] ?? 0) + 0;
}

/**
 * Reads a value as a 2D or 3D vector padded with 0 for Z, or throws.
 *
 * @param value Vector value.
 * @param usage How to call the function, for the message.
 * @returns Three numbers.
 */
function solidScriptCoordinatesPadVector(value: SolidScriptValue, usage: string): [number, number, number] {
  const numbers = solidScriptValueNumbers(value);
  if (!numbers || (numbers.length !== 2 && numbers.length !== 3))
    throw new Error(`${usage} needs vectors of 2 or 3 numbers, not ${solidScriptValueText(value)}`);
  return [numbers[0] ?? 0, numbers[1] ?? 0, numbers[2] ?? 0];
}

/**
 * Remaps the components of a list of vectors, a Path, or one vector, allowing
 * duplicates and negated axes, such as RemapAxes([Pts], "X", "Z", "Y").
 *
 * @param args Vectors or vector, and three axis choices.
 * @returns Remapped vectors or single vector.
 */
function solidScriptCoordinatesRemapAxes(args: readonly SolidScriptValue[]): SolidScriptValue {
  const usage = 'RemapAxes(vectors, x, y, z)';
  const rx = solidScriptCoordinatesAxis(args[1] ?? 'X', usage);
  const ry = solidScriptCoordinatesAxis(args[2] ?? 'Y', usage);
  const rz = solidScriptCoordinatesAxis(args[3] ?? 'Z', usage);
  const remap = (vector: readonly [number, number, number]): number[] => [rx(vector), ry(vector), rz(vector)];
  const source = args[0];
  if (source instanceof SolidScriptPathElement) {
    return solidScriptPathSample(source.path).map((point) => remap([point[0] ?? 0, point[1] ?? 0, point[2] ?? 0]));
  }
  if (!Array.isArray(source)) {
    throw new Error(`${usage} needs a list of vectors, a Path or a vector, not ${solidScriptValueText(source)}`);
  }
  if (source.length === 0) return [];
  if (source.every((entry) => typeof entry === 'number')) {
    return remap(solidScriptCoordinatesPadVector(source, usage));
  }
  return source.map((entry) => remap(solidScriptCoordinatesPadVector(entry, usage)));
}

export const SOLID_SCRIPT_FUNCTIONS_COORDINATES = {
  flip_toward: solidScriptCoordinatesFlipToward,
  from_cylinder: solidScriptCoordinatesFromCylinder,
  from_sphere: solidScriptCoordinatesFromSphere,
  remap_axes: solidScriptCoordinatesRemapAxes,
  ring_point: solidScriptCoordinatesRingPoint,
  slerp: solidScriptCoordinatesSlerp,
  to_cylinder: solidScriptCoordinatesToCylinder,
  to_sphere: solidScriptCoordinatesToSphere,
} satisfies Readonly<Record<string, SolidScriptCoordinatesBuiltin>>;
