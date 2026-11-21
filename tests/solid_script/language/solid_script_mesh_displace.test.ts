import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptShapeMeshes, type SolidScriptShapeMesh } from '@/solid_script/language/solid_script_mesh.js';
import {
  meshEulerCharacteristic,
  meshSelfCrossings,
  meshTriangles,
  meshUnmatchedEdges,
} from './solid_script_mesh_checks.js';

/**
 * Displace after Subdivide, with Smooth on and off: the pushed mesh must stay
 * closed and must not fold into itself, also where brushes touch, where a brush
 * is turned, and by the sharp edges a flat Subdivide keeps.
 */

const END: SolidScriptLine = { command: 'end' };

/** A box brush placed somewhere. */
interface TestBox {
  /** Size on X, Y and Z. */
  size: [number, number, number];
  /** Centre position. */
  at: [number, number, number];
  /** Turn in degrees on X, Y and Z. */
  turn?: [number, number, number];
}

/** A wave along Z that also reads the box's position, with a nested formula. */
const WAVE_NESTED = '[=0.1 * Sin([=[$Box.Position.Z] + [$Z]] * 360)]';
/** The same wave written with parentheses. */
const WAVE_PARENTHESES = '[=0.1 * Sin(([$Box.Position.Z] + [$Z]) * 360)]';
/** A wave along Z. */
const WAVE = '[=0.1 * Sin([$Z] * 360)]';
/** A wave along Z that pulls in where the other pushes out. */
const WAVE_INWARDS = '[=-0.1 * Sin([$Z] * 360)]';

/** Where the box of the run sits, for $Box.Position. */
const BOX_POSITION: [number, number, number] = [1.5, 0.02, 1.54];

/** A thin floor with two blocks standing on it, one of them turned. */
const FLOOR_WITH_BLOCKS: TestBox[] = [
  { size: [4, 0.25, 4], at: [1.5, -0.125, 1.5] },
  { size: [1.75, 1, 1], at: [0.625, 0.5, 0.75] },
  { size: [1.75, 1, 1], at: [2.125, 0.5, 2.25], turn: [0, -30, 0] },
];

/** A wide base with two crates of different sizes standing on its top. */
const BASE_WITH_CRATES: TestBox[] = [
  { size: [4, 1, 4], at: [0, 0, 0] },
  { size: [1, 1, 1], at: [-1, 1, -0.5] },
  { size: [0.75, 0.75, 0.75], at: [1, 0.875, 0.7] },
];

/** A lone cube. */
const CUBE: TestBox[] = [{ size: [1, 1, 1], at: [0, 0, 0] }];

/**
 * Script lines that place one centred box.
 *
 * @param box Box to place.
 * @returns Transform, Cube and End lines.
 */
function boxLines(box: TestBox): SolidScriptLine[] {
  return [
    { command: 'transform', values: { move: box.at.join(', '), rotate: (box.turn ?? [0, 0, 0]).join(', ') } },
    { command: 'cube', values: { size: box.size.join(', '), anchor: 'Center, Center, Center' } },
    END,
  ];
}

/**
 * Bakes boxes with Mesh From Solids, subdivides them and optionally displaces
 * the result, and returns the only mesh.
 *
 * @param boxes Boxes to bake.
 * @param levels Subdivide levels, or 0 for none.
 * @param smooth Smooth field text.
 * @param distance Displace distance, or null for no Displace.
 * @returns Resulting mesh.
 */
function pushed(
  boxes: readonly TestBox[],
  levels: number,
  smooth: string,
  distance: string | null,
): SolidScriptShapeMesh {
  const lines: SolidScriptLine[] = [{ command: 'mesh_from_solids' }, ...boxes.flatMap(boxLines), END];
  if (levels > 0)
    lines.push({ command: 'select_objects' }, { command: 'subdivide', values: { levels: String(levels), smooth } });
  if (distance !== null) lines.push({ command: 'select_objects' }, { command: 'displace', values: { distance } });
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines), { pose: { position: BOX_POSITION } });
  expect(result.error?.message ?? null).toBeNull();
  const mesh = solidScriptShapeMeshes(result.shapes)[0];
  if (!mesh) throw new Error('Expected a mesh');
  return mesh;
}

/**
 * Checks a mesh is one closed piece.
 *
 * @param mesh Mesh.
 */
function expectClosed(mesh: SolidScriptShapeMesh): void {
  expect(meshUnmatchedEdges(mesh)).toBe(0);
  expect(meshEulerCharacteristic(mesh)).toBe(2);
}

