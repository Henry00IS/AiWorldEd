import type * as THREE from 'three';
import {
  solidScriptGeometryEdges,
  solidScriptGeometryFaces,
  solidScriptGeometryVertices,
} from './solid_script_geometry.js';
import type { SolidScriptShape } from './solid_script_shape.js';
import type { SolidScriptValue } from './solid_script_value.js';
import { solidScriptFunctionKey } from './solid_script_name_key.js';

/** Formula functions that read the shapes built so far, with what each needs. */
export const SOLID_SCRIPT_GEOMETRY_LOOKUPS: Readonly<Record<string, string>> = {
  face_count: 'FaceCount() is how many faces the shapes above have',
  face_center: 'FaceCenter(n) is the middle of face n',
  face_normal: 'FaceNormal(n) is the way face n points',
  face_width: 'FaceWidth(n) is how wide face n is',
  face_height: 'FaceHeight(n) is how tall face n is',
  face_area: 'FaceArea(n) is the area of face n',
  face_tag: 'FaceTag(n) is the last name of face n, such as Top or Step Tread',
  vertex_count: 'VertexCount() is how many corner points the shapes above have',
  vertex_position: 'VertexPosition(n) is where corner n is',
  vertex_normal: 'VertexNormal(n) is the way the faces around corner n point',
  edge_count: 'EdgeCount() is how many edges the shapes above have',
  edge_start: 'EdgeStart(n) is where edge n starts',
  edge_end: 'EdgeEnd(n) is where edge n ends',
  edge_middle: 'EdgeMiddle(n) is the middle of edge n',
  edge_length: 'EdgeLength(n) is how long edge n is',
};

/**
 * Rounds a number so small errors do not show.
 *
 * @param value Number.
 * @returns Rounded number.
 */
function solidScriptLookupRound(value: number): number {
  return Math.round(value * 1e9) / 1e9;
}

/**
 * Writes a vector as a list value.
 *
 * @param vector Vector.
 * @returns List.
 */
function solidScriptLookupVector(vector: THREE.Vector3): SolidScriptValue {
  return vector.toArray().map(solidScriptLookupRound);
}

/** Lookup names by key, made on first use, so FaceCount finds face_count. */
let solidScriptGeometryLookupKeys: Map<string, string> | null = null;

/**
 * Works out a geometry formula function, such as face_center(2), over the
 * shapes built so far. Case and underscores do not count.
 *
 * @param written Function name as written.
 * @param values Values passed.
 * @param shapes Shapes built so far.
 * @returns Value, or undefined when the name is not a geometry function.
 */
export function solidScriptGeometryLookup(
  written: string,
  values: readonly SolidScriptValue[],
  shapes: () => readonly SolidScriptShape[],
): SolidScriptValue | undefined {
  solidScriptGeometryLookupKeys ??= new Map(
    Object.keys(SOLID_SCRIPT_GEOMETRY_LOOKUPS).map((stored) => [solidScriptFunctionKey(stored), stored]),
  );
  const stored = solidScriptGeometryLookupKeys.get(solidScriptFunctionKey(written));
  if (stored === undefined) return undefined;
  const name = stored;
  const usage = SOLID_SCRIPT_GEOMETRY_LOOKUPS[name]!;
  const [family, what] = name.split('_') as [string, string];
  const list =
    family === 'face'
      ? solidScriptGeometryFaces(shapes())
      : family === 'vertex'
        ? solidScriptGeometryVertices(shapes())
        : solidScriptGeometryEdges(shapes());
  if (what === 'count') {
    if (values.length !== 0) throw new Error(`${usage}; write it with nothing in the brackets`);
    return list.length;
  }
  const index = values[0];
  if (values.length !== 1 || typeof index !== 'number' || !Number.isInteger(index))
    throw new Error(`${usage}; give it one whole number`);
  const item = list[index];
  if (!item) throw new Error(`there is no ${family} ${index}; the shapes above have ${list.length}, numbered from 0`);
  const field = (item as unknown as Record<string, unknown>)[what === 'tag' ? 'tags' : what];
  if (what === 'tag') return (field as string[]).at(-1) ?? '';
  return typeof field === 'number' ? solidScriptLookupRound(field) : solidScriptLookupVector(field as THREE.Vector3);
}
