import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import type { ModifierStackActionTarget } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { modifierStackStatusRead } from '@/modifier/stack/evaluate/modifier_stack_status.js';
import { modifierStackOwnerDecode } from '@/modifier/stack/owner/modifier_stack_owner.js';
import {
  physicsShatterLastRunOf,
  type PhysicsShatterLastRun,
} from '@/modifier/stack/kinds/shatter/physics_shatter_last_run.js';
import { PHYSICS_SHATTER_OUTER_STACK } from '@/modifier/stack/kinds/shatter/physics_shatter_inputs.js';
import { physicsShatterBrushVolume } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_geometry.js';
import type { PhysicsShatterPiece } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_types.js';
import { physicsShatterSimulateAction } from '@/modifier/stack/kinds/shatter/sim/physics_shatter_simulate.js';
import { stackFixtureEntries, type StackFixtureStep } from '../../modifier_stack_fixture.js';
import { physicsShatterTestExpectSound } from './fracture/physics_shatter_fixtures.js';

/** Glass shatter with half-metre cracks. */
const MULTI_SHATTER: StackFixtureStep = {
  kind: 'physicsShatter',
  parameters: { material: 'custom', crackSize: 0.5, duration: 1 },
};

/** A solid in its own world, ready for volumes. */
interface MultiScene {
  world: THREE.Group;
  model: SolidModel;
}

/**
 * Builds an empty solid inside a fresh world.
 *
 * @returns Scene.
 */
function multiScene(): MultiScene {
  const world = new THREE.Group();
  const model = new SolidModel('multi');
  world.add(model.root);
  return { world, model };
}

/**
 * Adds a box brush at a position.
 *
 * @param scene Scene.
 * @param size Edge length.
 * @param position Brush position.
 * @param operation CSG operation.
 * @param parent Group to add it to, or the solid root.
 * @returns Brush.
 */
function multiBox(
  scene: MultiScene,
  size: number,
  position: THREE.Vector3Tuple,
  operation = SolidOperation.Additive,
  parent?: THREE.Object3D,
): SolidBrushInstance {
  const brush = scene.model.addBoxBrush(size, operation, parent);
  brush.mesh?.position.set(...position);
  return brush;
}

/**
 * Creates a modifier volume with the given steps.
 *
 * @param steps Modifier steps.
 * @param scale Volume edge length.
 * @returns Volume node.
 */
function multiVolume(steps: StackFixtureStep[], scale: number): THREE.Object3D {
  const volume = ModifierVolume.create({ modifiers: stackFixtureEntries(steps) });
  volume.scale.setScalar(scale);
  return volume;
}

/**
 * Compiles the scene and returns its visible brushes.
 *
 * @param scene Scene.
 * @returns Visible compiled brushes.
 */
function multiCompile(scene: MultiScene): SolidBrushInstance[] {
  scene.world.updateMatrixWorld(true);
  scene.model.syncBrushOrderFromScene();
  return modifierStackCompile(scene.model.getBrushes(), scene.model.root).instances.filter((brush) => brush.visible);
}

/**
 * Returns the net CSG volume of convex brushes that do not overlap.
 *
 * @param brushes Visible brushes.
 * @returns Additive minus subtractive volume.
 */
function multiNetVolume(brushes: readonly SolidBrushInstance[]): number {
  return brushes.reduce((sum, brush) => {
    const volume = physicsShatterBrushVolume(brush.getModelSpaceBrush());
    return sum + (brush.operation === SolidOperation.Additive ? volume : -volume);
  }, 0);
}

/**
 * Returns the last run of a volume's Physics Shatter step.
 *
 * @param owner Volume or owner node.
 * @returns Last run.
 */
function multiRunOf(owner: THREE.Object3D): PhysicsShatterLastRun | null {
  const step = ModifierVolume.read(owner).modifiers.find((entry) => entry.kind === 'physicsShatter');
  return physicsShatterLastRunOf(owner.uuid, step?.id ?? '') ?? null;
}

/**
 * Counts grid sample points that lie strictly inside more than one piece.
 *
 * @param pieces Fracture pieces.
 * @param steps Samples per axis.
 * @returns Number of points shared by two or more pieces.
 */
