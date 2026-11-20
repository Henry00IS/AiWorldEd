import * as THREE from 'three';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptGeometryLeaves,
  type SolidScriptGeometryLeaf,
} from '@/solid_script/language/solid_script_geometry.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import type { SolidScriptFaceUv, SolidScriptReceived } from '@/solid_script/language/solid_script_shape.js';
import type { SolidScriptShapeMesh } from '@/solid_script/language/solid_script_mesh.js';
import { SOLID_SCRIPT_EXAMPLES, type SolidScriptExample } from '@/solid_script/examples/solid_script_examples.js';
import { solidScriptUseSolidOf } from '../language/solid_script_use_solid.js';

const CORNERS = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => [x, y, z] as const)));

/**
 * Rounds a number so JSON snapshots stay stable.
 *
 * @param value Number.
 * @returns Rounded value.
 */
export function solidScriptExampleShotRound(value: number): number {
  const rounded = Math.round(value * 1e5) / 1e5;
  return rounded === 0 ? 0 : rounded;
}

/**
 * Rounded components of a vector.
 *
 * @param vector Vector.
 * @returns Components.
 */
function numbers(vector: THREE.Vector2 | THREE.Vector3 | THREE.Vector4): number[] {
  return vector.toArray().map(solidScriptExampleShotRound);
}

/**
 * Axis-aligned bounds of points.
 *
 * @param points Points.
 * @returns Min and max.
 */
function bounds(points: readonly THREE.Vector3[]): { min: number[]; max: number[] } {
  const box = new THREE.Box3().setFromPoints([...points]);
  return { min: numbers(box.min), max: numbers(box.max) };
}

/**
 * Snapshot of one solid face UV mapping.
 *
 * @param entry Mapping.
 * @returns Snapshot.
 */
function faceUvShot(entry: SolidScriptFaceUv) {
  return { point: numbers(entry.point), normal: numbers(entry.normal), u: numbers(entry.uv.u), v: numbers(entry.uv.v) };
}

/**
 * Orders UV records by their rounded values so the same mappings compare equal
 * when only the face order changed.
 *
 * @param left Record.
 * @param right Record.
 * @returns Order.
 */
function faceUvOrder(left: ReturnType<typeof faceUvShot>, right: ReturnType<typeof faceUvShot>): number {
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}

/**
 * Snapshot of mesh corner UVs.
 *
 * @param uvs Face UVs.
 * @returns Snapshot.
 */
function meshUvs(uvs: SolidScriptShapeMesh['uvs']): unknown {
  return uvs.map((face) => face?.map((pair) => pair.map(solidScriptExampleShotRound)) ?? null);
}

/**
 * Snapshot of a received-brush record, including UV shift.
 *
 * @param received Record, if any.
 * @returns Snapshot, or null.
 */
function receivedShot(received: SolidScriptReceived | undefined) {
  if (!received) return null;
  return {
    index: received.index,
    textures: received.textures,
    readable: received.readable ?? null,
    shiftU: received.shiftU ?? 0,
    shiftV: received.shiftV ?? 0,
    matrix: received.matrix.toArray().map(solidScriptExampleShotRound),
  };
}

/**
 * Snapshot of one world leaf: solids, bounds and UVs.
 *
 * @param leaf Leaf.
 * @returns Snapshot.
 */
export function solidScriptExampleLeafShot(leaf: SolidScriptGeometryLeaf) {
  if (leaf.kind === 'solid') {
    return {
      kind: 'solid' as const,
      points: leaf.points.map(numbers),
      bounds: bounds(leaf.points),
      uvs: leaf.faceUvs?.map(faceUvShot).sort(faceUvOrder) ?? null,
      boxUvSize: leaf.boxUvSize ?? null,
      received: receivedShot(leaf.received),
    };
  }
  return {
    kind: 'mesh' as const,
    points: leaf.points.map(numbers),
    faces: leaf.faces,
    bounds: bounds(leaf.points),
    uvs: meshUvs(leaf.uvs),
  };
}

/**
 * Options that run an example as the Examples window does: a modifier-only
 * script receives a unit cube.
 *
 * @param example Example.
 * @returns Run options.
 */
export function solidScriptExampleRunOptions(example: SolidScriptExample) {
  return example.uses?.generator === false
    ? { use: { usage: 'Modifier' as const, solids: [solidScriptUseSolidOf(CORNERS)], faces: 6 } }
    : {};
}

/**
 * Snapshot of an example's world geometry after a run.
 *
 * @param example Example.
 * @returns Snapshot.
 */
export function solidScriptExampleShot(example: SolidScriptExample) {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(example.lines), solidScriptExampleRunOptions(example));
  if (result.error) throw new Error(`${example.id}: ${result.error.message}`);
  const leaves = solidScriptGeometryLeaves(result.shapes);
  return { id: example.id, leafCount: leaves.length, leaves: leaves.map(solidScriptExampleLeafShot) };
}

/**
 * How many lines of an example are not Notes.
 *
 * @param example Example.
 * @returns Count.
 */
export function solidScriptExampleWorkLines(example: SolidScriptExample): number {
  return example.lines.filter((line) => line.command !== 'note').length;
}

/**
 * Every official example, in picker order.
 *
 * @returns Examples.
 */
export function solidScriptExamplesAll(): readonly SolidScriptExample[] {
  return SOLID_SCRIPT_EXAMPLES;
}
