import * as THREE from 'three';
import { solidScriptPathDirection, solidScriptPathResample } from './solid_script_path.js';

/** How Array lays out its copies. */
export const SOLID_SCRIPT_ARRAY_SHAPES = ['Line', 'Circle', 'Along Path'] as const;

/** One of the Array shapes. */
export type SolidScriptArrayShape = (typeof SOLID_SCRIPT_ARRAY_SHAPES)[number];

/** Most objects one Array line makes. */
export const SOLID_SCRIPT_ARRAY_COUNT_MAX = 1000;

/** What Array reads to lay out its copies, in the line's own space. */
export interface SolidScriptArrayLayout {
  /** How many objects there are in the end, the original first. */
  count: number;
  /** Line, Circle or Along Path. */
  shape: SolidScriptArrayShape;
  /** Step from one copy to the next on a Line. */
  offset: THREE.Vector3;
  /** Axis a Circle turns around. */
  axis: THREE.Vector3;
  /** Point a Circle turns around. */
  center: THREE.Vector3;
  /** Degrees a Circle spreads over; a whole turn leaves no copy on the first. */
  angle: number;
  /** Points of the Path, for Along Path. */
  path: number[][];
  /** Whether the Path joins its end back to its start. */
  closed: boolean;
  /** Whether copies along a Path turn with it. */
  align: boolean;
}

/**
 * Moves of each copy on a Line: one Offset more each time.
 *
 * @param layout Layout.
 * @returns Matrix of copies 1 and on.
 */
function solidScriptArrayLine(layout: SolidScriptArrayLayout): THREE.Matrix4[] {
  return Array.from({ length: layout.count - 1 }, (_, index) =>
    new THREE.Matrix4().makeTranslation(layout.offset.clone().multiplyScalar(index + 1)),
  );
}

/**
 * Turns of each copy around a Circle, evenly over Angle.
 *
 * @param layout Layout.
 * @returns Matrix of copies 1 and on.
 */
function solidScriptArrayCircle(layout: SolidScriptArrayLayout): THREE.Matrix4[] {
  if (layout.axis.lengthSq() < 1e-18) throw new Error('Array Axis must not be 0, 0, 0');
  const axis = layout.axis.clone().normalize();
  const whole = Math.abs(layout.angle) >= 360 - 1e-9;
  const steps = whole ? layout.count : Math.max(1, layout.count - 1);
  const step = THREE.MathUtils.degToRad(layout.angle / steps);
  const to = new THREE.Matrix4().makeTranslation(layout.center);
  const from = new THREE.Matrix4().makeTranslation(layout.center.clone().negate());
  return Array.from({ length: layout.count - 1 }, (_, index) =>
    to
      .clone()
      .multiply(new THREE.Matrix4().makeRotationAxis(axis, step * (index + 1)))
      .multiply(from),
  );
}

/**
 * Moves of each copy along a Path, evenly by length from its start, and turned
 * with the Path when Align is on.
 *
 * @param layout Layout.
 * @returns Matrix of copies 1 and on.
 */
function solidScriptArrayPath(layout: SolidScriptArrayLayout): THREE.Matrix4[] {
  const path = layout.closed && layout.path[0] ? [...layout.path, layout.path[0]] : layout.path;
  const usage = 'Array Along Path';
  if (path.length < 2) throw new Error(`${usage} needs a Path of at least 2 points`);
  const spots = layout.closed ? layout.count + 1 : layout.count;
  const points = solidScriptPathResample(path, spots).map(([x = 0, y = 0, z = 0]) => new THREE.Vector3(x, y, z));
  const start = points[0] ?? new THREE.Vector3();
  const way = (index: number): THREE.Vector3 =>
    new THREE.Vector3(...solidScriptPathDirection(path, spots > 1 ? index / (spots - 1) : 0, usage));
  return points.slice(1, layout.count).map((point, index) => {
    const turn = layout.align
      ? new THREE.Matrix4().makeRotationFromQuaternion(
          new THREE.Quaternion().setFromUnitVectors(way(0), way(index + 1)),
        )
      : new THREE.Matrix4();
    return new THREE.Matrix4()
      .makeTranslation(point)
      .multiply(turn)
      .multiply(new THREE.Matrix4().makeTranslation(start.clone().negate()));
  });
}

/**
 * Where each copy of an Array goes, relative to the original, in the line's own
 * space.
 *
 * @param layout Layout.
 * @returns Matrix of each copy after the original.
 */
export function solidScriptArrayMatrices(layout: SolidScriptArrayLayout): THREE.Matrix4[] {
  if (layout.count <= 1) return [];
  if (layout.shape === 'Circle') return solidScriptArrayCircle(layout);
  if (layout.shape === 'Along Path') return solidScriptArrayPath(layout);
  return solidScriptArrayLine(layout);
}
