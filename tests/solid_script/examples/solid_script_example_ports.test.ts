import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { curveEncode } from '@/curve/model/curve_codec.js';
import { curveFromPolyline } from '@/curve/model/curve_model.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptShapeLeavesPositive } from '@/solid_script/language/solid_script_shape.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { ModifierStackKindGenerator } from '@/modifier/stack/kinds/generator/modifier_stack_kind_generator.js';
import { modifierStackSolidScriptLayout } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_layout.js';
import type { SolidTreeNode } from '@/solid/commands/tree/solid_tree_node.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { solidHullBrushFromPoints } from '@/solid/algorithm/surface/solid_hull_brush.js';
import { SOLID_SCRIPT_EXAMPLES, solidScriptExamplesFind } from '@/solid_script/examples/solid_script_examples.js';
import { solidScriptBuiltinFind } from '@/solid_script/language/solid_script_expression_compile.js';
import { solidScriptUseSolidOf } from '../language/solid_script_use_solid.js';

/** One parameter set a port is checked with. */
interface PortCase {
  size: [number, number, number];
  parameters: Record<string, string | number | boolean>;
}

/**
 * Corner keys of a convex piece: its hull corners, rounded and sorted.
 *
 * @param points Points.
 * @returns Key.
 */
function pieceKey(points: readonly THREE.Vector3[]): string {
  const hull = solidHullBrushFromPoints(points);
  const corners = hull ? hull.vertices : points;
  const keys = corners.map((point) =>
    point
      .toArray()
      .map((value) => (Math.round(value * 1e4) / 1e4 + 0).toFixed(4))
      .join(','),
  );
  return [...new Set(keys)].sort().join(' ');
}

/**
 * The editor box of a case: width (X), height (Y) and depth (Z), off the origin
 * so a port that ignores the box center shows.
 *
 * @param test Parameters.
 * @returns Box in editor space.
 */
function portBox(test: PortCase): THREE.Box3 {
  const min = new THREE.Vector3(1, 2, 3);
  return new THREE.Box3(min, min.clone().add(new THREE.Vector3(...test.size)));
}

/**
 * Corners of brush nodes in editor space.
 *
 * @param nodes Nodes.
 * @returns Corners of each brush.
 */
function nodeCorners(nodes: readonly SolidTreeNode[]): THREE.Vector3[][] {
  return nodes.flatMap((node) =>
    node.kind === 'group'
      ? nodeCorners(node.children)
      : [node.brush.vertices.map((vertex) => vertex.clone().add(node.center))],
  );
}

/**
 * Pieces a port builds in the editor, as a SolidScript generator in the box, as
 * keys in editor space.
 *
 * @param id Example id.
 * @param test Parameters.
 * @returns Sorted keys.
 */
function portPieces(id: string, test: PortCase): string[] {
  const example = SOLID_SCRIPT_EXAMPLES.find((entry) => entry.id === id);
  if (!example) throw new Error(`no example ${id}`);
  const inputs: Record<string, string> = {};
  for (const [key, value] of Object.entries(test.parameters)) inputs[key] = String(value);
  const document = solidScriptDocumentCreate(example.lines);
  const layout = modifierStackSolidScriptLayout(
    document,
    'origin',
    portBox(test),
    SolidOperation.Additive,
    undefined,
    inputs,
  );
  if (layout.error) throw new Error(layout.error);
  return nodeCorners(layout.nodes).map(pieceKey).sort();
}

/**
 * Pieces the generator builds in the same editor box, as keys.
 *
 * @param kind Generator kind id.
 * @param test Parameters.
 * @returns Sorted keys.
 */
function generatorPieces(kind: string, test: PortCase): string[] {
  const generator = modifierStackKindFind(kind);
  if (!(generator instanceof ModifierStackKindGenerator)) throw new Error(`no generator ${kind}`);
  return generator
    .previewPieces(test.parameters, portBox(test))
    .map((piece) => pieceKey(piece.vertices))
    .sort();
}

/** A profile that bulges out: one solid. */
const SOLID_SCRIPT_TEST_BULGE = curveEncode(
  curveFromPolyline([
    [0, 0.4],
    [0.3, 0.9],
    [0.6, 1],
    [1, 0.5],
  ]),
);

/** A profile with a waist and a step: several solids. */
const SOLID_SCRIPT_TEST_WAIST = curveEncode(
  curveFromPolyline([
    [0, 1],
    [0.2, 1],
    [0.2, 0.6],
    [0.5, 0.4],
    [0.8, 0.6],
    [0.9, 0.8],
    [1, 0.8],
  ]),
);

/** A profile that ends in a tip, with a straight run through extra points. */
const SOLID_SCRIPT_TEST_TIP = curveEncode(
  curveFromPolyline([
    [0, 1],
    [0.25, 0.75],
    [0.5, 0.5],
    [1, 0],
  ]),
);

