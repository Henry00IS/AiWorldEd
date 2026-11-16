import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptShapeLeavesPositive } from '@/solid_script/language/solid_script_shape.js';
import { solidScriptGeneratorPieces } from '@/solid_script/language/solid_script_generator_pieces.js';
import { solidHullBrushFromPoints } from '@/solid/algorithm/surface/solid_hull_brush.js';
import { SOLID_SCRIPT_EXAMPLES, solidScriptExamplesFind } from '@/solid_script/examples/solid_script_examples.js';

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
 * Pieces a port builds, as keys.
 *
 * @param id Example id.
 * @param test Parameters.
 * @returns Sorted keys.
 */
function portPieces(id: string, test: PortCase): string[] {
  const example = SOLID_SCRIPT_EXAMPLES.find((entry) => entry.id === id);
  if (!example) throw new Error(`no example ${id}`);
  const inputs: Record<string, string> = {
    width: String(test.size[0]),
    depth: String(test.size[1]),
    height: String(test.size[2]),
  };
  for (const [key, value] of Object.entries(test.parameters)) inputs[key] = String(value);
  const result = solidScriptProgramRun(solidScriptDocumentCreate(example.lines), { inputs });
  if (result.error) throw new Error(result.error.message);
  return result.shapes
    .flatMap(solidScriptShapeLeavesPositive)
    .flatMap((leaf) => (leaf.kind === 'solid' ? [pieceKey(leaf.points)] : []))
    .sort();
}

/**
 * Pieces the generator builds in the same box, as keys.
 *
 * @param kind Generator kind id.
 * @param test Parameters.
 * @returns Sorted keys.
 */
function generatorPieces(kind: string, test: PortCase): string[] {
  const [x, y, z] = test.size;
  return solidScriptGeneratorPieces(kind, test.parameters, { size: test.size, min: [-x / 2, -y / 2, -z / 2] })
    .map(pieceKey)
    .sort();
}

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
  sphere: [
    { size: [2, 2, 2], parameters: {} },
    { size: [3, 2, 1.5], parameters: { sides: 10, rings: 5 } },
    { size: [2, 2, 1], parameters: { coverage: 'dome', rings: 4, sides: 12 } },
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
    { size: [3, 1, 2], parameters: { sides: 6, axis: 'x' } },
    { size: [1, 2, 4], parameters: { sides: 5, axis: 'y' } },
    { size: [2, 3, 1], parameters: { sides: 4, axis: 'z' } },
  ],
  hollowBox: [
    { size: [4, 3, 2], parameters: {} },
    { size: [4, 3, 2], parameters: { wallThickness: 0.5, openTop: true } },
    { size: [1, 1, 1], parameters: { wallThickness: 0.6 } },
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
    { size: [4, 3, 5], parameters: { steps: 20, sweep: 720, innerRadius: 0, direction: 'cw', stepDetail: 1 } },
    { size: [3, 3, 2], parameters: { steps: 6, sweep: 90, fillToFloor: false, stepThickness: 0.1, stepDetail: 3 } },
  ],
  stairs: [
    { size: [2, 4, 2], parameters: {} },
    {
      size: [4, 2, 2],
      parameters: { direction: '-x', sizing: 'count', count: 6, landing: 1, nosing: 0.05, noseEdge: 0.01 },
    },
    { size: [3, 3, 1.5], parameters: { direction: '+x', fill: 'solid', rise: 0.25 } },
    { size: [2, 3, 2], parameters: { direction: '-z', fill: 'floating', thickness: 0.05, nosing: 0.04 } },
    { size: [2, 5, 3], parameters: { sizing: 'count', count: 10, waist: 0.3, landing: 1.5 } },
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
  it('runs every example without a mistake', () => {
    for (const example of SOLID_SCRIPT_EXAMPLES) {
      const result = solidScriptProgramRun(solidScriptDocumentCreate(example.lines));
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
    for (const centre of centres) {
      expect(Math.hypot(centre.x, centre.y)).toBeCloseTo(3, 1);
      expect(centre.z).toBeCloseTo(1.5, 5);
    }
    const stones = solidScriptProgramRun(solidScriptDocumentCreate(lines('steppingStones')));
    expect(stones.steps).toHaveLength(9);
  });

  it('finds examples by every word of a search', () => {
    expect(solidScriptExamplesFind('spiral').map((example) => example.id)).toEqual(['spiralStaircase']);
    expect(solidScriptExamplesFind('generator stairs').map((example) => example.id)).toEqual([
      'stairs',
      'curvedStairs',
    ]);
    expect(solidScriptExamplesFind('')).toHaveLength(SOLID_SCRIPT_EXAMPLES.length);
  });
});
