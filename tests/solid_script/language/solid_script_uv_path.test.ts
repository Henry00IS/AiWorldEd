import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun, type SolidScriptProgramOptions } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptGeometryFaces, solidScriptGeometryLeaves } from '@/solid_script/language/solid_script_geometry.js';
import { solidScriptFaceCornerUvs } from '@/solid_script/language/solid_script_uvs.js';

const END: SolidScriptLine = { command: 'end' };

/**
 * Runs script lines.
 *
 * @param lines Lines.
 * @param options Run options.
 * @returns Run result.
 */
function run(lines: SolidScriptLine[], options: SolidScriptProgramOptions = {}) {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines), options);
}

/**
 * Lines that build a unit cube whose lowest corner sits at a spot.
 *
 * @param x Lowest X.
 * @returns Lines.
 */
function cubeAt(x: number): SolidScriptLine[] {
  return [
    { command: 'transform', values: { move: `${x}, 0, 0` } },
    { command: 'cube', values: { size: '1, 1, 1', anchor: 'Left, Bottom, Back' } },
    END,
  ];
}

/**
 * Lines that fill Path with points along X.
 *
 * @param xs X of each point.
 * @returns Lines.
 */
function pathAlongX(xs: readonly number[]): SolidScriptLine[] {
  return [
    { command: 'clear_variable', values: { name: 'Path' } },
    ...xs.map((x) => ({ command: 'add_item', values: { value: `[=Vector(${x}, 0, 0)]`, list: 'Path' } })),
  ];
}

/**
 * Every corner of every face with its UV, rounded.
 *
 * @param result Run result.
 * @returns Corners with position, face direction and UV.
 */
function corners(result: ReturnType<typeof run>) {
  expect(result.error?.message ?? null).toBeNull();
  return solidScriptGeometryFaces(solidScriptGeometryLeaves(result.shapes)).flatMap((face, faceIndex) =>
    solidScriptFaceCornerUvs(face).map(([u, v], corner) => ({
      face: faceIndex,
      leaf: face.leaf,
      normal: face.normal.toArray().map((value) => Math.round(value * 1e3) / 1e3 + 0),
      at: face.corners[corner]!.toArray().map((value) => Math.round(value * 1e4) / 1e4 + 0),
      uv: [u, v] as const,
    })),
  );
}

/**
 * Lines that map a row of cubes along Path.
 *
 * @param count Cubes.
 * @param values Extra Project Path UVs values.
 * @returns Lines.
 */
function row(count: number, values: Record<string, string> = {}): SolidScriptLine[] {
  return [
    ...Array.from({ length: count }, (_, index) => cubeAt(index)).flat(),
    ...pathAlongX(Array.from({ length: count + 1 }, (_, index) => index)),
    { command: 'select_objects' },
    { command: 'project_path_uvs', values: { path: '[Path]', of: '[$Selected.Objects]', ...values } },
  ];
}

