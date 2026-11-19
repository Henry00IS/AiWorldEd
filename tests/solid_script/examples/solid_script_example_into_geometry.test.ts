import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptGeometryLeaves,
  type SolidScriptGeometryLeaf,
} from '@/solid_script/language/solid_script_geometry.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import type { SolidScriptFaceUv, SolidScriptReceived } from '@/solid_script/language/solid_script_shape.js';
import type { SolidScriptShapeMesh } from '@/solid_script/language/solid_script_mesh.js';
import { SOLID_SCRIPT_EXAMPLES } from '@/solid_script/examples/solid_script_examples.js';

const IDS = ['spikyBall', 'shear', 'linear', 'radial', 'transform', 'mirror'] as const;
const CORNERS = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => [x, y, z] as const)));
const GOLDEN_PATH = 'tests/solid_script/examples/solid_script_example_into_geometry.json';

/**
 * Rounds a number so JSON snapshots stay stable.
 *
 * @param value Number.
 * @returns Rounded value.
 */
function round(value: number): number {
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
  return vector.toArray().map(round);
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
 * Snapshot of mesh corner UVs.
 *
 * @param uvs Face UVs.
 * @returns Snapshot.
 */
function meshUvs(uvs: SolidScriptShapeMesh['uvs']): unknown {
  return uvs.map((face) => face?.map((pair) => pair.map(round)) ?? null);
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
    matrix: received.matrix.toArray().map(round),
  };
}

/**
 * Snapshot of one world leaf: solids, bounds and UVs.
 *
 * @param leaf Leaf.
 * @returns Snapshot.
 */
function leafShot(leaf: SolidScriptGeometryLeaf) {
  if (leaf.kind === 'solid') {
    return {
      kind: 'solid' as const,
      points: leaf.points.map(numbers),
      bounds: bounds(leaf.points),
      uvs: leaf.faceUvs?.map(faceUvShot) ?? null,
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
 * Snapshot of an example's world geometry after a run.
 *
 * @param id Example id.
 * @returns Snapshot.
 */
function shot(id: string) {
  const example = SOLID_SCRIPT_EXAMPLES.find((entry) => entry.id === id);
  if (!example) throw new Error(`no example ${id}`);
  const use =
    example.uses?.generator === false
      ? { use: { usage: 'Modifier' as const, solids: [CORNERS], faces: 6 } }
      : { box: [4, 4, 4] as const };
  const result = solidScriptProgramRun(solidScriptDocumentCreate(example.lines), use);
  expect(result.error?.message ?? null).toBeNull();
  const leaves = solidScriptGeometryLeaves(result.shapes);
  return { id, leafCount: leaves.length, leaves: leaves.map(leafShot) };
}

describe('examples that used to rely on Into leaking keep the same geometry', () => {
  const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as Record<string, ReturnType<typeof shot>>;

  it.each(IDS)('%s solids, bounds and UVs match the pre-fix output', (id) => {
    expect(shot(id)).toEqual(golden[id]);
  });
});
