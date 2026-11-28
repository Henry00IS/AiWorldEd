import * as THREE from 'three';
import { SOLID_SCRIPT_GEOMETRY_EPSILON, type SolidScriptGeometryLeaf } from './solid_script_geometry.js';
import { solidScriptNameIsPositionWrite, solidScriptNameParts } from './solid_script_name_rules.js';
import { solidScriptSolidEdited } from './solid_script_solid_validate.js';
import { solidScriptValueNumber, type SolidScriptValue } from './solid_script_value.js';
import { solidScriptVectorThreeRequire } from './solid_script_vector.js';

/** Axis of a Vertex.Position.X write, or none for a whole position. */
export type SolidScriptPositionAxis = 'x' | 'y' | 'z';

/** One corner move, from the position before the line to the new one. */
export interface SolidScriptPositionMove {
  from: THREE.Vector3;
  to: THREE.Vector3;
}

/**
 * Splits a position write into its owner, the item number of Positions(2) and
 * the axis of a trailing .X, .Y or .Z.
 *
 * @param name Name as written, such as $Selected.Vertices.Positions(0).Y.
 * @returns Owner name, item number text or null, and axis or undefined.
 */
function solidScriptPositionParts(name: string): {
  owner: string;
  item: string | null;
  axis: SolidScriptPositionAxis | undefined;
} {
  const parts = solidScriptNameParts(name.trim());
  const last = parts[parts.length - 1]?.toLowerCase() ?? '';
  const axis = last === 'x' || last === 'y' || last === 'z' ? last : undefined;
  if (axis) parts.pop();
  const member = /^positions?\s*(?:\((.*)\))?$/is.exec(parts[parts.length - 1] ?? '');
  if (member) parts.pop();
  return { owner: parts.join('.'), item: member?.[1] ?? null, axis };
}

/**
 * Gives the name before .Position or .Positions, such as $Selected.Vertices or
 * Vertex, dropping a trailing .X, .Y or .Z.
 *
 * @param name Name as written.
 * @returns Owner name.
 */
export function solidScriptPositionOwner(name: string): string {
  return solidScriptPositionParts(name).owner;
}

/**
 * Gives the item number of a write to one corner of a list, such as 0 for
 * $Selected.Vertices.Positions(0), or null for every corner.
 *
 * @param name Name as written.
 * @returns Item number as written, or null.
 */
export function solidScriptPositionItem(name: string): string | null {
  return solidScriptPositionParts(name).item;
}

/**
 * Gives the axis a position write sets, or none when it sets the whole
 * position.
 *
 * @param name Name as written.
 * @returns Axis, or undefined.
 */
export function solidScriptPositionAxis(name: string): SolidScriptPositionAxis | undefined {
  if (!solidScriptNameIsPositionWrite(name)) return undefined;
  return solidScriptPositionParts(name).axis;
}

/**
 * Reads a new corner position: three numbers, or one number on an axis of the
 * position before the line.
 *
 * @param value Written value.
 * @param before Position before the line.
 * @param axis Axis, when only one number is written.
 * @returns New position.
 */
export function solidScriptPositionValue(
  value: SolidScriptValue,
  before: THREE.Vector3,
  axis: SolidScriptPositionAxis | undefined,
): THREE.Vector3 {
  if (axis) {
    const number = solidScriptValueNumber(value);
    if (number === undefined) throw new Error(`${axis.toUpperCase()} needs a number, not ${String(value)}`);
    const next = before.clone();
    next[axis] = number;
    return next;
  }
  return solidScriptVectorThreeRequire(value, 'Position needs a vector, such as 0, 1, 0');
}

/**
 * Applies every corner move of a line together; a brush may stay non-convex
 * until the output is checked.
 *
 * @param leaf Solid or mesh.
 * @param moves Moves from the positions before the line.
 * @returns Updated leaf.
 */
export function solidScriptPositionApply(
  leaf: SolidScriptGeometryLeaf,
  moves: readonly SolidScriptPositionMove[],
): SolidScriptGeometryLeaf {
  const points = leaf.points.map((point) => solidScriptPositionMoved(point, moves).clone());
  return leaf.kind === 'solid' ? solidScriptSolidEdited(leaf, points) : { ...leaf, points };
}

/**
 * Finds the new position of a corner, or leaves it when no move starts there.
 *
 * @param point Corner before the line.
 * @param moves Moves from the positions before the line.
 * @returns New position, or the same point.
 */
function solidScriptPositionMoved(point: THREE.Vector3, moves: readonly SolidScriptPositionMove[]): THREE.Vector3 {
  for (let index = moves.length - 1; index >= 0; index--) {
    const move = moves[index];
    if (move && move.from.distanceTo(point) <= SOLID_SCRIPT_GEOMETRY_EPSILON) return move.to;
  }
  return point;
}

/**
 * Groups corner moves by the solid or mesh they belong to, using each leaf as
 * it was before the line, so every read sees that geometry.
 *
 * @param targets Corners being set, with their leaves.
 * @param moves Moves in the same order.
 * @param latest Latest leaf of one leaf.
 * @returns Moves per leaf.
 */
export function solidScriptPositionByLeaf(
  targets: readonly { leaf: SolidScriptGeometryLeaf }[],
  moves: readonly SolidScriptPositionMove[],
  latest: (leaf: SolidScriptGeometryLeaf) => SolidScriptGeometryLeaf,
): { leaf: SolidScriptGeometryLeaf; moves: SolidScriptPositionMove[] }[] {
  const groups: { leaf: SolidScriptGeometryLeaf; moves: SolidScriptPositionMove[] }[] = [];
  for (let index = 0; index < targets.length; index++) {
    const target = targets[index];
    const move = moves[index];
    if (!target || !move) continue;
    const leaf = latest(target.leaf);
    const found = groups.find((group) => group.leaf === leaf);
    if (found) found.moves.push(move);
    else groups.push({ leaf, moves: [move] });
  }
  return groups;
}