/** Parameter sets per generator. */
const PORT_CASES: Record<string, PortCase[]> = {
  cylinder: [
    { size: [2, 2, 2], parameters: {} },
    { size: [3, 1.5, 4], parameters: { sides: 7 } },
    { size: [1, 1, 0.5], parameters: { sides: 32 } },
  ],
  cone: [
    { size: [2, 2, 2], parameters: {} },
    { size: [3, 2, 1], parameters: { sides: 9, topRadius: 0.4 } },
    { size: [1, 4, 3], parameters: { sides: 5, topRadius: 1 } },
  ],
  column: [
    { size: [2, 2, 4], parameters: {} },
    { size: [3, 2, 3], parameters: { sides: '12', aspect: 0.5, profile: SOLID_SCRIPT_TEST_BULGE } },
    { size: [1, 1, 2], parameters: { sides: '6', profile: SOLID_SCRIPT_TEST_WAIST } },
    { size: [2, 2, 2], parameters: { sides: '4', aspect: 2, profile: SOLID_SCRIPT_TEST_TIP } },
  ],
  sphere: [
    { size: [2, 2, 2], parameters: {} },
    { size: [3, 2, 1.5], parameters: { sides: 10, rings: 5 } },
    { size: [2, 2, 1], parameters: { coverage: 'Dome', rings: 4, sides: 12 } },
  ],
  capsule: [
    { size: [1, 1, 3], parameters: {} },
    { size: [2, 1, 1.5], parameters: { sides: 9, capRings: 3 } },
    { size: [2, 2, 2], parameters: { capRings: 1 } },
  ],
  pyramid: [
    { size: [2, 2, 2], parameters: {} },
    { size: [3, 1, 2], parameters: { topSize: 0.5 } },
    { size: [1, 2, 4], parameters: { topSize: 1 } },
  ],
  prism: [
    { size: [2, 2, 2], parameters: {} },
    { size: [3, 1, 2], parameters: { sides: 6, axis: 'Along X' } },
    { size: [1, 2, 4], parameters: { sides: 5, axis: 'Upright' } },
    { size: [2, 3, 1], parameters: { sides: 4, axis: 'Along Z' } },
  ],
  hollowBox: [
    { size: [4, 3, 2], parameters: {} },
    { size: [4, 3, 2], parameters: { wallThickness: 0.5, openTop: true } },
    { size: [1, 1, 1], parameters: { wallThickness: 0.6 } },
  ],
  arch: [
    { size: [4, 1, 3], parameters: {} },
    {
      size: [4, 1, 3],
      parameters: { style: 'Wall With Opening', shape: 'Stretch To Top', segments: 8, thickness: 0.5 },
    },
    { size: [1, 5, 2], parameters: { style: 'Tunnel', span: 'Along Z', segments: 6 } },
    { size: [3, 2, 1], parameters: { sweep: 90, start: 'Left', segments: 5, thickness: 0.3, span: 'Along Z' } },
    { size: [3, 2, 4], parameters: { sweep: 120, start: 'Right', shape: 'Stretch To Top' } },
  ],
  pipe: [
    { size: [4, 4, 2], parameters: {} },
    { size: [4, 2, 3], parameters: { sides: 9, wallThickness: 0.4, sweep: 180 } },
    { size: [2, 3, 1], parameters: { sides: 6, wallThickness: 5, sweep: 270 } },
  ],
  torus: [
    { size: [4, 4, 1], parameters: {} },
    { size: [4, 2, 1], parameters: { ringSides: 7, tubeSides: 5, thickness: 0.4, sweep: 200 } },
    { size: [3, 3, 2], parameters: { ringSides: 12, tubeSides: 6, thickness: 0.5 } },
  ],
  curvedStairs: [
    { size: [4, 4, 3], parameters: {} },
    { size: [4, 3, 5], parameters: { steps: 20, sweep: 720, innerRadius: 0, direction: 'Clockwise', stepDetail: 1 } },
    { size: [3, 3, 2], parameters: { steps: 6, sweep: 90, fillToFloor: false, stepThickness: 0.1, stepDetail: 3 } },
  ],
  stairs: [
    { size: [2, 4, 2], parameters: {} },
    {
      size: [4, 2, 2],
      parameters: { direction: 'Left', sizing: 'Step Count', count: 6, landing: 1, nosing: 0.05, noseEdge: 0.01 },
    },
    { size: [3, 3, 1.5], parameters: { direction: 'Right', fill: 'Solid To Floor', rise: 0.25 } },
    { size: [2, 3, 2], parameters: { direction: 'Back', fill: 'Floating Treads', thickness: 0.05, nosing: 0.04 } },
    { size: [2, 5, 3], parameters: { sizing: 'Step Count', count: 10, waist: 0.3, landing: 1.5 } },
  ],
};

