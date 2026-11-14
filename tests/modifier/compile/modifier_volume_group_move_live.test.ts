import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandStack } from '@/commands/command_stack.js';
import { CommandTransformTranslate } from '@/transform/commands/command_transform_translate.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidModelController } from '@/solid/controller/solid_model_controller.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierVolumeTemplateEntries } from '@/modifier/stack/modifier_volume_templates.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';

/** Lightweight stand-in for the solid tools panel. */
class MockSolidPanel {
  /**
   * Ignores the active model.
   *
   * @param _model Solid model, or null.
   */
  setModel(_model: SolidModel | null): void {
    void _model;
  }

  /**
   * Returns no model.
   *
   * @returns Null.
   */
  getModel(): SolidModel | null {
    return null;
  }

  /** No-op refresh. */
  refresh(): void {
    return;
  }
}

/** Animation frame callbacks waiting to run. */
let pendingFrames: FrameRequestCallback[] = [];

/** Runs every queued animation frame, including frames they queue. */
function framesRun(): void {
  while (pendingFrames.length > 0) {
    const frames = pendingFrames;
    pendingFrames = [];
    for (const frame of frames) frame(0);
  }
}

/**
 * Builds the structure of the reported scene: a solid CSG group holding a box
 * brush, a column generator and a linear array volume.
 *
 * @returns Fixture parts.
 */
function henryMoveThisScene() {
  const world = new THREE.Group();
  const model = new SolidModel('DefaultModel');
  world.add(model.root);
  const group = new THREE.Group();
  group.name = 'MoveThis';
  markAsSolidCsgGroup(group, SolidOperation.Additive);
  model.root.add(group);
  const brush = model.addBoxBrush(1, SolidOperation.Additive, group);
  const column = modifierGeneratorNodeCreate('column');
  column.position.set(-0.5, 1.25, 0);
  column.scale.set(1, 3, 1);
  group.add(column);
  const volume = ModifierVolume.create({ modifiers: modifierVolumeTemplateEntries(['linear']) });
  volume.position.set(-0.4999, 1.8751, 0.2501);
  volume.scale.set(1.5, 4.25, 1);
  group.add(volume);
  world.updateMatrixWorld(true);
  modifierBevelRefreshScene(world);
  const stack = new CommandStack(16);
  const controller = new SolidModelController(world, stack, new ManagerSelection(), new MockSolidPanel() as never);
  const resultBounds = (): THREE.Box3 => {
    world.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(model.getResultMesh(), true);
  };
  const liveMeshes = (): THREE.Mesh[] =>
    [brush.mesh, column, volume].filter((object): object is THREE.Mesh => object instanceof THREE.Mesh);
  return { world, model, group, brush, column, volume, stack, controller, resultBounds, liveMeshes };
}

/**
 * Records a translate already applied to an object, matching the editor's
 * live-drag then commit path.
 *
 * @param stack Command stack.
 * @param object Transformed object.
 * @param original Position before the drag.
 * @param finalPosition Position after the drag.
 */
function recordTranslate(
  stack: CommandStack,
  object: THREE.Object3D,
  original: THREE.Vector3,
  finalPosition: THREE.Vector3,
): void {
  stack.recordExecuted(
    new CommandTransformTranslate([{ object, position: original, finalPosition }], finalPosition.clone().sub(original)),
  );
}