describe('SolidScript Displace after Subdivide', () => {
  for (const smooth of ['No', 'Yes'])
    for (let levels = 1; levels <= 4; levels++)
      for (const distance of [WAVE, WAVE_INWARDS])
        it(`keeps a cube closed and unfolded after Subdivide ${levels} with Smooth ${smooth} and ${distance}`, () => {
          const mesh = pushed(CUBE, levels, smooth, distance);
          expectClosed(mesh);
          expect(meshSelfCrossings(mesh)).toBe(0);
        });

  for (const smooth of ['No', 'Yes'])
    for (let levels = 1; levels <= 3; levels++)
      for (const distance of [WAVE_NESTED, WAVE_INWARDS])
        it(`keeps touching crates closed and unfolded after Subdivide ${levels} with Smooth ${smooth} and ${distance}`, () => {
          const mesh = pushed(BASE_WITH_CRATES, levels, smooth, distance);
          expectClosed(mesh);
          expect(meshSelfCrossings(mesh)).toBe(0);
        });

  for (let levels = 1; levels <= 3; levels++)
    for (const distance of [WAVE_NESTED, WAVE, WAVE_INWARDS])
      it(`keeps a floor with a turned block closed and unfolded after smooth Subdivide ${levels} and ${distance}`, () => {
        const mesh = pushed(FLOOR_WITH_BLOCKS, levels, 'Yes', distance);
        expectClosed(mesh);
        expect(meshSelfCrossings(mesh)).toBe(0);
      });

  for (let levels = 1; levels <= 3; levels++)
    for (const distance of [WAVE_NESTED, WAVE, WAVE_INWARDS])
      it(`folds almost nothing on a floor with a turned block after flat Subdivide ${levels} and ${distance}`, () => {
        const mesh = pushed(FLOOR_WITH_BLOCKS, levels, 'No', distance);
        expectClosed(mesh);
        expect(meshSelfCrossings(mesh)).toBeLessThan(meshTriangles(mesh).length / 500);
      });

  for (const smooth of ['No', 'Yes'])
    it(`keeps a floor with a turned block closed after Subdivide 4 with Smooth ${smooth} and a wave`, () => {
      expectClosed(pushed(FLOOR_WITH_BLOCKS, 4, smooth, WAVE));
    });

  it('reads a nested formula the same as one with parentheses', () => {
    const nested = pushed(FLOOR_WITH_BLOCKS, 2, 'No', WAVE_NESTED);
    const parentheses = pushed(FLOOR_WITH_BLOCKS, 2, 'No', WAVE_PARENTHESES);
    const plain = pushed(FLOOR_WITH_BLOCKS, 2, 'No', WAVE);
    expect(nested.points.every((point, index) => point.distanceTo(parentheses.points[index]!) < 1e-12)).toBe(true);
    expect(nested.points.some((point, index) => point.distanceTo(plain.points[index]!) > 1e-3)).toBe(true);
  });

  it('moves every point exactly the distance, and points far from edges straight out of their face', () => {
    const size = 2;
    const distance = 0.05;
    const before = pushed([{ size: [size, size, size], at: [0, 0, 0] }], 4, 'No', null);
    const after = pushed([{ size: [size, size, size], at: [0, 0, 0] }], 4, 'No', String(distance));
    const half = size / 2;
    before.points.forEach((point, index) => {
      const moved = after.points[index]!.clone().sub(point);
      expect(moved.length()).toBeCloseTo(distance, 9);
      const nearEdges = [point.x, point.y, point.z].filter((value) => Math.abs(Math.abs(value) - half) < 1e-9);
      const inner = [point.x, point.y, point.z].filter((value) => Math.abs(Math.abs(value) - half) > 1e-9);
      if (nearEdges.length !== 1 || inner.some((value) => half - Math.abs(value) < 4 * distance)) return;
      expect(moved.clone().normalize().dot(point.clone().setLength(1).round())).toBeCloseTo(1, 9);
    });
  });

  it('turns points by an edge partly towards the faces across it', () => {
    const before = pushed(CUBE, 3, 'No', null);
    const after = pushed(CUBE, 3, 'No', '0.1');
    const index = before.points.findIndex((point) => point.distanceTo(new THREE.Vector3(0.5, 0.375, 0)) < 1e-9);
    expect(index).toBeGreaterThanOrEqual(0);
    const moved = after.points[index]!.clone().sub(before.points[index]!);
    expect(moved.x).toBeGreaterThan(0);
    expect(moved.y).toBeGreaterThan(1e-3);
  });

  it('still gives the formula each point own normal', () => {
    const before = pushed(CUBE, 2, 'No', null);
    const after = pushed(CUBE, 2, 'No', '[=[$NY] * 0.1]');
    const top = before.points.findIndex((point) => point.distanceTo(new THREE.Vector3(0, 0.5, 0)) < 1e-9);
    expect(after.points[top]!.y).toBeCloseTo(0.6, 9);
  });

  it('leaves the mesh as it is when nothing moves', () => {
    const before = pushed(FLOOR_WITH_BLOCKS, 2, 'Yes', null);
    const after = pushed(FLOOR_WITH_BLOCKS, 2, 'Yes', '0');
    expect(after.points.every((point, index) => point.equals(before.points[index]!))).toBe(true);
  });
});
