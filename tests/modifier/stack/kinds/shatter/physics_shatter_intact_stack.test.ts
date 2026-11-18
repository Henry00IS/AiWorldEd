import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import {
  physicsShatterLastRunOf,
  type PhysicsShatterLastRun,
} from '@/modifier/stack/kinds/shatter/physics_shatter_last_run.js';
import { physicsShatterBrushVolume } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_geometry.js';
import { physicsShatterSimulateAction } from '@/modifier/stack/kinds/shatter/sim/physics_shatter_simulate.js';
import { stackFixtureEntries, type StackFixtureStep } from '../../modifier_stack_fixture.js';

/** Physics Shatter with Shatter off and a short, gentle simulation. */
const INTACT_STEP: StackFixtureStep = {
  kind: 'physicsShatter',
  parameters: { shatter: false, strength: 0, duration: 2 },
};

/** Three copies of whatever comes before, two metres apart. */
const INTACT_ARRAY_STEP: StackFixtureStep = {
  kind: 'linear',
  parameters: { mode: 'Fixed Step', offsetX: 2, count: 3 },
};

/** A solid in its own world. */
interface IntactScene {
  world: THREE.Group;
  model: SolidModel;
}

/**
 * Builds an empty solid inside a fresh world.
 *
 * @returns Scene.
 */
function intactScene(): IntactScene {
  const world = new THREE.Group();
  const model = new SolidModel('intact');
  world.add(model.root);
  return { world, model };
}

/**
 * Adds a box brush of a size at a position with its own texture.
 *
 * @param scene Scene.
 * @param size Box size.
 * @param position Centre.
 * @param texture Texture id of every face.
 * @param operation CSG operation.
 * @param parent Group to add it to, or the solid root.
 * @returns Brush.
 */
function intactBox(
  scene: IntactScene,
  size: THREE.Vector3Tuple,
  position: THREE.Vector3Tuple,
  texture: string,
  operation = SolidOperation.Additive,
  parent?: THREE.Object3D,
): SolidBrushInstance {
  const brush = scene.model.addBoxBrush(1, operation, parent);
  brush.mesh?.scale.set(...size);
  brush.mesh?.position.set(...position);
  brush.surfaceTextureId = texture;
  return brush;
}

/**
 * Adds a Physics Shatter volume.
 *
 * @param parent Node to add it to.
 * @param steps Steps of the volume.
 * @param scale Edge length.
 * @returns Volume.
 */
function intactVolume(parent: THREE.Object3D, steps: StackFixtureStep[], scale: number): THREE.Object3D {
  const volume = ModifierVolume.create({ modifiers: stackFixtureEntries(steps) });
  volume.scale.setScalar(scale);
  parent.add(volume);
  return volume;
}

/**
 * Compiles the scene and returns its visible brushes.
 *
 * @param scene Scene.
 * @returns Visible brushes.
 */
function intactCompile(scene: IntactScene): SolidBrushInstance[] {
  scene.world.updateMatrixWorld(true);
  scene.model.syncBrushOrderFromScene();
  return modifierStackCompile(scene.model.getBrushes(), scene.model.root).instances.filter((brush) => brush.visible);
}

/**
 * Returns the last run of an owner's Physics Shatter step.
 *
 * @param owner Volume or generator node.
 * @returns Last run.
 */
function intactRunOf(owner: THREE.Object3D): PhysicsShatterLastRun | undefined {
  const step = ModifierVolume.read(owner).modifiers.find((entry) => entry.kind === 'physicsShatter');
  return physicsShatterLastRunOf(owner.uuid, step?.id ?? '');
}

/**
 * Presses Simulate on an owner's Physics Shatter step.
 *
 * @param owner Volume or generator node.
 * @returns Status lines.
 */
async function intactSimulate(owner: THREE.Object3D): Promise<string[]> {
  const statuses: string[] = [];
  const stepId = ModifierVolume.read(owner).modifiers.find((entry) => entry.kind === 'physicsShatter')?.id ?? '';
  await physicsShatterSimulateAction({ volume: owner, stepId, commandStack: null, status: (t) => statuses.push(t) });
  return statuses;
}

/**
 * Sums model-space volumes.
 *
 * @param brushes Brushes.
 * @returns Volume.
 */
function intactVolumeOf(brushes: readonly SolidBrushInstance[]): number {
  return brushes.reduce((sum, brush) => sum + physicsShatterBrushVolume(brush.getModelSpaceBrush()), 0);
}

/**
 * Lists the texture of every face of a brush.
 *
 * @param brush Brush.
 * @returns Texture ids in face order.
 */
function intactTextures(brush: SolidBrushInstance): string[] {
  return brush.brush.faces.map((face, index) => brush.getFaceSurface(face.surfaceIndex ?? index).textureId);
}

/**
 * Builds a leaning tower: a floor slab and three crates, each set further out
 * than the one below, so the top tips over.
 *
 * @returns Scene, the authored brushes and the volume.
 */
function intactTower(): { scene: IntactScene; brushes: SolidBrushInstance[]; volume: THREE.Object3D } {
  const scene = intactScene();
  const brushes = [
    intactBox(scene, [1, 1, 1], [0, 0.5, 0], 'crate_a'),
    intactBox(scene, [1, 1, 1], [0.45, 1.5, 0], 'crate_b'),
    intactBox(scene, [1, 1, 1], [0.9, 2.5, 0], 'crate_c'),
  ];
  const floor = intactBox(scene, [20, 0.5, 20], [0, -0.25, 0], 'floor');
  floor.mesh?.removeFromParent();
  scene.model.root.add(floor.mesh as THREE.Object3D);
  const volume = intactVolume(scene.world, [INTACT_STEP], 4);
  volume.scale.y = 3.4;
  volume.position.set(0.5, 1.75, 0);
  return { scene, brushes, volume };
}