describe('Project Path UVs', () => {
  it('runs U on along the side walls from one solid to the next', () => {
    const all = corners(run(row(4)));
    const front = all.filter((corner) => corner.normal[2] === 1);
    for (const x of [1, 2, 3]) {
      const here = front.filter((corner) => corner.at[0] === x && corner.at[1] === 0);
      expect(here.length).toBe(2);
      expect(here[0]!.uv[0]).toBeCloseTo(here[1]!.uv[0], 6);
    }
    const left = front.find((corner) => corner.at[0] === 0 && corner.at[1] === 0)!;
    const right = front.find((corner) => corner.at[0] === 4 && corner.at[1] === 0)!;
    expect(Math.abs(right.uv[0] - left.uv[0])).toBeCloseTo(4, 6);
  });

  it('keeps level faces planar, so tops match a row built in one piece', () => {
    const all = corners(run(row(3)));
    const top = all.filter((corner) => corner.normal[1] === 1);
    const atZero = top.filter((corner) => corner.at[0] === 1 && corner.at[2] === 0);
    expect(new Set(atZero.map((corner) => corner.uv.map((value) => value.toFixed(6)).join()))).toHaveProperty(
      'size',
      1,
    );
  });

  it('halves the repeats along the path with Size 2', () => {
    const all = corners(run(row(2, { size: '2' })));
    const front = all.filter((corner) => corner.normal[2] === 1 && corner.at[1] === 0);
    const span = Math.max(...front.map((corner) => corner.uv[0])) - Math.min(...front.map((corner) => corner.uv[0]));
    expect(span).toBeCloseTo(1, 6);
  });

  it('changes nothing when Path is empty, also with Into', () => {
    const plain = corners(run([...cubeAt(0)]));
    const empty = corners(
      run([
        ...cubeAt(0),
        { command: 'select_objects' },
        { command: 'project_path_uvs', values: { of: '[$Selected.Objects]' } },
      ]),
    );
    expect(empty.map((corner) => corner.uv)).toEqual(plain.map((corner) => corner.uv));
  });

  it('stops when Path has fewer points than the solids plus one', () => {
    const result = run([
      ...cubeAt(0),
      ...cubeAt(1),
      ...pathAlongX([0, 1]),
      { command: 'select_objects' },
      {
        command: 'project_path_uvs',
        values: { path: '[Path]', of: '[$Selected.Objects]' },
      },
    ]);
    expect(result.error?.message).toMatch(/3 points for 2 solids, not 2/);
  });

  it('stops when two path points are in one place', () => {
    const result = run([
      ...cubeAt(0),
      ...pathAlongX([0, 0]),
      { command: 'select_objects' },
      {
        command: 'project_path_uvs',
        values: { path: '[Path]', of: '[$Selected.Objects]' },
      },
    ]);
    expect(result.error?.message).toMatch(/two points in one place/);
  });

  it('stops when a path point is on no end of the solid', () => {
    const result = run([
      ...cubeAt(0),
      ...pathAlongX([0.5, 1]),
      { command: 'select_objects' },
      {
        command: 'project_path_uvs',
        values: { path: '[Path]', of: '[$Selected.Objects]' },
      },
    ]);
    expect(result.error?.message).toMatch(/matching cross-sections/);
  });

  it('works on solids only', () => {
    const result = run([
      { command: 'mesh_from_solids' },
      ...cubeAt(0),
      END,
      ...pathAlongX([0, 1]),
      { command: 'select_objects' },
      { command: 'project_path_uvs', values: { path: '[Path]', of: '[$Selected.Objects]' } },
    ]);
    expect(result.error?.message).toMatch(/works on solids, not meshes/);
  });

  it('gives finite UVs on a long row with Tube Yes', () => {
    const all = corners(run(row(12, { tube: 'Yes' })));
    expect(all.every((corner) => corner.uv.every(Number.isFinite))).toBe(true);
  });
});

describe('box-corner texture pin', () => {
  const box: SolidScriptProgramOptions = { box: [4, 2, 6] };

  it('starts unmapped faces at the lowest corner of the box', () => {
    const all = corners(run([{ command: 'cube', values: { size: '4, 2, 6' } }], box));
    const low = all.filter((corner) => corner.at.join() === '-2,-1,-3');
    expect(low.length).toBeGreaterThan(0);
    for (const corner of low)
      for (const value of corner.uv) expect(Math.abs(value - Math.round(value))).toBeLessThan(1e-6);
  });

  it('carries the texture with a solid that moves or turns', () => {
    const still = corners(run([{ command: 'cube', values: { size: '1, 1, 1' } }], box)).map((corner) => corner.uv);
    const poses: Record<string, string>[] = [{ move: '0.3, 0.2, 0.1' }, { rotate: '0, 90, 0' }];
    for (const values of poses) {
      const moved = corners(
        run([{ command: 'transform', values }, { command: 'cube', values: { size: '1, 1, 1' } }, END], box),
      ).map((corner) => corner.uv);
      const key = (uvs: readonly (readonly [number, number])[]) =>
        uvs.map(([u, v]) => `${(u - Math.floor(u)).toFixed(4)},${(v - Math.floor(v)).toFixed(4)}`).sort();
      expect(key(moved)).toEqual(key(still));
    }
  });

  it('uses no box and warns about none when the run has no box', () => {
    const result = run([{ command: 'cube' }]);
    expect(result.warnings).toEqual([]);
    expect(corners(result).every((corner) => corner.uv.every(Number.isFinite))).toBe(true);
  });
});

/**
 * Repeats around the upright sides of a run: the U each side face covers along
 * its lowest edge, added up.
 *
 * @param all Corners of the run.
 * @param leafIndex Which solid or mesh, in build order.
 * @returns Repeats around.
 */
function repeatsAround(all: ReturnType<typeof corners>, leafIndex = 0): number {
  const leaves = [...new Set(all.map((corner) => corner.leaf))];
  const sides = all.filter((corner) => corner.leaf === leaves[leafIndex] && Math.abs(corner.normal[1]!) < 0.5);
  const faces = new Map<number, typeof sides>();
  for (const corner of sides) faces.set(corner.face, [...(faces.get(corner.face) ?? []), corner]);
  let total = 0;
  for (const face of faces.values()) {
    const low = Math.min(...face.map((corner) => corner.at[1]!));
    const bottom = face.filter((corner) => Math.abs(corner.at[1]! - low) < 1e-6).map((corner) => corner.uv[0]);
    total += Math.max(...bottom) - Math.min(...bottom);
  }
  return total;
}

