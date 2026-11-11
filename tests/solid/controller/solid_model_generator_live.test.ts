import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandStack } from '@/commands/command_stack.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidModelController } from '@/solid/controller/solid_model_controller.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { CommandTransformTranslate } from '@/transform/commands/command_transform_translate.js';

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
 * Builds a world with a solid holding one box brush and a generator node,
 * evaluated once, plus a controller.
 *
 * @param kind Generator kind id.
 * @returns Fixture parts.
 */
function liveFixture(kind: string) {
  const world = new THREE.Group();
  const model = new SolidModel('Live generator');
  world.add(model.root);
  model.addBoxBrush(1, SolidOperation.Additive).mesh!.position.set(-6, 0, 0);
  model.getBrushes()[0]!.pullTransformFromMesh();
  const node = modifierGeneratorNodeCreate(kind);
  model.root.add(node);
  modifierBevelRefreshScene(world);
  const stack = new CommandStack(16);
  const controller = new SolidModelController(world, stack, new ManagerSelection(), new MockSolidPanel() as never);
  const instance = modifierStackKindFind(kind) as unknown as { buildPieces: (...args: unknown[]) => unknown };
  const builds = vi.spyOn(instance, 'buildPieces');
  const bounds = (): THREE.Box3 => {
    world.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(model.getResultMesh(), true);
  };
  return { world, model, node, stack, controller, builds, bounds };
}

beforeEach(() => {
  pendingFrames = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => pendingFrames.push(callback));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('generator nodes update live while transformed', () => {
  it('moves and turns the generated pieces every frame of a drag without building them again', () => {
    for (const kind of ['arch', 'column', 'stairs']) {
      const fixture = liveFixture(kind);
      const start = fixture.bounds();
      for (const step of [1, 2, 3]) {
        fixture.node.position.z = step * 2;
        if (kind !== 'stairs') fixture.node.rotation.y = step * 0.2;
        fixture.controller.onTransformsLive([fixture.node]);
        framesRun();
        expect(fixture.bounds().max.z, `${kind} frame ${step}`).toBeGreaterThan(start.max.z + step * 2 - 0.75);
      }
      expect(fixture.builds).not.toHaveBeenCalled();
      fixture.controller.onTransformsCommitted([fixture.node]);
      expect(fixture.builds).not.toHaveBeenCalled();
      expect(fixture.stack.getUndoCount()).toBe(0);
    }
  });

  it('rebuilds a resized generator every frame of a scale drag, not only when the drag ends', () => {
    for (const kind of ['arch', 'column', 'stairs']) {
      const fixture = liveFixture(kind);
      const start = fixture.bounds();
      fixture.node.scale.multiplyScalar(1.5);
      fixture.controller.onTransformsLive([fixture.node]);
      framesRun();
      expect(fixture.builds, kind).toHaveBeenCalledTimes(1);
      expect(fixture.bounds().getSize(new THREE.Vector3()).y, kind).toBeGreaterThan(
        start.getSize(new THREE.Vector3()).y + 0.4,
      );
      fixture.node.scale.multiplyScalar(1.25);
      fixture.controller.onTransformsLive([fixture.node]);
      framesRun();
      expect(fixture.builds, kind).toHaveBeenCalledTimes(2);
      fixture.controller.onTransformsCommitted([fixture.node]);
      expect(fixture.builds, kind).toHaveBeenCalledTimes(2);
    }
  });

  it('coalesces several drag samples into one evaluation per frame', () => {
    const fixture = liveFixture('arch');
    for (const scale of [1.1, 1.2, 1.3, 1.4]) {
      fixture.node.scale.x = scale * 3;
      fixture.controller.onTransformsLive([fixture.node]);
    }
    framesRun();
    expect(fixture.builds).toHaveBeenCalledTimes(1);
  });

  it('moves a generator and a brush dragged together in the same frame', () => {
    const fixture = liveFixture('column');
    const brush = fixture.model.getBrushes()[0]!;
    const start = fixture.bounds();
    fixture.node.position.y += 3;
    brush.mesh!.position.y += 3;
    fixture.controller.onTransformsLive([fixture.node, brush.mesh!]);
    framesRun();
    const moved = fixture.bounds();
    expect(moved.min.y).toBeCloseTo(start.min.y + 3, 5);
    expect(moved.max.y).toBeCloseTo(start.max.y + 3, 5);
    expect(fixture.builds).not.toHaveBeenCalled();
  });

  it('undoes a move in one step, carrying the pieces back without building them again', () => {
    const fixture = liveFixture('arch');
    const start = fixture.bounds();
    const original = fixture.node.position.clone();
    const finalPosition = original.clone().add(new THREE.Vector3(0, 0, 5));
    fixture.node.position.copy(finalPosition);
    fixture.controller.onTransformsLive([fixture.node]);
    framesRun();
    const command = new CommandTransformTranslate(
      [{ object: fixture.node, position: original, finalPosition }],
      finalPosition.clone().sub(original),
    );
    fixture.stack.recordExecuted(command);
    fixture.controller.onTransformsCommitted([fixture.node]);
    expect(fixture.stack.getUndoCount()).toBe(1);
    fixture.stack.undo();
    SolidModel.refreshAfterHistoryChange(fixture.world);
    expect(fixture.node.position.distanceTo(original)).toBeLessThan(1e-9);
    expect(fixture.bounds().max.z).toBeCloseTo(start.max.z, 5);
    expect(fixture.builds).not.toHaveBeenCalled();
  });
});
