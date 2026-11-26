import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptKindCheck } from '@/solid_script/document/solid_script_document_kind_check.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptShapeLeavesPositive } from '@/solid_script/language/solid_script_shape.js';
import { solidScriptShapeMeshes, type SolidScriptShapeMesh } from '@/solid_script/language/solid_script_mesh.js';

const END: SolidScriptLine = { command: 'end' };

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
 * Echoes formulas.
 *
 * @param values Echo values.
 * @returns Messages, or the error.
 */
function echo(lines: SolidScriptLine[], ...values: string[]): string[] | string {
  const result = run(...lines, ...values.map((value) => ({ command: 'echo', values: { value } })), { command: 'cube' });
  return result.error ? result.error.message : result.messages;
}

/**
 * Corner points of every solid a run built.
 *
 * @param result Run result.
 * @returns Points per solid.
 */
function solids(result: ReturnType<typeof run>): THREE.Vector3[][] {
  expect(result.error).toBeNull();
  return result.shapes
    .flatMap(solidScriptShapeLeavesPositive)
    .flatMap((leaf) => (leaf.kind === 'solid' ? [leaf.points] : []));
}

/**
 * A Set line.
 *
 * @param name Variable.
 * @param value Value.
 * @returns Line.
 */
function set(name: string, value: string): SolidScriptLine {
  return { command: 'variable', values: { name, value } };
}

/**
 * Lines that make a list of points, one item each.
 *
 * @param name List name.
 * @param points Points as field text.
 * @returns Lines.
 */
function points(name: string, ...items: string[]): SolidScriptLine[] {
  return [{ command: 'clear_variable', values: { name } }, ...items.map((item) => set(`${name}()`, item))];
}

/** An L-shaped path: 2 m along X, then 2 m along Y. */
const L_PATH = points('path', '0, 0, 0', '2, 0, 0', '2, 2, 0');

/** A closed square Path, 4 m a side. */
const LOOP: SolidScriptLine[] = [
  {
    command: 'path_from_points',
    values: { points: '[0, 0, 0], [4, 0, 0], [4, 4, 0], [0, 4, 0]', closed: 'Yes', into: 'path' },
  },
];

/**
 * Rounded keys of points.
 *
 * @param points Points.
 * @returns Sorted keys.
 */
function keys(points: readonly THREE.Vector3[]): string[] {
  return [
    ...new Set(
      points.map((point) =>
        point
          .toArray()
          .map((value) => value.toFixed(3))
          .join(','),
      ),
    ),
  ].sort();
}

/**
 * Volume a closed mesh encloses, positive when its faces face outwards.
 *
 * @param mesh Mesh.
 * @returns Signed volume.
 */
function volume(mesh: SolidScriptShapeMesh): number {
  let total = 0;
  for (const face of mesh.faces)
    for (let corner = 1; corner + 1 < face.length; corner++) {
      const [a, b, c] = [face[0]!, face[corner]!, face[corner + 1]!].map((index) => mesh.points[index]!);
      total += a!.dot(new THREE.Vector3().crossVectors(b!, c!)) / 6;
    }
  return total;
}

