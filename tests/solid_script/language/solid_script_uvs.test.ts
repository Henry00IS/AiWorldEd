import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentListing } from '@/solid_script/document/solid_script_document_listing.js';
import { solidScriptGeometryFaces } from '@/solid_script/language/solid_script_geometry.js';
import { solidScriptFaceCornerUvs } from '@/solid_script/language/solid_script_uvs.js';
import { solidScriptShapeMeshes } from '@/solid_script/language/solid_script_mesh.js';
import type { SolidScriptShapeSolid } from '@/solid_script/language/solid_script_shape.js';
import { solidScriptUvPolicyOf } from '@/solid_script/language/solid_script_uv_policy.js';
import type { SolidScriptUseFacts } from '@/solid_script/language/solid_script_system.js';
import { solidScriptShapeTransform } from '@/solid_script/language/solid_script_reshape.js';
import * as THREE from 'three';

const END: SolidScriptLine = { command: 'end' };
const SELECT_BRUSHES: SolidScriptLine = { command: 'select_brushes' };
const SELECT_ALL: SolidScriptLine = { command: 'select_faces', values: { which: 'All' } };
const SELECT_UP: SolidScriptLine = { command: 'select_faces', values: { which: 'Facing Up' } };
const EACH_FACE: SolidScriptLine = { command: 'for_each', values: { variable: 'Face', list: '[$Selected.Faces]' } };

/**
 * Runs script lines.
 *
 * @param lines Lines.
 * @returns Run result.
 */
function run(...lines: SolidScriptLine[]) {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines));
}

/**
 * The first solid of a run, or stops the test when the run failed or built a
 * mesh.
 *
 * @param result Run result.
 * @returns Solid.
 */
function onlySolid(result: ReturnType<typeof run>): SolidScriptShapeSolid {
  expect(result.error?.message ?? null).toBeNull();
  expect(solidScriptShapeMeshes(result.shapes)).toHaveLength(0);
  const solid = result.shapes.find((shape): shape is SolidScriptShapeSolid => shape.kind === 'solid');
  if (!solid) throw new Error('Expected a solid');
  return solid;
}

/**
 * Rounds a UV component for comparison.
 *
 * @param value Number.
 * @returns Rounded value.
 */
function round(value: number): number {
  return Math.round(value * 1e4) / 1e4 + 0;
}

/**
 * Rounded corner UVs of every face of a solid.
 *
 * @param solid Solid.
 * @returns Islands.
 */
function cornerIslands(solid: SolidScriptShapeSolid): [number, number][][] {
  return solidScriptGeometryFaces([solid]).map((face) =>
    solidScriptFaceCornerUvs(face).map(([u, v]) => [round(u), round(v)]),
  );
}