function multiOverlapCount(pieces: readonly PhysicsShatterPiece[], steps = 24): number {
  const bounds = new THREE.Box3();
  for (const piece of pieces) bounds.union(new THREE.Box3().setFromPoints(piece.brush.vertices));
  const size = bounds.getSize(new THREE.Vector3());
  const point = new THREE.Vector3();
  let shared = 0;
  for (let i = 0; i < steps ** 3; i++) {
    point.set((i % steps) + 0.5, (Math.floor(i / steps) % steps) + 0.5, Math.floor(i / steps / steps) + 0.5);
    point.multiply(size).divideScalar(steps).add(bounds.min);
    const inside = pieces.filter((piece) => piece.brush.planes.every((plane) => plane.signedDistance(point) < -1e-6));
    if (inside.length > 1) shared++;
  }
  return shared;
}

/**
 * Checks the pieces of a run: watertight convex brushes that never overlap.
 *
 * @param run Last run.
 */
function multiExpectSoundPieces(run: PhysicsShatterLastRun | null): void {
  expect(run?.fracture.pieces.length ?? 0).toBeGreaterThan(0);
  const pieces = run?.fracture.pieces ?? [];
  for (const piece of pieces) expect(SolidBrushValidator.validateGenerated(piece.brush).valid).toBe(true);
  expect(multiOverlapCount(pieces)).toBe(0);
  if (run) physicsShatterTestExpectSound(run.fracture, 0);
}

/**
 * Presses Simulate on a volume's Physics Shatter step.
 *
 * @param owner Volume or owner node.
 * @returns Status lines the action wrote.
 */
async function multiSimulate(owner: THREE.Object3D): Promise<string[]> {
  const statuses: string[] = [];
  const stepId = ModifierVolume.read(owner).modifiers.find((entry) => entry.kind === 'physicsShatter')?.id ?? '';
  const target: ModifierStackActionTarget = {
    volume: owner,
    stepId,
    commandStack: null,
    status: (text) => statuses.push(text),
  };
  await physicsShatterSimulateAction(target);
  return statuses;
}

/**
 * Returns the step feedback of a volume's first Physics Shatter step.
 *
 * @param owner Volume or owner node.
 * @returns Feedback text.
 */
function multiFeedback(owner: THREE.Object3D): string {
  const status = modifierStackStatusRead(owner);
  return status?.steps.map((step) => step.error ?? '').join(' ') ?? '';
}

/**
 * Builds a group of two touching boxes, turned and moved, with a shatter volume
 * inside.
 *
 * @returns Scene, group and volume.
 */
function multiGroupScene(): { scene: MultiScene; group: THREE.Group; volume: THREE.Object3D } {
  const scene = multiScene();
  const group = new THREE.Group();
  markAsSolidCsgGroup(group, SolidOperation.Additive);
  group.position.set(3, 0, 0);
  group.rotation.y = 0.5;
  scene.model.root.add(group);
  for (const x of [0, 1]) multiBox(scene, 1, [x, 0, 0], SolidOperation.Additive, group);
  const volume = multiVolume([MULTI_SHATTER], 6);
  group.add(volume);
  return { scene, group, volume };
}