describe('SolidScript paths', () => {
  it('measures a path and spaces points evenly along it, keeping its ends', () => {
    expect(echo(points('p', '0, 0, 0', '3, 0, 0', '3, 4, 0'), '[=path_length([p])]')).toEqual(['7']);
    expect(echo(L_PATH, '[=resample([path], 5)]')).toEqual(['[[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 1, 0], [2, 2, 0]]']);
    expect(echo(points('p', '0, 0', '4, 0'), '[=resample([p], 3)]')).toEqual(['[[0, 0], [2, 0], [4, 0]]']);
    expect(echo(points('p', '0, 0, 0'), '[=resample([p], 3)]')).toMatch(
      /Resample\(points, count\) needs at least 2 points/,
    );
  });

  it('sweeps a round profile along a path into one solid per stretch, joined on mitred ends', () => {
    const pieces = solids(
      run(...L_PATH, { command: 'sweep_along_path', values: { path: '[path]', radius: '0.5', sides: '4' } }),
    );
    expect(pieces).toHaveLength(2);
    for (const piece of pieces) expect(keys(piece)).toHaveLength(8);
    const shared = keys(pieces[0]!).filter((key) => keys(pieces[1]!).includes(key));
    expect(shared).toHaveLength(4);
    // The joint ring lies on the mitre plane through the bend: x + y = 2.
    for (const key of shared) {
      const [x, y] = key.split(',').map(Number);
      expect(x! + y!).toBeCloseTo(2, 3);
    }
  });

  it('sweeps listed points as a profile, and builds one closed mesh with outward faces', () => {
    const result = run(...L_PATH, {
      command: 'sweep_along_path',
      values: { path: '[path]', profile: '[0, 0, 0], [0.4, 0, 0], [0.4, 0.2, 0], [0, 0.2, 0]', mesh: 'true' },
    });
    expect(result.error).toBeNull();
    const [mesh] = solidScriptShapeMeshes(result.shapes);
    if (!mesh) throw new Error('Expected a mesh');
    expect(mesh.points).toHaveLength(12);
    expect(mesh.faces).toHaveLength(4 * 2 + 2);
    // Outward faces enclose a positive volume: the profile's area times the path's length, about.
    expect(volume(mesh)).toBeGreaterThan(0.08 * 3.5);
    expect(volume(mesh)).toBeLessThan(0.08 * 4.5);
  });

  it('closes a closed Path without caps', () => {
    const result = run(...LOOP, {
      command: 'sweep_along_path',
      values: { path: '[path]', radius: '0.25', sides: '6', mesh: 'true' },
    });
    const [mesh] = solidScriptShapeMeshes(result.shapes);
    expect(mesh?.points).toHaveLength(24);
    expect(mesh?.faces).toHaveLength(24);
    expect(
      solids(
        run(...LOOP, {
          command: 'sweep_along_path',
          values: { path: '[path]' },
        }),
      ),
    ).toHaveLength(4);
  });

  it('says plainly when the path is too short', () => {
    const result = run(...points('path', '0, 0, 0'), {
      command: 'sweep_along_path',
      values: { path: '[path]' },
    });
    expect(result.error?.message).toMatch(/Path needs at least 2 different points/);
  });

  it('sweeps a Circle 2D polygon Into a Path along straight and curved paths as a closed tube', () => {
    const pathLines: SolidScriptLine[] = [
      { command: 'line_path', values: { from: '0, 0, 0', to: '2, 0, 0', count: '2', into: 'Rail' } },
      {
        command: 'arc_path',
        values: { center: '0, 0, 0', radius: '2', start: '0', end: '180', count: '13', into: 'Rail' },
      },
    ];
    for (const pathLine of pathLines) {
      for (const meshFlag of ['Yes', 'No']) {
        const doc = solidScriptDocumentCreate([
          { command: 'circle', values: { r: '0.2', sides: '12', into: 'Ring' } },
          pathLine,
          { command: 'sweep_along_path', values: { path: '[Rail]', profile: '[Ring]', mesh: meshFlag } },
        ]);
        expect(solidScriptKindCheck(doc)).toEqual([]);
        const result = solidScriptProgramRun(doc);
        expect(result.error, `${pathLine.command} mesh=${meshFlag}`).toBeNull();
        if (meshFlag === 'Yes') {
          const [mesh] = solidScriptShapeMeshes(result.shapes);
          expect(mesh, pathLine.command).toBeTruthy();
          expect(volume(mesh!)).toBeGreaterThan(0.15);
          const box = new THREE.Box3().setFromPoints(mesh!.points);
          const size = box.getSize(new THREE.Vector3());
          expect(size.y).toBeCloseTo(0.4, 2);
          if (pathLine.command === 'line_path') {
            expect(size.x).toBeCloseTo(2, 4);
            expect(size.z).toBeCloseTo(0.4, 2);
          } else {
            expect(size.x).toBeGreaterThan(4);
            expect(size.z).toBeGreaterThan(2);
          }
        } else {
          const built = solids(result);
          expect(built.length).toBeGreaterThan(0);
          const box = new THREE.Box3();
          for (const pts of built) for (const pt of pts) box.expandByPoint(pt);
          const size = box.getSize(new THREE.Vector3());
          expect(size.y).toBeCloseTo(0.4, 2);
        }
      }
    }
  });

  it('keeps 2D polygon .Points in X and Y (z = 0) matching typed coordinates, and sweeps XZ Path arcs too', () => {
    const res = run(
      { command: 'star', values: { points: '4', inner: '0.1', outer: '0.2', into: 'S' } },
      { command: 'echo', values: { value: '[S.Points]' } },
      { command: 'polygon', values: { into: 'P' } },
      { command: 'point', values: { position: '0, 0, 5' } },
      { command: 'point', values: { position: '1, 0, 6' } },
      { command: 'point', values: { position: '0, 2, 7' } },
      END,
      { command: 'echo', values: { value: '[P.Points]' } },
    );
    expect(res.error).toBeNull();
    expect(res.messages[1]).toBe('[[0, 0, 0], [1, 0, 0], [0, 2, 0]]');
    const starPoints = JSON.parse(res.messages[0]!) as number[][];
    expect(starPoints.every(([, , z]) => z === 0)).toBe(true);
    expect(starPoints.some(([, y]) => Math.abs(y!) > 0.05)).toBe(true);

    const xzArc = run(
      {
        command: 'arc_path',
        values: {
          center: '0, 0, 0',
          radius: '0.2',
          sweep: '360',
          count: '12',
          closed: 'Yes',
          into: 'Ring',
        },
      },
      { command: 'line_path', values: { from: '0, 0, 0', to: '2, 0, 0', count: '2', into: 'Rail' } },
      { command: 'sweep_along_path', values: { path: '[Rail]', profile: '[Ring]', mesh: 'Yes' } },
    );
    expect(xzArc.error).toBeNull();
    const [arcMesh] = solidScriptShapeMeshes(xzArc.shapes);
    expect(volume(arcMesh!)).toBeGreaterThan(0.15);
  });

  it('sweeps Square, Polygon, Star and Ring.Points profiles along a path without flattening', () => {
    const starDoc = solidScriptDocumentCreate([
      { command: 'star', values: { points: '5', inner: '0.1', outer: '0.3', into: 'StarProfile' } },
      { command: 'line_path', values: { from: '0, 0, 0', to: '2, 0, 0', count: '2', into: 'Rail' } },
      { command: 'sweep_along_path', values: { path: '[Rail]', profile: '[StarProfile]', mesh: 'No' } },
    ]);
    const starRun = solidScriptProgramRun(starDoc);
    expect(starRun.error).toBeNull();
    expect(solids(starRun).length).toBeGreaterThan(1);

    const pointsDoc = solidScriptDocumentCreate([
      { command: 'square', values: { size: '0.4, 0.2', into: 'BoxProfile' } },
      { command: 'line_path', values: { from: '0, 0, 0', to: '2, 0, 0', count: '2', into: 'Rail' } },
      { command: 'sweep_along_path', values: { path: '[Rail]', profile: '[BoxProfile.Points]', mesh: 'Yes' } },
    ]);
    const pointsRun = solidScriptProgramRun(pointsDoc);
    expect(pointsRun.error).toBeNull();
    const [mesh] = solidScriptShapeMeshes(pointsRun.shapes);
    expect(volume(mesh!)).toBeCloseTo(0.4 * 0.2 * 2, 4);

    const polygonDoc = solidScriptDocumentCreate([
      { command: 'polygon', values: { into: 'L' } },
      { command: 'point', values: { position: '-0.2, -0.2, 0' } },
      { command: 'point', values: { position: '0.2, -0.2, 0' } },
      { command: 'point', values: { position: '0.2, 0, 0' } },
      { command: 'point', values: { position: '0, 0, 0' } },
      { command: 'point', values: { position: '0, 0.2, 0' } },
      { command: 'point', values: { position: '-0.2, 0.2, 0' } },
      END,
      { command: 'line_path', values: { from: '0, 0, 0', to: '1, 0, 0', count: '2', into: 'Rail' } },
      { command: 'sweep_along_path', values: { path: '[Rail]', profile: '[L]', mesh: 'Yes' } },
    ]);
    const polyRun = solidScriptProgramRun(polygonDoc);
    expect(polyRun.error).toBeNull();
    const [polyMesh] = solidScriptShapeMeshes(polyRun.shapes);
    expect(volume(polyMesh!)).toBeCloseTo(0.12, 4);
  });

  it('welds mesh corners closer than a distance into one', () => {
    const cubes = (distance: string) =>
      run(
        { command: 'mesh_from_solids' },
        { command: 'cube', values: { size: '1, 1, 1' } },
        { command: 'transform', values: { move: '1.001, 0, 0' } },
        { command: 'cube', values: { size: '1, 1, 1' } },
        END,
        END,
        { command: 'select_objects' },
        { command: 'merge_by_distance', values: { distance } },
      );
    const [merged] = solidScriptShapeMeshes(cubes('0.002').shapes);
    expect(merged?.points).toHaveLength(12);
    expect(merged?.faces).toHaveLength(12);
    const [apart] = solidScriptShapeMeshes(cubes('0.0001').shapes);
    expect(apart?.points).toHaveLength(16);
  });
});
