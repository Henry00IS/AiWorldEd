import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { physicsShatterFracture } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_fracture.js';
import {
  physicsShatterMinPieceThickness,
  physicsShatterPieceBoundsFor,
  physicsShatterPieceShape,
} from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_quality.js';
import type {
  PhysicsShatterInput,
  PhysicsShatterResult,
  PhysicsShatterSettings,
} from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_types.js';
import { physicsShatterTestSettings, physicsShatterTestWall } from './physics_shatter_fixtures.js';
import { SHATTER_HOUSE } from '../physics_shatter_house_fixture.js';

/** The house of the kind tests: walls, roof and the cut-out door and windows. */
const QUALITY_HOUSE: PhysicsShatterInput[] = SHATTER_HOUSE.map((box, index) => ({
  sourceBrushId: `house-${index}`,
  operation: box.operation,
  brush: SolidBrushFactory.createBox(new THREE.Vector3(...box.min), new THREE.Vector3(...box.max)),
}));

/** Inputs and settings of one sweep case. */
interface QualityCase {
  name: string;
  inputs: PhysicsShatterInput[];
  settings: Partial<PhysicsShatterSettings>;
}

/**
 * Builds the sweep: walls, a cube, a thin pane and the house, in Voronoi and
 * brick patterns, over several seeds.
 *
 * @returns Sweep cases.
 */
function qualityCases(): QualityCase[] {
  const wall = [{ sourceBrushId: 'wall', brush: physicsShatterTestWall(4, 3, 0.2) }];
  const cube = [
    {
      sourceBrushId: 'cube',
      brush: SolidBrushFactory.createBox(new THREE.Vector3(-2, 0, -2), new THREE.Vector3(2, 4, 2)),
    },
  ];
  const pane = [{ sourceBrushId: 'pane', brush: physicsShatterTestWall(2, 1.5, 0.01) }];
  const impact = { impactDetail: 0.5, impactPoint: new THREE.Vector3(0, 1.5, -0.1), impactRadius: 1.5 };
  const cases: QualityCase[] = [];
  for (let seed = 1; seed <= 4; seed++) {
    cases.push({ name: `wall ${seed}`, inputs: wall, settings: { seed, crackSize: 0.25 } });
    cases.push({ name: `wall impact ${seed}`, inputs: wall, settings: { seed, crackSize: 0.5, ...impact } });
    cases.push({ name: `cube ${seed}`, inputs: cube, settings: { seed, crackSize: 1 } });
    cases.push({ name: `pane ${seed}`, inputs: pane, settings: { seed, crackSize: 0.2 } });
    cases.push({ name: `house ${seed}`, inputs: QUALITY_HOUSE, settings: { seed, crackSize: 0.4 } });
    cases.push({
      name: `house bricks ${seed}`,
      inputs: QUALITY_HOUSE,
      settings: { seed, mode: 'bricks', brickLength: 0.6, brickHeight: 0.3, brickJitter: 0.5 },
    });
  }
  return cases;
}

/**
 * Expects every piece within the bounds of its input and the pieces plus
 * carved-away volume to add up to the inputs exactly.
 *
 * @param inputs Fracture inputs.
 * @param settings Fracture settings.
 * @param result Fracture result.
 */
function qualityExpectSound(
  inputs: readonly PhysicsShatterInput[],
  settings: PhysicsShatterSettings,
  result: PhysicsShatterResult,
): void {
  const size = settings.mode === 'bricks' ? Math.min(settings.brickLength, settings.brickHeight) : settings.crackSize;
  expect(result.droppedPieces).toBe(0);
  expect(result.unsoundPieces).toBe(0);
  let volume = 0;
  for (const piece of result.pieces) {
    const input = inputs[piece.sourceIndex];
    expect(input).toBeDefined();
    if (!input) continue;
    const bounds = physicsShatterPieceBoundsFor(size, physicsShatterPieceShape(input.brush));
    const shape = physicsShatterPieceShape(piece.brush);
    expect(shape.thickness).toBeGreaterThanOrEqual(bounds.thickness - 1e-9);
    expect(shape.minEdge).toBeGreaterThanOrEqual(bounds.edge - 1e-9);
    expect(shape.minFaceArea).toBeGreaterThanOrEqual(bounds.faceArea - 1e-12);
    expect(SolidBrushValidator.validateGenerated(piece.brush).valid).toBe(true);
    volume += shape.volume;
  }
  expect(volume + result.carvedVolume).toBeCloseTo(result.inputVolume, 6);
}

describe('physics shatter piece quality', () => {
  it('keeps the minimum thickness at 2 cm or a tenth of the crack size', () => {
    expect(physicsShatterMinPieceThickness(0.1)).toBeCloseTo(0.02, 12);
    expect(physicsShatterMinPieceThickness(0.5)).toBeCloseTo(0.05, 12);
  });

  it('heals every case of the sweep into sound pieces that fill the input', () => {
    for (const { name, inputs, settings: overrides } of qualityCases()) {
      const settings = physicsShatterTestSettings({ maxPieces: 2000, ...overrides });
      const result = physicsShatterFracture(inputs, settings);
      expect(result.pieces.length, name).toBeGreaterThan(0);
      qualityExpectSound(inputs, settings, result);
    }
  });

  it('meets Max Pieces with fewer, larger pieces and never leaves a hole', () => {
    for (const mode of ['glass', 'bricks'] as const) {
      const settings = physicsShatterTestSettings({
        mode,
        crackSize: 0.3,
        brickLength: 0.3,
        brickHeight: 0.15,
        maxPieces: 60,
      });
      const result = physicsShatterFracture(QUALITY_HOUSE, settings);
      expect(result.limited).toBe(true);
      expect(result.pieces.length).toBeLessThanOrEqual(60);
      expect(result.pieces.length).toBeGreaterThan(20);
      qualityExpectSound(QUALITY_HOUSE, settings, result);
    }
  });

  it('heals the same way every time', () => {
    const settings = physicsShatterTestSettings({ seed: 3, crackSize: 0.4, maxPieces: 2000 });
    const first = physicsShatterFracture(QUALITY_HOUSE, settings);
    const second = physicsShatterFracture(QUALITY_HOUSE, settings);
    expect(second.pieces.length).toBe(first.pieces.length);
    expect(second.repairedPieces).toBe(first.repairedPieces);
    first.pieces.forEach((piece, index) => {
      const other = second.pieces[index];
      expect(other?.brush.vertices.map((vertex) => vertex.toArray())).toEqual(
        piece.brush.vertices.map((vertex) => vertex.toArray()),
      );
    });
  });
});
