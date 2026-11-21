import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptSolidTreeBuild } from '@/solid_script/language/solid_script_solid_tree.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import type { SolidScriptUseFacts } from '@/solid_script/language/solid_script_system.js';
import { solidScriptUseSolidOf } from './solid_script_use_solid.js';

const HULLS = vi.hoisted(() => ({ script: 0, all: 0 }));

vi.mock('@/solid/algorithm/surface/solid_hull_brush.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/solid/algorithm/surface/solid_hull_brush.js')>();
  return {
    ...original,
    solidHullBrushFromPoints: (...args: Parameters<typeof original.solidHullBrushFromPoints>) => {
      HULLS.all += 1;
      return original.solidHullBrushFromPoints(...args);
    },
  };
});

vi.mock('@/solid_script/language/solid_script_body_hull.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/solid_script/language/solid_script_body_hull.js')>();
  return {
    ...original,
    solidScriptHullBrush: (...args: Parameters<typeof original.solidScriptHullBrush>) => {
      HULLS.script += 1;
      return original.solidScriptHullBrush(...args);
    },
  };
});

const END: SolidScriptLine = { command: 'end' };
const CUBE: SolidScriptLine = { command: 'cube', values: { size: '2, 2, 2', anchor: 'Center, Center, Center' } };
const SELECT_BRUSHES: SolidScriptLine = { command: 'select_objects' };
const RECEIVED: SolidScriptUseFacts = {
  usage: 'Modifier',
  solids: [
    solidScriptUseSolidOf([-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => [x, y, z] as const)))),
  ],
  faces: 6,
};

/**
 * Runs lines and places what they build, counting the hulls of both steps.
 *
 * @param lines Lines.
 * @param use What a modifier receives, when the script is one.
 * @returns Hull counts: by the script, and in all, including the generators'
 *   own.
 */
function hullsOf(lines: SolidScriptLine[], use?: SolidScriptUseFacts): { script: number; all: number } {
  HULLS.script = 0;
  HULLS.all = 0;
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines), use ? { use } : {});
  expect(result.error?.message ?? null).toBeNull();
  const nodes = solidScriptSolidTreeBuild(result.shapes, {
    offset: new THREE.Vector3(),
    worldToParent: new THREE.Matrix4(),
    operation: SolidOperation.Additive,
    namePrefix: '',
  });
  expect(nodes.length).toBeGreaterThan(0);
  return { ...HULLS };
}

/**
 * A generator block of a kind, filling a two-metre box.
 *
 * @param command Command id.
 * @returns Line.
 */
function generator(command: string): SolidScriptLine {
  return { command, values: { size: '2, 2, 2', anchor: 'Center, Center, Center' } };
}

beforeEach(() => {
  HULLS.script = 0;
  HULLS.all = 0;
});

describe('SolidScript solids keep their own faces', () => {
  it.each<[string, SolidScriptLine[]]>([
    ['Cube', [CUBE]],
    [
      'Transform',
      [{ command: 'transform', values: { move: '1, 2, 3', rotate: '10, 20, 30', scale: '1, 2, 0.5' } }, CUBE, END],
    ],
    ['Mirror', [CUBE, SELECT_BRUSHES, { command: 'mirror' }]],
    [
      'Linear Extrude',
      [{ command: 'linear_extrude', values: { height: '2', scale: '0.5, 0.5' } }, { command: 'square' }, END],
    ],
    ['Rotate Extrude', [{ command: 'rotate_extrude' }, { command: 'square', values: { anchor: 'Left, Front' } }, END]],
    [
      'Extrude Face',
      [
        CUBE,
        SELECT_BRUSHES,
        { command: 'select_faces', values: { which: 'All' } },
        { command: 'extrude_face', values: { distance: '0.5' } },
      ],
    ],
    ['Clip', [CUBE, SELECT_BRUSHES, { command: 'clip', values: { through: '0.3, 0.2, 0', normal: '1, 1, 0' } }]],
    [
      'Bevel Edges',
      [
        CUBE,
        SELECT_BRUSHES,
        { command: 'select_edges', values: { which: 'All' } },
        { command: 'bevel_edges', values: { distance: '0.2' } },
      ],
    ],
    [
      'Scale Faces',
      [
        CUBE,
        SELECT_BRUSHES,
        { command: 'select_faces', values: { which: 'Facing Up' } },
        { command: 'scale_faces', values: { factor: '0.5' } },
      ],
    ],
    [
      'Set Position',
      [
        CUBE,
        SELECT_BRUSHES,
        { command: 'select_vertices', values: { which: 'All' } },
        { command: 'variable', values: { name: '$Selected.Vertices.Positions', value: '[=[$Vertex.Position] * 2]' } },
      ],
    ],
  ])('builds and places %s without a hull', (_, lines) => {
    expect(hullsOf(lines)).toEqual({ script: 0, all: 0 });
  });

  it('passes received brushes on and places them without a hull', () => {
    expect(hullsOf([{ command: 'input_objects' }], RECEIVED)).toEqual({ script: 0, all: 0 });
  });

  it.each([
    'cylinder',
    'sphere',
    'cone',
    'capsule',
    'torus',
    'pipe',
    'pyramid',
    'prism',
    'hollowBox',
    'curvedStairs',
    'column',
    'stairs',
    'arch',
    'blastHole',
  ])('takes the %s pieces as the generator built them, with no hull of its own', (command) => {
    const line = command === 'cylinder' || command === 'sphere' ? { command } : generator(command);
    const built = hullsOf([line]);
    expect(built.script).toBe(0);
    const again = hullsOf([line, SELECT_BRUSHES, { command: 'transform', values: { rotate: '0, 45, 0' } }, line, END]);
    expect(again.script).toBe(0);
    expect(again.all).toBe(built.all);
  });

  it('hulls a Polyhedron, a Hull and a Minkowski once each', () => {
    const points = '[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [0.1, 0.1, 0.1]';
    expect(hullsOf([{ command: 'polyhedron', values: { points } }, END])).toEqual({ script: 1, all: 1 });
    expect(
      hullsOf([{ command: 'hull' }, CUBE, { command: 'transform', values: { move: '3, 0, 0' } }, CUBE, END, END]),
    ).toEqual({
      script: 1,
      all: 1,
    });
    expect(hullsOf([{ command: 'minkowski' }, CUBE, CUBE, END])).toEqual({ script: 1, all: 1 });
  });

  it('hulls scattered points once', () => {
    const lines: SolidScriptLine[] = [
      CUBE,
      SELECT_BRUSHES,
      { command: 'select_faces', values: { which: 'All' } },
      { command: 'scatter_points', values: { count: '30', seed: '2', into: 'Spots' } },
      { command: 'hull', values: { points: '[Spots]' } },
      END,
    ];
    expect(hullsOf(lines)).toEqual({ script: 1, all: 1 });
  });
});