describe('SolidScript UV commands', () => {
  it('keeps a brush as a brush after Project UVs, Unwrap, Pack Islands and Transform UVs', () => {
    expect(
      onlySolid(run({ command: 'cube' }, SELECT_BRUSHES, SELECT_ALL, { command: 'project_uvs' })).faceUvs,
    ).toHaveLength(6);
    expect(
      onlySolid(run({ command: 'cube' }, SELECT_BRUSHES, SELECT_ALL, { command: 'unwrap' })).faceUvs?.length,
    ).toBeGreaterThan(0);
    expect(
      onlySolid(
        run({ command: 'cube' }, SELECT_BRUSHES, SELECT_ALL, { command: 'unwrap' }, { command: 'pack_islands' }),
      ).faceUvs?.length,
    ).toBeGreaterThan(0);
    expect(
      onlySolid(
        run(
          { command: 'cube' },
          SELECT_BRUSHES,
          SELECT_ALL,
          { command: 'project_uvs' },
          { command: 'select_brushes' },
          { command: 'transform_uvs', values: { offset: '0.5, 0, 0' } },
        ),
      ).faceUvs?.length,
    ).toBeGreaterThan(0);
  });

  it('keeps a mesh as a mesh after Project UVs, Unwrap, Pack Islands and Transform UVs', () => {
    const prefix: SolidScriptLine[] = [
      { command: 'mesh_brushes' },
      { command: 'cube' },
      END,
      SELECT_BRUSHES,
      SELECT_ALL,
    ];
    for (const extra of [
      [{ command: 'project_uvs', values: { mode: 'Box', size: '0.5' } }],
      [{ command: 'unwrap' }],
      [{ command: 'unwrap' }, { command: 'pack_islands' }],
      [{ command: 'project_uvs' }, { command: 'transform_uvs', values: { offset: '0.25, 0, 0' } }],
    ] as SolidScriptLine[][]) {
      const result = run(...prefix, ...extra);
      expect(result.error?.message ?? null).toBeNull();
      expect(solidScriptShapeMeshes(result.shapes)).toHaveLength(1);
      expect(result.shapes.some((shape) => shape.kind === 'solid')).toBe(false);
    }
  });

  it('packs unwrapped islands into 0 to 1', () => {
    const uvs = cornerIslands(
      onlySolid(
        run({ command: 'cube' }, SELECT_BRUSHES, SELECT_ALL, { command: 'unwrap' }, { command: 'pack_islands' }),
      ),
    ).flat();
    expect(uvs.length).toBeGreaterThan(0);
    expect(uvs.every(([u, v]) => u >= -1e-4 && v >= -1e-4 && u <= 1 + 1e-4 && v <= 1 + 1e-4)).toBe(true);
  });

  it('offsets UVs with Transform UVs', () => {
    const before = cornerIslands(
      onlySolid(run({ command: 'cube' }, SELECT_BRUSHES, SELECT_ALL, { command: 'project_uvs' })),
    ).flat();
    const after = cornerIslands(
      onlySolid(
        run(
          { command: 'cube' },
          SELECT_BRUSHES,
          SELECT_ALL,
          { command: 'project_uvs' },
          { command: 'select_brushes' },
          { command: 'transform_uvs', values: { offset: '0.5, 0, 0', pivot: 'Origin' } },
        ),
      ),
    ).flat();
    expect(after).toEqual(before.map(([u, v]) => [round(u + 0.5), v]));
  });

  it('carries stored UVs when a transform is applied to an already projected brush', () => {
    const projected = onlySolid(
      run({ command: 'cube', values: { size: '2, 1, 3' } }, SELECT_BRUSHES, SELECT_ALL, {
        command: 'project_uvs',
        values: { mode: 'Planar', from: 'Overhead', size: '1' },
      }),
    );
    const carried = solidScriptShapeTransform(projected, new THREE.Matrix4().makeRotationY(Math.PI / 2));
    if (carried.kind !== 'solid') throw new Error('Expected a solid');
    const reprojected = onlySolid(
      run(
        { command: 'transform', values: { rotate: '0, 90, 0' } },
        { command: 'cube', values: { size: '2, 1, 3' } },
        END,
        SELECT_BRUSHES,
        SELECT_ALL,
        { command: 'project_uvs', values: { mode: 'Planar', from: 'Overhead', size: '1' } },
      ),
    );
    expect(cornerIslands(carried)).not.toEqual(cornerIslands(reprojected));
  });

  it('projects Box, Planar, Cylinder and Sphere without turning a brush into a mesh', () => {
    const cases: readonly Record<string, string>[] = [
      { mode: 'Box' },
      { mode: 'Planar', from: 'Face' },
      { mode: 'Planar', from: 'Overhead' },
      { mode: 'Cylinder', axis: '0, 1, 0' },
      { mode: 'Sphere', axis: '0, 1, 0' },
    ];
    for (const values of cases) {
      const solid = onlySolid(run({ command: 'cube' }, SELECT_BRUSHES, SELECT_ALL, { command: 'project_uvs', values }));
      expect(solid.faceUvs?.length, JSON.stringify(values)).toBe(6);
    }
  });

  it('reads and sets Face.UVs on a brush face, and stops when the mapping is not planar', () => {
    const written = onlySolid(
      run(
        { command: 'cube' },
        SELECT_BRUSHES,
        SELECT_UP,
        EACH_FACE,
        {
          command: 'variable',
          values: { name: 'Face.UVs', value: '[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]' },
        },
        END,
      ),
    );
    const face = solidScriptGeometryFaces([written]).find((entry) => entry.normal.y > 0.9);
    if (!face) throw new Error('Expected the top face');
    expect(solidScriptFaceCornerUvs(face).map(([u, v]) => [round(u), round(v)])).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]);
    const refused = run(
      { command: 'cube' },
      SELECT_BRUSHES,
      SELECT_UP,
      EACH_FACE,
      {
        command: 'variable',
        values: { name: 'Face.UVs', value: '[0, 0, 0], [1, 0, 0], [1, 1, 0], [0.5, 0.5, 0]' },
      },
      END,
    );
    expect(refused.error?.message).toMatch(/do not lie on a plane/);
    expect(solidScriptShapeMeshes(refused.shapes)).toHaveLength(0);
  });

  it('sets Face.UVs on a mesh face even when the coordinates are not planar', () => {
    const result = run(
      { command: 'mesh_brushes' },
      { command: 'cube' },
      END,
      SELECT_BRUSHES,
      SELECT_UP,
      EACH_FACE,
      {
        command: 'variable',
        values: { name: 'Face.UVs', value: '[0, 0, 0], [1, 0, 0], [1, 1, 0], [0.5, 0.5, 0]' },
      },
      END,
    );
    expect(result.error?.message ?? null).toBeNull();
    const [mesh] = solidScriptShapeMeshes(result.shapes);
    if (!mesh) throw new Error('Expected a mesh');
    expect(mesh.uvs.some((face) => face?.some(([u, v]) => u === 0.5 && v === 0.5))).toBe(true);
  });

  it('stores Readable Text and Textures on any brush, and Offset tiles on a received brush', () => {
    const solid = onlySolid(
      run({ command: 'cube' }, SELECT_BRUSHES, SELECT_ALL, {
        command: 'transform_uvs',
        values: { offset: '0, 0, 0', readable: 'Yes', textures: 'World Aligned' },
      }),
    );
    expect(solidScriptUvPolicyOf(solid)).toMatchObject({ readable: true, textures: 'world' });
    const box = (size: number): [number, number, number][] => {
      const corners: [number, number, number][] = [];
      for (const x of [-1, 1])
        for (const y of [-1, 1])
          for (const z of [-1, 1]) corners.push([(x * size) / 2, (y * size) / 2, (z * size) / 2]);
      return corners;
    };
    const use: SolidScriptUseFacts = { usage: 'Modifier', solids: [box(2)], faces: 6 };
    const received = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'input_brushes' },
        SELECT_BRUSHES,
        SELECT_ALL,
        { command: 'transform_uvs', values: { offset: '2, -1, 0', readable: 'Yes', textures: 'World Aligned' } },
      ]),
      { use },
    );
    expect(received.error?.message ?? null).toBeNull();
    const pass = received.shapes.find((shape): shape is SolidScriptShapeSolid => shape.kind === 'solid');
    if (!pass) throw new Error('Expected the received brush');
    expect(solidScriptUvPolicyOf(pass)).toEqual({
      textures: 'world',
      readable: true,
      shiftU: 2,
      shiftV: -1,
    });
    const direct = solidScriptProgramRun(
      solidScriptDocumentCreate([
        {
          command: 'input_brushes',
          values: { textures: 'World Aligned', readable: 'Yes', uv_shift_u: '2', uv_shift_v: '-1' },
        },
      ]),
      { use },
    );
    expect(direct.error?.message ?? null).toBeNull();
    const fromInput = direct.shapes.find((shape): shape is SolidScriptShapeSolid => shape.kind === 'solid');
    if (!fromInput) throw new Error('Expected the Input Brushes solid');
    expect(solidScriptUvPolicyOf(fromInput)).toEqual(solidScriptUvPolicyOf(pass));
  });

  it('keeps lettering readable when a mirrored copy would reverse U', () => {
    const plain = onlySolid(
      run(
        { command: 'cube' },
        SELECT_BRUSHES,
        SELECT_ALL,
        { command: 'project_uvs', values: { mode: 'Planar', from: 'Overhead', size: '1' } },
        { command: 'mirror', values: { v: '1, 0, 0' } },
      ),
    );
    const readable = onlySolid(
      run(
        { command: 'cube' },
        SELECT_BRUSHES,
        SELECT_ALL,
        { command: 'project_uvs', values: { mode: 'Planar', from: 'Overhead', size: '1' } },
        { command: 'transform_uvs', values: { readable: 'Yes' } },
        { command: 'mirror', values: { v: '1, 0, 0' } },
      ),
    );
    const tops = (solid: SolidScriptShapeSolid) =>
      solidScriptGeometryFaces([solid])
        .filter((face) => face.normal.y > 0.9)
        .flatMap((face) => solidScriptFaceCornerUvs(face).map(([u]) => round(u)));
    const plainU = tops(plain);
    const readableU = tops(readable);
    expect(readableU).not.toEqual(plainU);
    expect(Math.min(...readableU) + Math.max(...readableU)).toBeCloseTo(Math.min(...plainU) + Math.max(...plainU), 4);
  });

  it('writes Transform UVs Readable Text and Textures in plain words', () => {
    expect(
      solidScriptDocumentListing(
        solidScriptDocumentCreate([
          {
            command: 'transform_uvs',
            values: { offset: '1, 0, 0', readable: 'Yes', textures: 'World Aligned' },
          },
        ]),
      ),
    ).toEqual(["Transform UVs Offset '1, 0, 0' Scale '1, 1, 1' Rotate '0' (Readable Text, Textures 'World Aligned')"]);
  });
});
