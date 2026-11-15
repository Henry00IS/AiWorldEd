import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { physicsShatterFracture } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_fracture.js';
import { physicsShatterInputHash } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_hash.js';
import {
  PHYSICS_SHATTER_MATERIALS,
  type PhysicsShatterMaterial,
} from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_materials.js';
import { physicsShatterMaterialApply } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_material_presets.js';
import {
  PHYSICS_SHATTER_MIN_EDGE,
  physicsShatterMinPieceThickness,
} from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_quality.js';
import type {
  PhysicsShatterPiece,
  PhysicsShatterResult,
  PhysicsShatterSettings,
} from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_types.js';
import { physicsShatterLastRunOf } from '@/modifier/stack/kinds/shatter/physics_shatter_last_run.js';
import { stackFixture } from '../../../modifier_stack_fixture.js';
import {
  physicsShatterTestExpectSound,
  physicsShatterTestInputs,
  physicsShatterTestSettings,
  physicsShatterTestWall,
} from './physics_shatter_fixtures.js';

/** A 1 cm pane, 2 m by 1.5 m, facing Z. */
const PANE = physicsShatterTestWall(2, 1.5, 0.01);

/** A 2 m plank, 20 cm by 10 cm, along X. */
const PLANK = SolidBrushFactory.createBox(new THREE.Vector3(-1, 0, -0.05), new THREE.Vector3(1, 0.2, 0.05));

/** A 2 m by 1 m stone slab, 40 cm thick. */
const SLAB = SolidBrushFactory.createBox(new THREE.Vector3(-1, 0, -0.2), new THREE.Vector3(1, 1, 0.2));

/**
 * Fractures one brush as a material.
 *
 * @param brush Input brush.
 * @param material Material.
 * @param overrides Other settings.
 * @returns Result and the settings used.
 */
function materialBreak(
  brush: SolidBrush,
  material: PhysicsShatterMaterial,
  overrides: Partial<PhysicsShatterSettings> = {},
): { result: PhysicsShatterResult; settings: PhysicsShatterSettings } {
  const settings = physicsShatterTestSettings({ material, maxPieces: 2000, ...overrides });
  return { result: physicsShatterFracture(physicsShatterTestInputs(brush), settings), settings };
}

/**
 * Returns a piece's extent along a direction.
 *
 * @param piece Piece.
 * @param direction Unit direction.
 * @returns Extent in metres.
 */
function materialExtent(piece: PhysicsShatterPiece, direction: THREE.Vector3): number {
  const along = piece.brush.vertices.map((vertex) => vertex.dot(direction));
  return Math.max(...along) - Math.min(...along);
}

/**
 * Returns whether every crack face stands square to a normal and every piece
 * spans the input's whole thickness along it.
 *
 * @param result Result.
 * @param normal Thickness direction.
 * @param thickness Input thickness.
 * @returns True for prisms through the thickness.
 */
function materialArePrisms(result: PhysicsShatterResult, normal: THREE.Vector3, thickness: number): boolean {
  return result.pieces.every(
    (piece) =>
      Math.abs(materialExtent(piece, normal) - thickness) < 1e-6 &&
      piece.faces.every(
        (origin, index) =>
          origin.kind !== 'crack' || Math.abs(piece.brush.planes[index]?.normal.dot(normal) ?? 1) < 1e-6,
      ),
  );
}

/**
 * Returns the mean of some values.
 *
 * @param values Values.
 * @returns Mean, or 0 for none.
 */
function materialMean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

const Z = new THREE.Vector3(0, 0, 1);
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);