/**
 * Repeats around a ring of equal faces: the U one face covers, the middle value
 * of them all so the face across the seam does not count, times the faces.
 *
 * @param ring Corners of the faces of one ring.
 * @returns Repeats around and the face count.
 */
function repeatsOfRing(ring: ReturnType<typeof corners>): { total: number; faces: number } {
  const faces = [...new Set(ring.map((corner) => corner.face))];
  const spans = faces.map((face) => {
    const us = ring.filter((corner) => corner.face === face).map((corner) => corner.uv[0]);
    return Math.max(...us) - Math.min(...us);
  });
  const each = [...spans].sort((left, right) => left - right)[Math.floor(spans.length / 2)] ?? 0;
  return { total: each * faces.length, faces: faces.length };
}

/**
 * Lines that wrap everything built so far around the upright axis.
 *
 * @param kind Cylinder or Sphere.
 * @returns Lines.
 */
function wrap(kind: 'cylinder' | 'sphere'): SolidScriptLine[] {
  return [{ command: 'select_objects' }, { command: `project_${kind}_uvs`, values: { of: '[$Selected.Objects]' } }];
}

describe('whole repeats around Project Cylinder and Sphere UVs', () => {
  it.each([3, 7, 16])('closes the seam of a %i-sided cylinder in whole repeats', (sides) => {
    const total = repeatsAround(
      corners(
        run([
          { command: 'cylinder', values: { h: '1', r1: '0.7', r2: '0.7', sides: `${sides}` } },
          ...wrap('cylinder'),
        ]),
      ),
    );
    expect(Math.abs(total - Math.round(total))).toBeLessThan(1e-6);
    expect(Math.round(total)).toBeGreaterThanOrEqual(1);
  });

  it('gives a thin cylinder at least one repeat around', () => {
    const total = repeatsAround(
      corners(run([{ command: 'cylinder', values: { h: '1', r1: '0.01', r2: '0.01' } }, ...wrap('cylinder')])),
    );
    expect(total).toBeCloseTo(1, 6);
  });

  it('closes the seam of a sphere in whole repeats along its widest ring', () => {
    const all = corners(
      run([{ command: 'mesh_from_solids' }, { command: 'sphere', values: { r: '0.9' } }, END, ...wrap('sphere')]),
    );
    const widest = Math.min(...all.map((corner) => Math.abs(corner.normal[1]!)));
    const { total } = repeatsOfRing(all.filter((corner) => Math.abs(corner.normal[1]!) <= widest + 1e-6));
    expect(total).toBeGreaterThan(0);
    expect(Math.abs(total - Math.round(total))).toBeLessThan(1e-6);
  });

  it('wraps cylinders stacked on one axis as one, so U meets at the joint', () => {
    const all = corners(
      run([
        { command: 'cylinder', values: { h: '1', r1: '0.7', r2: '0.7', anchor: 'Center, Bottom, Center' } },
        { command: 'transform', values: { move: '0, 1, 0' } },
        { command: 'cylinder', values: { h: '1', r1: '0.7', r2: '0.7', anchor: 'Center, Bottom, Center' } },
        END,
        ...wrap('cylinder'),
      ]),
    );
    const joint = all.filter((corner) => Math.abs(corner.normal[1]!) < 0.5 && corner.at[1] === 1);
    const byPoint = new Map<string, number[]>();
    for (const corner of joint) byPoint.set(corner.at.join(), [...(byPoint.get(corner.at.join()) ?? []), corner.uv[0]]);
    for (const us of byPoint.values()) {
      const frac = us.map((value) => value - Math.floor(value + 1e-9));
      expect(Math.max(...frac) - Math.min(...frac)).toBeLessThan(1e-6);
    }
  });

  it('wraps a mesh in whole repeats with finite UVs', () => {
    const all = corners(
      run([
        { command: 'mesh_from_solids' },
        { command: 'cylinder', values: { h: '1', r1: '0.7', r2: '0.7', sides: '9' } },
        END,
        ...wrap('cylinder'),
      ]),
    );
    expect(all.every((corner) => corner.uv.every(Number.isFinite))).toBe(true);
    const { total, faces } = repeatsOfRing(all.filter((corner) => Math.abs(corner.normal[1]!) < 0.5));
    expect(faces).toBe(9);
    expect(Math.abs(total - Math.round(total))).toBeLessThan(1e-6);
  });
});
