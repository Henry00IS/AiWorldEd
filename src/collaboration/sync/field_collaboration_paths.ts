import type { NodeCollaborationState } from '@/collaboration/scene/node_collaboration_types.js';

/**
 * Deepest path a field-level operation names. Values below it (and every array)
 * are replaced as a whole.
 */
export const FIELD_COLLABORATION_DEPTH = 4;

/** Most field paths one operation carries; larger changes replace the node. */
export const FIELD_COLLABORATION_PATHS_MAXIMUM = 64;

/** Longest accepted field path. */
export const FIELD_COLLABORATION_PATH_LENGTH = 128;

/** Paths of a state that identify the node and never change. */
const FIELD_COLLABORATION_FIXED = new Set(['id', 'kind']);

/**
 * Returns the field paths that differ between two node states, for example
 * `parent`, `data.entry.name` or `data.brush.planes`. Objects are descended up
 * to {@link FIELD_COLLABORATION_DEPTH}; arrays and deeper values are leaves.
 *
 * @param before Previous state.
 * @param after New state.
 * @returns Changed paths, or null when there are too many to name.
 */
export function fieldCollaborationDiff(before: NodeCollaborationState, after: NodeCollaborationState): string[] | null {
  const paths: string[] = [];
  fieldCollaborationWalk(before, after, '', 1, paths);
  const named = paths.filter((path) => !FIELD_COLLABORATION_FIXED.has(path));
  return named.length > FIELD_COLLABORATION_PATHS_MAXIMUM ? null : named;
}

/**
 * Collects differing paths below one level.
 *
 * @param left Previous value.
 * @param right New value.
 * @param prefix Path so far.
 * @param depth Current depth.
 * @param paths Receives paths.
 */
function fieldCollaborationWalk(left: unknown, right: unknown, prefix: string, depth: number, paths: string[]): void {
  const keys = new Set([...Object.keys(left as object), ...Object.keys(right as object)]);
  for (const key of keys) {
    const a = (left as Record<string, unknown>)[key];
    const b = (right as Record<string, unknown>)[key];
    const path = prefix === '' ? key : `${prefix}.${key}`;
    if (depth < FIELD_COLLABORATION_DEPTH && fieldCollaborationRecord(a) && fieldCollaborationRecord(b)) {
      fieldCollaborationWalk(a, b, path, depth + 1, paths);
    } else if (!fieldCollaborationEqual(a, b)) {
      paths.push(path);
    }
    if (paths.length > FIELD_COLLABORATION_PATHS_MAXIMUM + FIELD_COLLABORATION_FIXED.size) return;
  }
}

/**
 * Returns whether a value is a plain object (not an array).
 *
 * @param value Candidate.
 * @returns True for objects.
 */
function fieldCollaborationRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Compares two JSON values.
 *
 * @param a First value.
 * @param b Second value.
 * @returns True when they serialize the same.
 */
function fieldCollaborationEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Parses the field list of a relayed operation.
 *
 * @param value Untrusted `d.f`.
 * @returns Paths, or null when absent or malformed (the whole state applies).
 */
export function fieldCollaborationParse(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > FIELD_COLLABORATION_PATHS_MAXIMUM) return null;
  const paths: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || item === '' || item.length > FIELD_COLLABORATION_PATH_LENGTH) return null;
    const parts = item.split('.');
    if (parts.length > FIELD_COLLABORATION_DEPTH || FIELD_COLLABORATION_FIXED.has(item)) return null;
    if (parts.some((part) => part === '' || part === '__proto__' || part === 'constructor' || part === 'prototype'))
      return null;
    paths.push(item);
  }
  return paths;
}

/**
 * Builds a state from a base with some fields taken from another state: the
 * field-level merge used for last-writer-wins on concurrent edits.
 *
 * @param base State the fields are written into.
 * @param source State the fields are read from.
 * @param paths Field paths.
 * @returns Merged copy; the inputs are not changed.
 */
export function fieldCollaborationMerge(
  base: NodeCollaborationState,
  source: NodeCollaborationState,
  paths: readonly string[],
): NodeCollaborationState {
  // Copy-on-write along the written paths only: untouched branches stay shared
  // with the base (states are replaced, never mutated in place), which keeps a
  // merge of a heavy mesh cheap in time and memory.
  const merged = { ...(base as unknown as Record<string, unknown>) };
  const copied = new Set<object>([merged]);
  for (const path of paths) {
    const parts = path.split('.');
    const value = fieldCollaborationGet(source, parts);
    fieldCollaborationSet(merged, parts, value === undefined ? undefined : fieldCollaborationCopy(value), copied);
  }
  return merged as unknown as NodeCollaborationState;
}

/**
 * Deep-copies a wire value (plain JSON data: objects, arrays, numbers, strings,
 * booleans and null), independent of the realm it was created in.
 *
 * @param value Value.
 * @returns Copy.
 */
function fieldCollaborationCopy(value: unknown): unknown {
  if (ArrayBuffer.isView(value)) return value;
  if (Array.isArray(value)) return value.map(fieldCollaborationCopy);
  if (fieldCollaborationRecord(value)) {
    const copy: Record<string, unknown> = {};
    for (const key of Object.keys(value)) copy[key] = fieldCollaborationCopy(value[key]);
    return copy;
  }
  return value;
}

/**
 * Reads a path.
 *
 * @param root Object.
 * @param parts Path segments.
 * @returns Value, or undefined.
 */
export function fieldCollaborationGet(root: unknown, parts: readonly string[]): unknown {
  let current: unknown = root;
  for (const part of parts) {
    if (!fieldCollaborationRecord(current) || !Object.hasOwn(current, part)) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Writes a path, creating missing objects and deleting the leaf for undefined.
 *
 * @param root Object.
 * @param parts Path segments.
 * @param value New value.
 */
function fieldCollaborationSet(
  root: Record<string, unknown>,
  parts: readonly string[],
  value: unknown,
  copied: Set<object>,
): void {
  let current = root;
  for (let index = 0; index < parts.length - 1; index++) {
    const part = parts[index] ?? '';
    const next = current[part];
    if (!fieldCollaborationRecord(next)) {
      if (value === undefined) return;
      const created = {};
      copied.add(created);
      current[part] = created;
    } else if (!copied.has(next)) {
      const copy = { ...next };
      copied.add(copy);
      current[part] = copy;
    }
    current = current[part] as Record<string, unknown>;
  }
  const leaf = parts[parts.length - 1] ?? '';
  if (value === undefined) delete current[leaf];
  else current[leaf] = value;
}