describe('physics shatter materials', () => {
  it('leaves Custom to the raw rows and is the same every time for every material', () => {
    const raw = physicsShatterTestSettings({ mode: 'radial', crackSize: 0.3 });
    expect(physicsShatterMaterialApply(raw)).toEqual(raw);
    for (const material of PHYSICS_SHATTER_MATERIALS) {
      const settings = physicsShatterTestSettings({ material, impactDetail: 0.4 });
      const applied = physicsShatterMaterialApply(settings);
      expect(physicsShatterMaterialApply(applied), material).toEqual(applied);
    }
  });

  it('breaks every material into sound pieces that fill the input', () => {
    const cases: [PhysicsShatterMaterial, SolidBrush, number, number][] = [
      ['glass', PANE, 0.01, 0.25],
      ['temperedGlass', PANE, 0.01, 0.25],
      ['stone', SLAB, Infinity, 0.25],
      ['concrete', SLAB, Infinity, 0.25],
      ['wood', PLANK, Infinity, 0.05],
      ['ceramic', PANE, 0.01, 0.25],
      ['plaster', PANE, 0.01, 0.25],
      ['brick', SLAB, Infinity, 0.25],
      ['custom', SLAB, Infinity, 0.25],
    ];
    for (const [material, brush, thickness, crackSize] of cases) {
      const { result, settings } = materialBreak(brush, material, { crackSize });
      expect(result.pieces.length, material).toBeGreaterThan(3);
      const volume = result.pieces.reduce((sum, piece) => sum + piece.volume, 0);
      expect(volume, material).toBeCloseTo(result.inputVolume, 9);
      const size = material === 'brick' ? Math.min(settings.brickLength, settings.brickHeight) : crackSize;
      physicsShatterTestExpectSound(result, size, PHYSICS_SHATTER_MIN_EDGE, thickness);
    }
  });

  it('cracks glass, tempered glass, ceramic and plaster straight through, stone, concrete and wood in 3D', () => {
    for (const material of ['glass', 'temperedGlass', 'ceramic', 'plaster'] as const)
      expect(materialArePrisms(materialBreak(PANE, material, { crackSize: 0.2 }).result, Z, 0.01), material).toBe(true);
    for (const material of ['stone', 'concrete', 'wood'] as const)
      expect(materialArePrisms(materialBreak(SLAB, material, { crackSize: 0.3 }).result, Z, 0.4), material).toBe(false);
  });

  it('breaks tempered glass into many small, even bits, and glass into fewer, longer shards', () => {
    const tempered = materialBreak(PANE, 'temperedGlass', { crackSize: 0.1 }).result.pieces;
    const glass = materialBreak(PANE, 'glass', { crackSize: 0.1, impactPoint: new THREE.Vector3(0, 0.75, 0) }).result
      .pieces;
    const spread = (pieces: PhysicsShatterPiece[]): number => {
      const mean = materialMean(pieces.map((piece) => piece.volume));
      return Math.sqrt(materialMean(pieces.map((piece) => (piece.volume - mean) ** 2))) / mean;
    };
    const aspect = (piece: PhysicsShatterPiece): number => {
      const [a, b] = [materialExtent(piece, X), materialExtent(piece, Y)];
      return Math.max(a, b) / Math.min(a, b);
    };
    expect(tempered.length).toBeGreaterThan(200);
    expect(spread(tempered)).toBeLessThan(0.35);
    expect(spread(tempered)).toBeLessThan(spread(glass));
    expect(materialMean(tempered.map(aspect))).toBeLessThan(1.5);
  });

  it('splits wood into splinters along the grain, and stone only a little longer along its bedding', () => {
    const along = (pieces: PhysicsShatterPiece[], grain: THREE.Vector3, across: THREE.Vector3): number =>
      materialMean(pieces.map((piece) => materialExtent(piece, grain) / materialExtent(piece, across)));
    const plank = SolidBrushFactory.createBox(new THREE.Vector3(-1, 0, -0.15), new THREE.Vector3(1, 0.3, 0.15));
    const wood = materialBreak(plank, 'wood', { crackSize: 0.1 }).result.pieces;
    expect(along(wood, X, Y)).toBeGreaterThan(2.5);
    const custom = materialBreak(plank, 'custom', { crackSize: 0.1 }).result.pieces;
    expect(along(custom, X, Y)).toBeLessThan(1.6);
    const upright = materialBreak(plank, 'wood', { crackSize: 0.1, grainAxis: 'y' }).result.pieces;
    expect(along(upright, Y, X)).toBeGreaterThan(along(custom, Y, X) * 1.5);
    const stone = materialBreak(SLAB, 'stone', { crackSize: 0.2 }).result.pieces;
    const ratio = along(stone, X, Z);
    expect(ratio).toBeGreaterThan(1.1);
    expect(ratio).toBeLessThan(along(wood, X, Y));
  });

  it('crushes concrete finer near the impact, where stone at the same Impact Detail row stays even', () => {
    const impact = new THREE.Vector3(0, 0.5, 0.2);
    const ratio = (material: PhysicsShatterMaterial): number => {
      const overrides = { crackSize: 0.3, impactPoint: impact, impactRadius: 0.4, impactDetail: 0 };
      const pieces = materialBreak(SLAB, material, overrides).result.pieces;
      const near = pieces.filter((piece) => piece.centroid.distanceTo(impact) < 0.35);
      const far = pieces.filter((piece) => piece.centroid.distanceTo(impact) > 0.8);
      expect(near.length, material).toBeGreaterThan(2);
      expect(far.length, material).toBeGreaterThan(2);
      return materialMean(far.map((piece) => piece.volume)) / materialMean(near.map((piece) => piece.volume));
    };
    const concrete = ratio('concrete');
    expect(concrete).toBeGreaterThan(2);
    expect(concrete).toBeGreaterThan(1.5 * ratio('stone'));
  });

  it('breaks ceramic into fewer, larger plates than glass at the same crack size', () => {
    const glass = materialBreak(PANE, 'glass', { crackSize: 0.1 }).result.pieces.length;
    const ceramic = materialBreak(PANE, 'ceramic', { crackSize: 0.1 }).result.pieces.length;
    expect(ceramic).toBeLessThan(0.7 * glass);
  });

  it('breaks Brick along a brick bond whatever the Pattern row says, and sizes its thin bound by the brick', () => {
    const { result } = materialBreak(SLAB, 'brick', { mode: 'glass', brickLength: 0.5, brickHeight: 0.25 });
    expect(result.pieces.every((piece) => piece.isBrick)).toBe(true);
    const settings = physicsShatterTestSettings({ material: 'brick', mode: 'glass', crackSize: 1 });
    expect(physicsShatterMinPieceThickness({ ...settings, brickLength: 0.6, brickHeight: 0.3 })).toBeCloseTo(0.03, 12);
  });

  it('hashes the material, so a bake from another material turns stale', () => {
    const inputs = physicsShatterTestInputs(PANE);
    const hashes = PHYSICS_SHATTER_MATERIALS.map((material) =>
      physicsShatterInputHash(inputs, physicsShatterTestSettings({ material })),
    );
    expect(new Set(hashes).size).toBe(PHYSICS_SHATTER_MATERIALS.length);
  });

  it('exposes the material on the last run', () => {
    const fixture = stackFixture([{ kind: 'physicsShatter', parameters: { material: 'wood', crackSize: 0.5 } }]);
    fixture.compile();
    const step = (fixture.volume.userData['modifierStack'] as { modifiers: { id: string }[] } | undefined)
      ?.modifiers[0];
    expect(physicsShatterLastRunOf(fixture.volume.uuid, step?.id ?? '')?.material).toBe('wood');
  });
});