describe('physics shatter with several input brushes', () => {
  it('shatters separate brushes in one volume and simulates them together', async () => {
    const scene = multiScene();
    for (const x of [0, 2, 4]) multiBox(scene, 1, [x, 0, 0]);
    const volume = multiVolume([MULTI_SHATTER], 12);
    scene.world.add(volume);
    const unbroken = multiCompile(scene);
    expect(unbroken.length).toBe(24);
    expect(multiNetVolume(unbroken)).toBeCloseTo(3, 4);
    const run = multiRunOf(volume);
    expect(new Set(run?.fracture.pieces.map((piece) => piece.sourceIndex)).size).toBe(3);
    multiExpectSoundPieces(run);
    expect((await multiSimulate(volume)).at(-1)).toMatch(/^Simulated /);
    const landed = multiCompile(scene);
    expect(landed.length).toBe(24);
    expect(multiNetVolume(landed)).toBeCloseTo(3, 4);
    expect(landed.map((brush) => brush.getModelSpaceBrush().vertices[0]?.y)).not.toEqual(
      unbroken.map((brush) => brush.getModelSpaceBrush().vertices[0]?.y),
    );
  });

  it('shatters brushes of a turned group from a volume inside it', () => {
    const { scene, volume } = multiGroupScene();
    const pieces = multiCompile(scene);
    expect(pieces.length).toBe(16);
    expect(multiNetVolume(pieces)).toBeCloseTo(2, 4);
    multiExpectSoundPieces(multiRunOf(volume));
  });

  it("never doubles brushes that a group's Shear would bring back, and says the shear is missed", () => {
    const { scene, group, volume } = multiGroupScene();
    modifierStackOwnerDecode(group, { modifiers: stackFixtureEntries([{ kind: 'shear', parameters: { angle: 30 } }]) });
    const pieces = multiCompile(scene);
    expect(pieces.length).toBe(16);
    expect(multiNetVolume(pieces)).toBeCloseTo(2, 4);
    expect(multiFeedback(volume)).toContain(PHYSICS_SHATTER_OUTER_STACK);
  });

  it("shatters the sheared brushes when Physics Shatter follows Shear in the group's own stack", () => {
    const { scene, group, volume } = multiGroupScene();
    volume.removeFromParent();
    const steps = stackFixtureEntries([{ kind: 'shear', parameters: { angle: 30 } }, MULTI_SHATTER]);
    modifierStackOwnerDecode(group, { modifiers: steps });
    const pieces = multiCompile(scene);
    expect(multiNetVolume(pieces)).toBeCloseTo(2, 3);
    const run = multiRunOf(group);
    multiExpectSoundPieces(run);
    const plain = multiGroupScene();
    plain.volume.removeFromParent();
    modifierStackOwnerDecode(plain.group, { modifiers: stackFixtureEntries([MULTI_SHATTER]) });
    multiCompile(plain.scene);
    const hullsOf = (owner: THREE.Object3D) =>
      multiRunOf(owner)?.fracture.pieces.map((piece) => Array.from(piece.hull));
    expect(hullsOf(group)).not.toEqual(hullsOf(plain.group));
  });

  it('shatters the copies of an Array step before it in the same stack', () => {
    const scene = multiScene();
    multiBox(scene, 1, [0, 0, 0]);
    const array = { kind: 'linear', parameters: { mode: 'Fixed Step', offsetX: 2, count: 3 } };
    const volume = multiVolume([array, MULTI_SHATTER], 12);
    scene.world.add(volume);
    const pieces = multiCompile(scene);
    expect(pieces.length).toBe(24);
    expect(multiNetVolume(pieces)).toBeCloseTo(3, 4);
    const run = multiRunOf(volume);
    expect(new Set(run?.fracture.pieces.map((piece) => piece.sourceIndex)).size).toBe(3);
    multiExpectSoundPieces(run);
  });

  it('shatters the copies of an Array step in a brush\u2019s own stack', () => {
    const scene = multiScene();
    const brush = multiBox(scene, 1, [0, 0, 0]);
    const array = { kind: 'linear', parameters: { mode: 'Fixed Step', offsetX: 2, count: 3 } };
    modifierStackOwnerDecode(brush.mesh as THREE.Object3D, { modifiers: stackFixtureEntries([array, MULTI_SHATTER]) });
    const pieces = multiCompile(scene);
    expect(pieces.length).toBe(24);
    expect(multiNetVolume(pieces)).toBeCloseTo(3, 4);
  });

  it('shatters a concave union with a hole as CSG builds it, without doubled or hole-filling pieces', () => {
    const scene = multiScene();
    multiBox(scene, 1, [0, 0, 0]);
    multiBox(scene, 1, [0.5, 0, 0]);
    multiBox(scene, 0.5, [0.25, 0, 0.4], SolidOperation.Subtractive);
    const volume = multiVolume([MULTI_SHATTER], 6);
    scene.world.add(volume);
    const pieces = multiCompile(scene);
    expect(pieces.every((piece) => piece.operation === SolidOperation.Additive)).toBe(true);
    const run = multiRunOf(volume);
    const kept = run?.fracture.pieces.reduce((sum, piece) => sum + piece.volume, 0) ?? 0;
    expect(kept + (run?.fracture.droppedVolume ?? 0)).toBeCloseTo(1.5 - 0.5 * 0.5 * 0.35, 5);
    multiExpectSoundPieces(run);
    const holeWalls = run?.fracture.pieces
      .flatMap((piece) => piece.faces)
      .filter((face) => face.sourceInputIndex === 2);
    expect(holeWalls?.length ?? 0).toBeGreaterThan(0);
  });

  it('keeps the same hash on every compile and the same pieces when the scene is built again', () => {
    const build = () => {
      const scene = multiScene();
      multiBox(scene, 1, [0, 0, 0]);
      multiBox(scene, 1, [0.5, 0, 0]);
      multiBox(scene, 0.5, [0.25, 0, 0.4], SolidOperation.Subtractive);
      const volume = multiVolume([MULTI_SHATTER], 6);
      scene.world.add(volume);
      multiCompile(scene);
      const first = multiRunOf(volume)?.inputHash;
      multiCompile(scene);
      const run = multiRunOf(volume);
      expect(run?.inputHash).toBe(first);
      return {
        keys: run?.fracture.pieces.map((piece) => piece.key),
        hulls: run?.fracture.pieces.map((piece) => Array.from(piece.hull)),
      };
    };
    expect(build()).toEqual(build());
  });
});

