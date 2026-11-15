import { appendFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import type { ModifierStackActionTarget } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { physicsShatterLastRunOf } from '@/modifier/stack/kinds/shatter/physics_shatter_last_run.js';
import { physicsShatterBrushVolume } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_geometry.js';
import { physicsShatterSimulateAction } from '@/modifier/stack/kinds/shatter/sim/physics_shatter_simulate.js';
import { stackFixtureEntries } from '../../modifier_stack_fixture.js';
import { SHATTER_HOUSE, SHATTER_HOUSE_PARAMETERS, SHATTER_HOUSE_VOLUME } from './physics_shatter_house_fixture.js';

/**
 * Builds the test house and one Physics Shatter volume around it.
 *
 * @returns World, solid and volume.
 */
function houseScene(): { world: THREE.Group; model: SolidModel; volume: THREE.Object3D } {
  const world = new THREE.Group();
  const model = new SolidModel('house');
  world.add(model.root);
  for (const box of SHATTER_HOUSE) {
    const min = new THREE.Vector3(...box.min);
    const max = new THREE.Vector3(...box.max);
    const brush = model.addBoxBrush(1, box.operation, null, false);
    brush.mesh?.position.addVectors(min, max).multiplyScalar(0.5);
    brush.mesh?.scale.subVectors(max, min);
  }
  const volume = ModifierVolume.create({
    modifiers: stackFixtureEntries([{ kind: 'physicsShatter', parameters: { ...SHATTER_HOUSE_PARAMETERS } }]),
  });
  volume.position.set(0, 1.5, 0);
  volume.scale.set(8, 5, 6);
  world.add(volume);
  return { world, model, volume };
}

/**
 * Compiles the house and returns its visible brushes.
 *
 * @param scene House scene.
 * @param scene.world World.
 * @param scene.model Solid.
 * @returns Visible brushes.
 */
function houseCompile(scene: { world: THREE.Group; model: SolidModel }) {
  scene.world.updateMatrixWorld(true);
  scene.model.syncBrushOrderFromScene();
  return modifierStackCompile(scene.model.getBrushes(), scene.model.root).instances.filter((brush) => brush.visible);
}

describe('physics shatter of a house', () => {
  it('blows up a house of walls, openings, floor and roof into sound pieces', async () => {
    const scene = houseScene();
    const started = performance.now();
    const unbroken = houseCompile(scene);
    const fractureMs = performance.now() - started;
    const step = ModifierVolume.read(scene.volume).modifiers[0];
    const run = physicsShatterLastRunOf(scene.volume.uuid, step?.id ?? '');
    const pieces = run?.fracture.pieces ?? [];
    expect(unbroken.every((brush) => brush.operation === SolidOperation.Additive)).toBe(true);
    expect(pieces.every((piece) => SolidBrushValidator.validateGenerated(piece.brush).valid)).toBe(true);
    const kept = pieces.reduce((sum, piece) => sum + piece.volume, 0);
    expect(kept + (run?.fracture.droppedVolume ?? 0)).toBeCloseTo(SHATTER_HOUSE_VOLUME, 2);
    const statuses: string[] = [];
    const target: ModifierStackActionTarget = {
      volume: scene.volume,
      stepId: step?.id ?? '',
      commandStack: null,
      status: (text) => statuses.push(text),
    };
    const simulated = performance.now();
    await physicsShatterSimulateAction(target);
    const simulateMs = performance.now() - simulated;
    expect(statuses.at(-1)).toMatch(/^Simulated /);
    const bake = String(ModifierVolume.read(scene.volume).modifiers[0]?.parameters['bake'] ?? '');
    const landed = houseCompile(scene);
    const landedVolume = landed.reduce((sum, brush) => sum + physicsShatterBrushVolume(brush.getModelSpaceBrush()), 0);
    expect(landedVolume).toBeCloseTo(kept, 3);
    const line = {
      pieces: pieces.length,
      fractureMs,
      simulateMs,
      bakeChars: bake.length,
      dropped: run?.fracture.droppedPieces,
      limited: run?.fracture.limited,
      status: statuses.at(-1),
    };
    if (process.env['SHATTER_HOUSE_LOG']) appendFileSync(process.env['SHATTER_HOUSE_LOG'], `${JSON.stringify(line)}\n`);
  }, 120000);
});