beforeEach(() => {
  pendingFrames = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => pendingFrames.push(callback));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('plain movement of a group holding a brush, generator and array volume', () => {
  it('moves the compiled result and the authored brush with the group during a live drag and commit', () => {
    const fixture = henryMoveThisScene();
    const start = fixture.resultBounds();
    const startCenter = start.getCenter(new THREE.Vector3());
    const startBrush = fixture.brush.mesh!.getWorldPosition(new THREE.Vector3());
    const delta = new THREE.Vector3(4, 0, 0);
    fixture.group.position.copy(delta);
    fixture.controller.onTransformsLive(fixture.liveMeshes());
    framesRun();
    const live = fixture.resultBounds();
    expect(live.getCenter(new THREE.Vector3()).x, 'live result should follow the group').toBeCloseTo(
      startCenter.x + 4,
      2,
    );
    expect(
      fixture.brush.mesh!.getWorldPosition(new THREE.Vector3()).x,
      'authored brush should follow the group',
    ).toBeCloseTo(startBrush.x + 4, 5);
    fixture.controller.onTransformsCommitted(fixture.liveMeshes());
    const committed = fixture.resultBounds();
    expect(committed.getCenter(new THREE.Vector3()).x, 'committed result should follow the group').toBeCloseTo(
      startCenter.x + 4,
      2,
    );
    expect(committed.getSize(new THREE.Vector3()).length()).toBeCloseTo(start.getSize(new THREE.Vector3()).length(), 2);
  });

  it('moves the compiled result when only the array volume is dragged', () => {
    const fixture = henryMoveThisScene();
    const start = fixture.resultBounds();
    fixture.volume.position.x += 3;
    fixture.controller.onTransformsLive([fixture.volume]);
    framesRun();
    fixture.controller.onTransformsCommitted([fixture.volume]);
    expect(fixture.resultBounds().equals(start), 'moving the volume should change the compiled result').toBe(false);
  });

  it('keeps the compiled result covering an authored brush that is dragged on its own', () => {
    const fixture = henryMoveThisScene();
    const start = fixture.resultBounds();
    const startBrush = fixture.brush.mesh!.getWorldPosition(new THREE.Vector3());
    fixture.brush.mesh!.position.x += 3;
    fixture.controller.onTransformsLive([fixture.brush.mesh!]);
    framesRun();
    fixture.controller.onTransformsCommitted([fixture.brush.mesh!]);
    const brushWorld = fixture.brush.mesh!.getWorldPosition(new THREE.Vector3());
    expect(brushWorld.x).toBeCloseTo(startBrush.x + 3, 5);
    const result = fixture.resultBounds();
    expect(result.equals(start), 'moving the authored brush should change the compiled result').toBe(false);
    const brushBox = new THREE.Box3().setFromObject(fixture.brush.mesh!, true);
    expect(result.containsBox(brushBox), 'result should still cover the moved authored brush').toBe(true);
  });

  it('moves generated column pieces when only the generator node is dragged', () => {
    const fixture = henryMoveThisScene();
    const start = fixture.resultBounds();
    const startColumn = fixture.column.getWorldPosition(new THREE.Vector3());
    fixture.column.position.y += 2;
    fixture.controller.onTransformsLive([fixture.column]);
    framesRun();
    fixture.controller.onTransformsCommitted([fixture.column]);
    expect(fixture.column.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(startColumn.y + 2, 5);
    expect(fixture.resultBounds().equals(start), 'moving the generator should change the compiled result').toBe(false);
  });
});

describe('undo and redo after moving that group', () => {
  it('keeps the result and the authored brush with the group on move, undo and redo', () => {
    const fixture = henryMoveThisScene();
    const start = fixture.resultBounds();
    const startCenter = start.getCenter(new THREE.Vector3());
    const startBrush = fixture.brush.mesh!.getWorldPosition(new THREE.Vector3());
    const original = fixture.group.position.clone();
    const finalPosition = original.clone().add(new THREE.Vector3(4, 0, 0));
    fixture.group.position.copy(finalPosition);
    fixture.controller.onTransformsLive(fixture.liveMeshes());
    framesRun();
    recordTranslate(fixture.stack, fixture.group, original, finalPosition);
    fixture.controller.onTransformsCommitted(fixture.liveMeshes());
    expect(fixture.resultBounds().getCenter(new THREE.Vector3()).x).toBeCloseTo(startCenter.x + 4, 2);
    expect(fixture.brush.mesh!.getWorldPosition(new THREE.Vector3()).x).toBeCloseTo(startBrush.x + 4, 5);
    fixture.stack.undo();
    SolidModel.refreshAfterHistoryChange(fixture.world);
    expect(fixture.resultBounds().getCenter(new THREE.Vector3()).x, 'undo result').toBeCloseTo(startCenter.x, 2);
    expect(fixture.brush.mesh!.getWorldPosition(new THREE.Vector3()).x, 'undo brush').toBeCloseTo(startBrush.x, 5);
    fixture.stack.redo();
    SolidModel.refreshAfterHistoryChange(fixture.world);
    expect(fixture.resultBounds().getCenter(new THREE.Vector3()).x, 'redo result').toBeCloseTo(startCenter.x + 4, 2);
    expect(fixture.brush.mesh!.getWorldPosition(new THREE.Vector3()).x, 'redo brush').toBeCloseTo(startBrush.x + 4, 5);
  });
});
