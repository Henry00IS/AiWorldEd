import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { HandlerAlignment } from '@/outliner/alignment/handler_alignment.js';
import { ControllerAlignment } from '@/outliner/alignment/controller_alignment.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidModelController } from '@/solid/controller/solid_model_controller.js';
import { SolidModelPanel } from '@/solid/ui/panel/solid_model_panel.js';
import {
  refreshSceneVisualsAfterTransformCommit,
  type SceneTransformCommitVisualHost,
} from '@/layout/refresh/scene_visual_refresh.js';

/**
 * Align must go through transform-commit refresh so solid CSG and brush
 * wireframes update immediately — not a bare viewport reclone.
 */
describe('HandlerAlignment solid pose commit', () => {
  it('finalizes solid CSG after align so the result matches the moved brush', () => {
    const world = new THREE.Group();
    const model = new SolidModel('AlignSolid');
    world.add(model.root);
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const brushMesh = brush.mesh!;
    brushMesh.position.set(4, 0, 0);
    brushMesh.updateMatrixWorld(true);
    model.syncBrushesFromScene();
    model.rebuild(true);
    const centerBefore = readResultBoundingCenter(model);

    const stack = new CommandStack(16);
    const selection = new ManagerSelection();
    selection.selectObject(brushMesh);
    const handler = new HandlerAlignment(new ControllerAlignment(), stack, selection, new GridSnap(true, 1));
    const solidController = new SolidModelController(
      world,
      stack,
      selection,
      new SolidModelPanel(document.createElement('div'), { onAddBrush: () => undefined }),
    );
    let finalizeCalls = 0;
    handler.setAfterTransformCommit((objects) => {
      const host = createTransformCommitHost(() => {
        finalizeCalls += 1;
        return solidController.onTransformsCommitted(
          objects.filter((object): object is THREE.Mesh => object instanceof THREE.Mesh),
        );
      });
      refreshSceneVisualsAfterTransformCommit(host, objects);
    });

    handler.onAlignToOrigin();

    expect(finalizeCalls).toBe(1);
    expect(brushMesh.position.x).toBeCloseTo(0, 5);
    const centerAfter = readResultBoundingCenter(model);
    expect(centerAfter.x).toBeLessThan(centerBefore.x - 1);
  });
});

/**
 * Builds a transform-commit host that only tracks solid finalize.
 *
 * @param finalizeSolidTransforms Solid finalize callback.
 * @returns Host for refreshSceneVisualsAfterTransformCommit.
 */
function createTransformCommitHost(
  finalizeSolidTransforms: (meshes: THREE.Mesh[]) => boolean,
): SceneTransformCommitVisualHost {
  return {
    syncSelectionVisualsDuringTransform: () => undefined,
    syncPrimitivesToViewports: () => undefined,
    ensureWorldMatricesCurrent: () => undefined,
    endCadRulerDrag: () => undefined,
    refreshCadRulersFromSelection: () => undefined,
    updateGizmoVisibility: () => undefined,
    updateGizmoPivot: () => undefined,
    finalizeSolidTransforms,
  };
}

/**
 * Reads the world-space center of the solid result mesh bounds.
 *
 * @param model Solid model.
 * @returns Bounding-box center.
 */
function readResultBoundingCenter(model: SolidModel): THREE.Vector3 {
  const result = model.getResultMeshForSync();
  result.updateMatrixWorld(true);
  result.geometry.computeBoundingBox();
  const box = result.geometry.boundingBox!.clone();
  box.applyMatrix4(result.matrixWorld);
  return box.getCenter(new THREE.Vector3());
}
