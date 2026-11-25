import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { curveEncode } from '@/curve/model/curve_codec.js';
import { curveFromPolyline, type Curve } from '@/curve/model/curve_model.js';
import { curveEvaluate } from '@/curve/model/curve_sample.js';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { SOLID_SCRIPT_EXAMPLES } from '@/solid_script/examples/solid_script_examples.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptPolygonArea } from '@/solid_script/language/solid_script_polygon.js';
import type { SolidScriptShape } from '@/solid_script/language/solid_script_shape.js';

/**
 * Checks whether a triangle mesh is closed (every undirected edge belongs to an
 * even positive number of triangles, 2 for a simple manifold).
 */
function isClosedMesh(faces: readonly number[][]): boolean {
  if (faces.length === 0) return false;
  const counts = new Map<string, number>();
  for (const face of faces) {
    for (let i = 0; i < face.length; i++) {
      const u = face[i]!;
      const v = face[(i + 1) % face.length]!;
      const key = u < v ? `${u}:${v}` : `${v}:${u}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.values()].every((count) => count >= 2 && count % 2 === 0);
}

/**
 * Smooth-stepped moulding curve from thick base (1.0) to thinner bevelled top
 * (0.3).
 */
function mouldingCurve(): Curve {
  return curveFromPolyline([
    [0, 1],
    [0.25, 1],
    [0.5, 0.6],
    [1, 0.3],
  ]);
}

describe('CurveProfile function and Curve Profile 2D Shape', () => {
  it('registers Curve Profile under 2D Shapes with Curve, Height, Depth, Side and Segments', () => {
    const command = solidScriptCommandFind('curve_profile');
    expect(command?.category).toBe('2D Shapes');
    expect(command?.builds).toBe(false);
    expect(command?.parameters.map((entry) => entry.key)).toEqual([
      'curve',
      'height',
      'depth',
      'side',
      'segments',
      'label',
      'into',
    ]);
    const curveField = command?.parameters.find((entry) => entry.key === 'curve');
    expect(curveField?.curve?.presets.length).toBeGreaterThan(0);
    const sideField = command?.parameters.find((entry) => entry.key === 'side');
    expect(sideField?.words?.map((entry) => entry.word)).toEqual(['Normal', 'Flipped', 'Mirrored']);
  });

  it('samples curve points rotated -90° (t=0 bottom, t=1 top) for Normal, Flipped and Mirrored', () => {
    const curve = mouldingCurve();
    const encoded = curveEncode(curve);
    const height = 0.4;
    const depth = 0.1;
    const segments = 4;

    const runPoints = (side: string): [number, number][] => {
      const result = solidScriptProgramRun(
        solidScriptDocumentCreate([
          { command: 'input', values: { name: 'ProfileCurve', type: 'Curve', default: encoded } },
          {
            command: 'echo',
            values: { value: `[=CurveProfile([ProfileCurve], ${height}, ${depth}, "${side}", ${segments})]` },
          },
          { command: 'cube' },
        ]),
      );
      expect(result.error).toBeNull();
      return JSON.parse(result.messages[0]!) as [number, number][];
    };

    const samples = Array.from({ length: segments + 1 }, (_, k) => {
      const t = k / segments;
      return { y: t * height, x: curveEvaluate(curve, t) * depth };
    });

    const normal = runPoints('Normal');
    expect(solidScriptPolygonArea(normal)).toBeGreaterThan(0);
    expect(normal[0]).toEqual([0, 0]);
    for (const sample of samples) {
      expect(normal.some(([x, y]) => Math.abs(x - sample.x) < 1e-6 && Math.abs(y - sample.y) < 1e-6)).toBe(true);
    }
    expect(normal.at(-1)).toEqual([0, height]);

    const flipped = runPoints('Flipped');
    expect(solidScriptPolygonArea(flipped)).toBeGreaterThan(0);
    for (const sample of samples) {
      expect(flipped.some(([x, y]) => Math.abs(x + sample.x) < 1e-6 && Math.abs(y - sample.y) < 1e-6)).toBe(true);
    }
    expect(flipped.every(([x]) => x <= 1e-9)).toBe(true);

    const mirrored = runPoints('Mirrored');
    expect(solidScriptPolygonArea(mirrored)).toBeGreaterThan(0);
    for (const sample of samples) {
      expect(mirrored.some(([x, y]) => Math.abs(x - sample.x) < 1e-6 && Math.abs(y - sample.y) < 1e-6)).toBe(true);
      expect(mirrored.some(([x, y]) => Math.abs(x + sample.x) < 1e-6 && Math.abs(y - sample.y) < 1e-6)).toBe(true);
    }
    expect(Math.abs(solidScriptPolygonArea(mirrored) - 2 * solidScriptPolygonArea(normal))).toBeLessThan(1e-6);
  });

  it('produces a closed 2D XY profile from Curve Profile block usable directly by Sweep Along Path in both Solid and Mesh modes', () => {
    const encoded = curveEncode(mouldingCurve());

    const solidSweep = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'input', values: { name: 'Moulding', type: 'Curve', default: encoded } },
        {
          command: 'curve_profile',
          values: { curve: '[Moulding]', height: '0.2', depth: '0.05', side: 'Normal', segments: '8', into: 'Shape' },
        },
        {
          command: 'path',
          values: { shape: 'Line', from: '0, 0, 0', to: '3, 0, 0', count: '2', into: 'Wall' },
        },
        {
          command: 'sweep_along_path',
          values: { path: '[Wall]', profile: '[Shape]', up: '0, 1, 0', mesh: 'No' },
        },
      ]),
    );
    expect(solidSweep.error).toBeNull();
    const solids = solidSweep.shapes.filter(
      (shape): shape is Extract<SolidScriptShape, { kind: 'solid' }> => shape.kind === 'solid',
    );
    expect(solids.length).toBeGreaterThanOrEqual(1);
    const allY = solids.flatMap((s) => s.points.map((p) => p.y));
    expect(Math.min(...allY)).toBeCloseTo(0, 5);
    expect(Math.max(...allY)).toBeCloseTo(0.2, 5);

    const meshSweep = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'input', values: { name: 'Moulding', type: 'Curve', default: encoded } },
        {
          command: 'path',
          values: { shape: 'Line', from: '0, 0, 0', to: '3, 0, 0', count: '2', into: 'Wall' },
        },
        {
          command: 'sweep_along_path',
          values: {
            path: '[Wall]',
            profile: '[=CurveProfile([Moulding], 0.2, 0.05, "Mirrored", 8)]',
            up: '0, 1, 0',
            mesh: 'Yes',
            caps: 'Yes',
          },
        },
      ]),
    );
    expect(meshSweep.error).toBeNull();
    const meshes = meshSweep.shapes.filter(
      (shape): shape is Extract<SolidScriptShape, { kind: 'mesh' }> => shape.kind === 'mesh',
    );
    expect(meshes).toHaveLength(1);
    const box = new THREE.Box3();
    for (const [x = 0, y = 0, z = 0] of meshes[0]!.points) box.expandByPoint(new THREE.Vector3(x, y, z));
    expect(box.min.y).toBeCloseTo(0, 5);
    expect(box.max.y).toBeCloseTo(0.2, 5);
    expect(box.max.z - box.min.z).toBeCloseTo(0.1, 5);
    expect(isClosedMesh(meshes[0]!.faces)).toBe(true);
  });

  it('ships a short Curve Baseboard example using Curve Profile and Sweep Along Path', () => {
    const example = SOLID_SCRIPT_EXAMPLES.find((entry) => entry.id === 'curveBaseboard');
    expect(example).toBeDefined();
    const result = solidScriptProgramRun(solidScriptDocumentCreate(example!.lines));
    expect(result.error).toBeNull();
    expect(result.shapes.length).toBeGreaterThan(0);
  });
});