describe('physics shatter input brush ids', () => {
  it('lists every gathered brush in order, also one fully covered by a later brush, and hides exactly those', () => {
    const scene = multiScene();
    const group = new THREE.Group();
    markAsSolidCsgGroup(group, SolidOperation.Additive);
    scene.model.root.add(group);
    const covered = multiBox(scene, 0.5, [0, 0, 0], SolidOperation.Additive, group);
    const cover = multiBox(scene, 1, [0, 0, 0], SolidOperation.Additive, group);
    const hole = multiBox(scene, 0.25, [0, 0, 0.45], SolidOperation.Subtractive, group);
    const outside = multiBox(scene, 1, [9, 0, 0]);
    const volume = multiVolume([MULTI_SHATTER], 4);
    scene.world.add(volume);
    scene.world.updateMatrixWorld(true);
    scene.model.syncBrushOrderFromScene();
    const result = modifierStackCompile(scene.model.getBrushes(), scene.model.root);
    const run = multiRunOf(volume);
    expect(run?.inputBrushIds).toEqual([covered.id, cover.id, hole.id]);
    expect(run?.fracture.pieces.some((piece) => piece.sourceBrushId === covered.id)).toBe(false);
    const hidden = result.instances.filter((brush) => !brush.visible).map((brush) => brush.id);
    expect(new Set(hidden)).toEqual(new Set(run?.inputBrushIds));
    expect(hidden).not.toContain(outside.id);
  });
});

describe('physics shatter of thick brushes', () => {
  it('crumbles a 4 m cube into 3D chunks, inner ones included, and simulates them', async () => {
    const scene = multiScene();
    multiBox(scene, 4, [0, 2, 0]);
    const volume = multiVolume(
      [
        {
          kind: 'physicsShatter',
          parameters: { material: 'custom', crackSize: 1, duration: 1, impactZ: -2, directionZ: 1 },
        },
      ],
      10,
    );
    volume.position.set(0, 2, 0);
    scene.world.add(volume);
    const unbroken = multiCompile(scene);
    expect(unbroken.length).toBeGreaterThan(40);
    expect(multiNetVolume(unbroken)).toBeCloseTo(64, 3);
    const run = multiRunOf(volume);
    multiExpectSoundPieces(run);
    const inner = run?.fracture.pieces.filter((piece) => piece.faces.every((face) => face.kind === 'crack')) ?? [];
    expect(inner.length).toBeGreaterThan(0);
    expect((await multiSimulate(volume)).at(-1)).toMatch(/^Simulated /);
    expect(multiNetVolume(multiCompile(scene))).toBeCloseTo(64, 3);
  });
});
