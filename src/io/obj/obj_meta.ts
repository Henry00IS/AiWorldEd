import * as THREE from 'three';
import { APPLICATION_VERSION } from '@/application_identity.js';
import { axisToVector, buildModelFileTransform } from '@/io/coordinates/coordinate_space_transform.js';
import type { AxisDirection } from '@/settings/coordinate/coordinate_space_types.js';
import type { ExportSpace } from '@/io/coordinates/export_space.js';

/** Start of the objmeta comment line. */
const OBJ_META_KEYWORD = '# objmeta ';

/**
 * Longest objmeta line read, in bytes without the line ending; longer lines are
 * ignored unparsed.
 */
export const OBJ_META_LINE_LIMIT = 4096;

/** Axes and unit an OBJ file's data is written in, as its objmeta comment says. */
export interface ObjMeta {
  /** File axis pointing up. */
  up: AxisDirection;
  /** File axis the model's front faces. */
  forward: AxisDirection;
  /** File axis of the model's own right-hand side. */
  right: AxisDirection;
  /** Meters per file unit. */
  unit: number;
}

/**
 * Builds the objmeta comment of an OBJ or MTL file written in an export space:
 * the file axes of the model's up, front and own right, meters per unit, and
 * the writer.
 *
 * @param space Export space, or null for the editor's own space.
 * @returns Comment line, such as # objmeta {"v":1,"up":"+y",…}.
 */
export function objMetaLine(space: ExportSpace | null): string {
  const transform = buildModelFileTransform(space);
  const unitsPerMeter = new THREE.Vector3().setFromMatrixColumn(transform, 0).length();
  const axis = (editor: THREE.Vector3) => objMetaAxisName(editor.applyMatrix4(transform).divideScalar(unitsPerMeter));
  const json = {
    v: 1,
    up: axis(new THREE.Vector3(0, 1, 0)),
    forward: axis(new THREE.Vector3(0, 0, 1)),
    right: axis(new THREE.Vector3(-1, 0, 0)),
    unit: objMetaUnit(1 / unitsPerMeter),
    generator: `AiWorldEd ${APPLICATION_VERSION}`,
  };
  return `${OBJ_META_KEYWORD}${JSON.stringify(json)}`;
}

/**
 * Reads the objmeta comment of an OBJ file: the first valid objmeta line in the
 * header, the comment and blank lines before the first statement. Invalid lines
 * are skipped; unknown keys are allowed.
 *
 * @param text OBJ file contents.
 * @returns Axes and unit, or null without a valid comment.
 */
export function objMetaRead(text: string): ObjMeta | null {
  let start = text.startsWith('\uFEFF') ? 1 : 0;
  while (start <= text.length) {
    const end = text.indexOf('\n', start);
    const stop = end < 0 ? text.length : end;
    let first = start;
    while (text[first] === ' ' || text[first] === '\t') first += 1;
    if (first < stop && text[first] !== '#' && !(first === stop - 1 && text[first] === '\r')) return null;
    if (text.startsWith(OBJ_META_KEYWORD, start)) {
      const meta = objMetaParse(text.slice(start, text[stop - 1] === '\r' ? stop - 1 : stop));
      if (meta !== null) return meta;
    }
    if (end < 0) break;
    start = end + 1;
  }
  return null;
}

/**
 * Builds the transform from editor space into the file space an objmeta comment
 * describes (the inverse reads the file).
 *
 * @param meta Axes and unit.
 * @returns Rotation and scale, mirrored (negative determinant) for left-handed
 *   axes.
 */
export function objMetaTransform(meta: ObjMeta): THREE.Matrix4 {
  const scale = 1 / meta.unit;
  const left = axisToVector(meta.right).negate().multiplyScalar(scale);
  const up = axisToVector(meta.up).multiplyScalar(scale);
  const forward = axisToVector(meta.forward).multiplyScalar(scale);
  return new THREE.Matrix4().makeBasis(left, up, forward);
}

/**
 * Parses and checks one objmeta line.
 *
 * @param line Line starting with the keyword, without its line ending.
 * @returns Axes and unit, or null.
 */
function objMetaParse(line: string): ObjMeta | null {
  // A line has at least as many UTF-8 bytes as UTF-16 code units, so a long one is rejected unencoded.
  if (line.length > OBJ_META_LINE_LIMIT || new TextEncoder().encode(line).length > OBJ_META_LINE_LIMIT) return null;
  let value: unknown;
  try {
    value = JSON.parse(line.slice(OBJ_META_KEYWORD.length));
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record['v'] !== 1) return null;
  const up = objMetaAxis(record['up']);
  const forward = objMetaAxis(record['forward']);
  const right = objMetaAxis(record['right']);
  const unit = record['unit'];
  if (up === null || forward === null || right === null) return null;
  if (typeof unit !== 'number' || !Number.isFinite(unit) || unit <= 0) return null;
  return new Set([up[1], forward[1], right[1]]).size === 3 ? { up, forward, right, unit } : null;
}

/**
 * Reads one signed lowercase axis such as "+y".
 *
 * @param value JSON value.
 * @returns Axis, or null.
 */
function objMetaAxis(value: unknown): AxisDirection | null {
  return typeof value === 'string' && /^[+-][xyz]$/.test(value) ? (value as AxisDirection) : null;
}

/**
 * Names a unit file axis.
 *
 * @param vector Unit vector along a file axis.
 * @returns Name such as "+y".
 */
function objMetaAxisName(vector: THREE.Vector3): string {
  const components = [vector.x, vector.y, vector.z];
  const index = components.reduce((best, value, at) => (Math.abs(value) > Math.abs(components[best]!) ? at : best), 0);
  return `${components[index]! < 0 ? '-' : '+'}${'xyz'[index]}`;
}

/**
 * Rounds a unit to 12 significant digits, so 1/100 is written as 0.01.
 *
 * @param unit Meters per file unit.
 * @returns Rounded value.
 */
function objMetaUnit(unit: number): number {
  return Number(unit.toPrecision(12));
}