describe('physics shatter with Shatter off in the editor', { timeout: 30_000 }, () => {
  it('gives back one brush per input, in place, with every face keeping its texture', () => {
    const { scene, brushes, volume } = intactTower();
    const outputs = intactCompile(scene).filter((brush) => brush.id.includes('#'));
    expect(outputs.length).toBe(brushes.length);
    expect(intactRunOf(volume)?.fracture.pieces.every((piece) => piece.bodyId === undefined)).toBe(true);
    brushes.forEach((source) => {
      const output = outputs.find((brush) => brush.id.startsWith(`${source.id}#`));
      expect(output, source.id).toBeDefined();
      if (!output) return;
      const before = source.getModelSpaceBrush().vertices;
      output.getModelSpaceBrush().vertices.forEach((vertex, index) => {
        expect(vertex.distanceTo(before[index] ?? new THREE.Vector3())).toBeLessThan(1e-9);
      });
      expect(intactTextures(output)).toEqual(intactTextures(source));
    });
  });

  it('collapses the leaning tower on Simulate and still gives back one brush per input', async () => {
    const { scene, brushes, volume } = intactTower();
    const before = intactCompile(scene).filter((brush) => brush.id.includes('#'));
    expect((await intactSimulate(volume)).at(-1)).toMatch(/^Simulated /);
    const after = intactCompile(scene).filter((brush) => brush.id.includes('#'));
    expect(after.length).toBe(brushes.length);
    expect(intactVolumeOf(after)).toBeCloseTo(intactVolumeOf(before), 4);
    const top = (list: SolidBrushInstance[]) => list.find((brush) => brush.id.startsWith(`${brushes[2]?.id}#`));
    const fell =
      (top(before)?.getModelSpaceBrush().vertices[0]?.y ?? 0) - (top(after)?.getModelSpaceBrush().vertices[0]?.y ?? 0);
    expect(fell).toBeGreaterThan(0.3);
  });

  it('keeps the brushes of a turned group whole', () => {
    const scene = intactScene();
    const group = new THREE.Group();
    markAsSolidCsgGroup(group, SolidOperation.Additive);
    group.position.set(3, 0, 0);
    group.rotation.y = 0.5;
    scene.model.root.add(group);
    for (const x of [0, 1]) intactBox(scene, [1, 1, 1], [x, 0, 0], 'g', SolidOperation.Additive, group);
    const volume = intactVolume(group, [INTACT_STEP], 6);
    const outputs = intactCompile(scene);
    expect(outputs.length).toBe(2);
    expect(intactVolumeOf(outputs)).toBeCloseTo(2, 6);
    expect(intactRunOf(volume)?.fracture.pieces.length).toBe(2);
  });

  it('keeps every copy of an Array step whole', () => {
    const scene = intactScene();
    intactBox(scene, [1, 1, 1], [0, 0, 0], 'a');
    intactVolume(scene.world, [INTACT_ARRAY_STEP, INTACT_STEP], 12);
    const outputs = intactCompile(scene);
    expect(outputs.length).toBe(3);
    expect(intactVolumeOf(outputs)).toBeCloseTo(3, 6);
  });

  it('keeps the brushes a Column generator makes, repeated by an Array, one body per brush', () => {
    const scene = intactScene();
    const node = modifierGeneratorNodeCreate('column');
    node.scale.set(2, 2, 2);
    scene.model.root.add(node);
    const settings = ModifierVolume.read(node);
    const [column] = settings.modifiers;
    if (!column) throw new Error('Column step is missing');
    const reference = { ...settings, modifiers: [column, ...stackFixtureEntries([INTACT_ARRAY_STEP])] };
    ModifierVolume.write(node, reference);
    const made = intactCompile(scene).filter((brush) => brush.id.startsWith(`${node.uuid}#`));
    ModifierVolume.write(node, {
      ...reference,
      modifiers: [...reference.modifiers, ...stackFixtureEntries([INTACT_STEP])],
    });
    const kept = intactCompile(scene).filter((brush) => brush.id.startsWith(`${node.uuid}#`));
    const run = intactRunOf(node);
    expect(run?.inputBrushIds.length).toBe(made.length);
    const bodies = new Set(run?.fracture.pieces.map((piece) => piece.bodyId ?? `whole ${piece.sourceIndex}`));
    expect(bodies.size).toBe(made.length);
    expect(kept.length).toBe(run?.fracture.pieces.length);
    expect(intactVolumeOf(kept)).toBeCloseTo(intactVolumeOf(made), 4);
  });

  it('splits a wall with a window into parts of one body and simulates them', async () => {
    const scene = intactScene();
    intactBox(scene, [4, 3, 0.25], [0, 1.5, 0], 'wall');
    intactBox(scene, [1.2, 1.2, 0.6], [0, 1.6, 0], 'frame', SolidOperation.Subtractive);
    const volume = intactVolume(scene.world, [INTACT_STEP], 6);
    const outputs = intactCompile(scene);
    const run = intactRunOf(volume);
    expect(run?.fracture.pieces.length).toBe(4);
    expect(new Set(run?.fracture.pieces.map((piece) => piece.bodyId))).toEqual(new Set([0]));
    expect(outputs.filter((brush) => brush.operation === SolidOperation.Additive).length).toBe(4);
    expect(intactVolumeOf(outputs.filter((brush) => brush.id.includes('#')))).toBeCloseTo(
      4 * 3 * 0.25 - 1.2 * 1.2 * 0.25,
      6,
    );
    const textures = new Set(outputs.flatMap(intactTextures));
    expect(textures).toEqual(new Set(['wall', 'frame']));
    expect((await intactSimulate(volume)).at(-1)).toMatch(/^Simulated /);
  });
});