describe('SolidScript ports of the generators', () => {
  for (const example of SOLID_SCRIPT_EXAMPLES.filter((entry) => entry.port)) {
    const cases = PORT_CASES[example.port ?? ''] ?? [];
    it(`${example.name} builds what the ${example.port} generator builds`, () => {
      expect(cases.length).toBeGreaterThanOrEqual(3);
      for (const test of cases) {
        const port = portPieces(example.id, test);
        expect(port.length).toBeGreaterThan(0);
        expect(port).toEqual(generatorPieces(example.port ?? '', test));
      }
    });
  }
});

describe('SolidScript examples', () => {
  it('runs every example without a mistake, a modifier-only one on a received cube', () => {
    const corners = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => [x, y, z] as const)));
    const received = { use: { usage: 'Modifier' as const, solids: [solidScriptUseSolidOf(corners)], faces: 6 } };
    for (const example of SOLID_SCRIPT_EXAMPLES) {
      const options = example.uses?.generator === false ? received : {};
      const result = solidScriptProgramRun(solidScriptDocumentCreate(example.lines), options);
      expect(result.error?.message ?? '', example.id).toBe('');
      expect(result.shapes.length, example.id).toBeGreaterThan(0);
    }
  });

  it('places the vector examples where their vectors point', () => {
    const lines = (id: string) => SOLID_SCRIPT_EXAMPLES.find((example) => example.id === id)!.lines;
    const ring = solidScriptProgramRun(solidScriptDocumentCreate(lines('pillarRing')));
    expect(ring.steps).toHaveLength(8);
    const centres = ring.shapes.flatMap(solidScriptShapeLeavesPositive).map((leaf) => {
      const box = new THREE.Box3().setFromPoints(leaf.kind === 'solid' ? leaf.points : []);
      return box.getCenter(new THREE.Vector3());
    });
    for (const center of centres) {
      expect(Math.hypot(center.x, center.z)).toBeCloseTo(3, 1);
      expect(center.y).toBeCloseTo(1.5, 5);
    }
    const stones = solidScriptProgramRun(solidScriptDocumentCreate(lines('steppingStones')));
    expect(stones.steps).toHaveLength(9);
  });

  it('sweeps the spiral staircase stringer as one smooth slope of twisted convex pieces', () => {
    const lines = SOLID_SCRIPT_EXAMPLES.find((example) => example.id === 'spiralStaircase')!.lines;
    const run = solidScriptProgramRun(solidScriptDocumentCreate(lines));
    expect(run.error).toBeNull();
    expect(run.steps).toHaveLength(1 + 18 * 4 + 18 + 3 * 18 * 4);
    const radius = (point: THREE.Vector3) => Math.hypot(point.x, point.z);
    const stringer = run.shapes
      .flatMap(solidScriptShapeLeavesPositive)
      .flatMap((leaf) => (leaf.kind === 'solid' ? [leaf.points] : []))
      .filter((points) => points.every((point) => radius(point) >= 1.8 - 1e-6));
    expect(stringer).toHaveLength(72);
    for (const [index, piece] of stringer.entries()) {
      const outside = [...piece].sort((a, b) => b.y - a.y).slice(0, 4);
      const plane = new THREE.Plane().setFromCoplanarPoints(outside[0]!, outside[1]!, outside[2]!);
      expect(Math.abs(plane.distanceToPoint(outside[3]!)), `top of piece ${index} is twisted`).toBeGreaterThan(1e-4);
      const next = stringer[index + 1];
      if (next)
        expect(next.some((point) => point.distanceTo(piece[0]!) < 1e-9 || point.distanceTo(piece.at(-1)!) < 1e-9)).toBe(
          true,
        );
    }
  });

  it('finds examples by every word of a search', () => {
    expect(solidScriptExamplesFind('spiral').map((example) => example.id)).toEqual(['spiralStaircase']);
    expect(solidScriptExamplesFind('generator stairs').map((example) => example.id)).toEqual([
      'curvedStairs',
      'stairs',
    ]);
    expect(solidScriptExamplesFind('')).toHaveLength(SOLID_SCRIPT_EXAMPLES.length);
  });

  it('writes Local., Persistent. and built-in functions in PascalCase in every example', () => {
    const lowercase: string[] = [];
    for (const example of SOLID_SCRIPT_EXAMPLES)
      for (const line of example.lines)
        for (const text of Object.values(line.values ?? {})) {
          for (const match of text.matchAll(/\b(local|persistent)\./g)) lowercase.push(`${example.id}: ${match[0]}`);
          for (const match of text.matchAll(/(?<![.\w])([a-z]\w*)\(/g))
            if (solidScriptBuiltinFind(match[1]!) !== undefined) lowercase.push(`${example.id}: ${match[1]}(`);
        }
    expect(lowercase).toEqual([]);
  });
});
