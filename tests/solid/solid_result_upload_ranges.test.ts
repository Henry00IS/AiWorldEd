import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidModelController } from '@/solid/controller/solid_model_controller.js';
import { CommandStack } from '@/commands/command_stack.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { SolidResultUploadRanges } from '@/solid/mesh/solid_result_upload_ranges.js';
import { SolidGpuUploadMirror } from './solid_gpu_upload_mirror_fixture.js';

/** Lightweight stand-in for the solid tools panel used by the controller. */
class SolidUploadTestPanel {
  setModel(): void {
    return;
  }

  getModel(): null {
    return null;
  }

  refresh(): void {
    return;
  }
}

/** Animation frame callbacks queued by the controller, run on demand. */
let queuedFrameCallbacks: Array<() => void> = [];
const originalRequestAnimationFrame = globalThis.requestAnimationFrame;

/** Queues animation frame callbacks instead of running them. */
function animationFramesQueue(): void {
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    queuedFrameCallbacks.push(() => callback(0));
    return queuedFrameCallbacks.length;
  }) as typeof requestAnimationFrame;
}

/** Runs every queued animation frame callback once. */
function animationFramesRun(): void {
  const callbacks = queuedFrameCallbacks;
  queuedFrameCallbacks = [];
  for (const callback of callbacks) callback();
}

/**
 * Builds a solid with one box brush under a world group, compiled and drawn.
 *
 * @param mirror GPU mirror that draws the first result.
 * @returns World, model, box size and first brush.
 */
function solidWithBoxCreate(mirror: SolidGpuUploadMirror) {
  const world = new THREE.Group();
  const model = new SolidModel('UploadRanges');
  world.add(model.root);
  const boxSize = 2;
  const first = model.addBoxBrush(boxSize, SolidOperation.Additive);
  world.updateMatrixWorld(true);
  model.syncBrushesFromScene();
  model.rebuild(true);
  mirror.draw(model.getResultMesh());
  return { world, model, boxSize, first };
}

/**
 * Returns triangles the GPU draws that the CPU result no longer holds.
 *
 * @param mirror GPU mirror.
 * @param model Solid model.
 * @returns Stale triangle keys.
 */
function staleDrawnTriangles(mirror: SolidGpuUploadMirror, model: SolidModel): string[] {
  const current = new Set(SolidGpuUploadMirror.cpuTriangleKeys(model.getResultMesh()));
  return mirror.drawnTriangleKeys(model.getResultMesh()).filter((key) => !current.has(key));
}

/**
 * Moves a brush mesh by an offset and refreshes its world matrix.
 *
 * @param mesh Brush mesh.
 * @param offset Offset to add.
 */
function brushMeshMove(mesh: THREE.Mesh, offset: THREE.Vector3): void {
  mesh.position.add(offset);
  mesh.updateMatrixWorld(true);
}

/**
 * Drags a brush diagonally away in three samples. Each frame draws first and
 * runs the queued live flush afterwards, as the browser runs the render loop
 * callback before the flush scheduled by a later pointer event.
 *
 * @param controller Solid controller receiving the live samples.
 * @param mirror GPU mirror that draws each frame.
 * @param model Solid model.
 * @param mesh Dragged brush mesh.
 * @param boxSize Box edge length used to size the steps.
 */
function duplicateDragWithFlushAfterEachDraw(
  controller: SolidModelController,
  mirror: SolidGpuUploadMirror,
  model: SolidModel,
  mesh: THREE.Mesh,
  boxSize: number,
): void {
  const steps = [
    new THREE.Vector3(boxSize / 2, 0, -boxSize / 4),
    new THREE.Vector3(boxSize / 2, 0, -boxSize / 4),
    new THREE.Vector3(boxSize / 2, -boxSize / 4, -boxSize / 4),
  ];
  for (const step of steps) {
    brushMeshMove(mesh, step);
    controller.onTransformsLive([mesh]);
    mirror.draw(model.getResultMesh());
    animationFramesRun();
  }
}

/** GPU upload windows of the solid result geometry. */
describe('Solid result upload ranges', () => {
  afterEach(() => {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    queuedFrameCallbacks = [];
  });

  it('keeps windows that are still waiting for upload when another write queues its own', () => {
    const attribute = new THREE.BufferAttribute(new Float32Array(30), 3);
    SolidResultUploadRanges.queueWindow(attribute, 0, 6);
    SolidResultUploadRanges.queueWindow(attribute, 18, 6);
    expect(attribute.updateRanges).toEqual([
      { start: 0, count: 6 },
      { start: 18, count: 6 },
    ]);
  });

  it('does not let a later partial write narrow a waiting whole-buffer upload', () => {
    const attribute = new THREE.BufferAttribute(new Float32Array(30), 3);
    SolidResultUploadRanges.queueWindow(attribute, 3, 3);
    SolidResultUploadRanges.queueWholeBuffer(attribute);
    SolidResultUploadRanges.queueWindow(attribute, 9, 3);
    const covered = new Set<number>();
    for (const range of attribute.updateRanges)
      for (let index = range.start; index < range.start + range.count; index++) covered.add(index);
    expect(covered.size).toBe(attribute.array.length);
  });

  it('turns too many waiting windows into one whole-buffer window', () => {
    const attribute = new THREE.BufferAttribute(new Float32Array(3000), 3);
    for (let window = 0; window <= SolidResultUploadRanges.maximumWaitingWindows; window++)
      SolidResultUploadRanges.queueWindow(attribute, window * 6, 3);
    expect(attribute.updateRanges).toEqual([{ start: 0, count: attribute.array.length }]);
  });

  it('draws both live moves when two brushes move between two frames', () => {
    const mirror = new SolidGpuUploadMirror();
    const { world, model, boxSize, first } = solidWithBoxCreate(mirror);
    const second = model.addBoxBrush(boxSize, SolidOperation.Additive);
    brushMeshMove(second.mesh!, new THREE.Vector3(boxSize * 4, 0, 0));
    world.updateMatrixWorld(true);
    model.syncBrushesFromScene();
    model.rebuild(true);
    mirror.draw(model.getResultMesh());
    for (const brush of [first, second]) {
      brushMeshMove(brush.mesh!, new THREE.Vector3(0, 0, boxSize / 4));
      model.prepareLiveBrushEdit([brush.mesh!]);
      model.rebuildLive();
    }
    mirror.draw(model.getResultMesh());
    expect(staleDrawnTriangles(mirror, model)).toEqual([]);
  });

  it('draws the regained face of a box after its duplicate is dragged away and released before the next frame', () => {
    animationFramesQueue();
    const mirror = new SolidGpuUploadMirror();
    const { world, model, boxSize, first } = solidWithBoxCreate(mirror);
    const controller = new SolidModelController(
      world,
      new CommandStack(8),
      new ManagerSelection(),
      new SolidUploadTestPanel() as never,
    );
    const duplicate = model.duplicateBrush(first.id)!;
    world.updateMatrixWorld(true);
    model.rebuild();
    mirror.draw(model.getResultMesh());
    duplicateDragWithFlushAfterEachDraw(controller, mirror, model, duplicate.mesh!, boxSize);
    controller.onTransformsCommitted([duplicate.mesh!]);
    mirror.draw(model.getResultMesh());
    expect(staleDrawnTriangles(mirror, model)).toEqual([]);
  });
});
