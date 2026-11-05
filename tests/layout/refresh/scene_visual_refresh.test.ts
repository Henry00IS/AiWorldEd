import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  refreshSceneVisualsAfterMutation,
  refreshSceneVisualsAfterTransformCommit,
  type SceneMutationVisualHost,
  type SceneTransformCommitVisualHost,
} from '@/layout/refresh/scene_visual_refresh.js';

describe('scene_visual_refresh', () => {
  it('runs the full mutation contract in a fixed order', () => {
    const order: string[] = [];
    const host = createMutationHost(order);
    refreshSceneVisualsAfterMutation(host);
    expect(order).toEqual([
      'syncPrimitivesToViewports',
      'refreshOutliner',
      'updateFaceSelectionMeshes',
      'ensureWorldMatricesCurrent',
      'endCadRulerDrag',
      'refreshCadRulersFromSelection',
      'updateGizmoVisibility',
      'updateGizmoPivot',
      'refreshPropertiesPanel',
    ]);
  });

  it('uses selection visual sync when solid-only commit is handled', () => {
    const order: string[] = [];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const host = createTransformCommitHost(order, true);
    refreshSceneVisualsAfterTransformCommit(host, [mesh]);
    expect(order).toEqual([
      'finalizeSolidTransforms',
      'syncSelectionVisualsDuringTransform',
      'ensureWorldMatricesCurrent',
      'endCadRulerDrag',
      'refreshCadRulersFromSelection',
      'updateGizmoVisibility',
      'updateGizmoPivot',
      'refreshPropertiesPanel',
    ]);
  });

  it('falls back to full viewport sync when solid finalize is not solid-only', () => {
    const order: string[] = [];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const host = createTransformCommitHost(order, false);
    refreshSceneVisualsAfterTransformCommit(host, [mesh]);
    expect(order).toEqual([
      'finalizeSolidTransforms',
      'syncPrimitivesToViewports',
      'ensureWorldMatricesCurrent',
      'endCadRulerDrag',
      'refreshCadRulersFromSelection',
      'updateGizmoVisibility',
      'updateGizmoPivot',
      'refreshPropertiesPanel',
    ]);
  });

  it('always refreshes CAD rulers and gizmo after non-solid inspector transforms', () => {
    const order: string[] = [];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const host = createTransformCommitHost(order, undefined);
    refreshSceneVisualsAfterTransformCommit(host, [mesh]);
    expect(order).toContain('ensureWorldMatricesCurrent');
    expect(order).toContain('endCadRulerDrag');
    expect(order).toContain('refreshCadRulersFromSelection');
    expect(order).toContain('updateGizmoPivot');
    expect(order).toContain('syncPrimitivesToViewports');
    expect(order).not.toContain('finalizeSolidTransforms');
  });

  it('refreshes nested solid selection bounds after parent pose undo', () => {
    const scene = new THREE.Scene();
    const solidRoot = new THREE.Group();
    const resultMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    solidRoot.add(resultMesh);
    scene.add(solidRoot);
    scene.updateMatrixWorld(true);

    solidRoot.position.set(12, 0, 0);
    scene.updateMatrixWorld(true);

    const measured: number[] = [];
    const host = createMutationHost([]);
    host.ensureWorldMatricesCurrent = () => scene.updateMatrixWorld(true);
    host.refreshCadRulersFromSelection = () => {
      resultMesh.updateWorldMatrix(true, false);
      measured.push(resultMesh.matrixWorld.elements[12]!);
    };

    solidRoot.position.set(0, 0, 0);
    expect(solidRoot.matrixWorld.elements[12]).toBeCloseTo(12, 5);
    refreshSceneVisualsAfterMutation(host);
    expect(measured[measured.length - 1]).toBeCloseTo(0, 5);
  });

  it('expands intermediate groups into nested meshes for solid finalize', () => {
    const group = new THREE.Group();
    const nested = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    group.add(nested);
    let finalizeMeshes: THREE.Mesh[] = [];
    const host = createTransformCommitHost([], true);
    host.finalizeSolidTransforms = (meshes) => {
      finalizeMeshes = meshes.slice();
      return true;
    };
    refreshSceneVisualsAfterTransformCommit(host, [group]);
    expect(finalizeMeshes).toEqual([nested]);
  });

  it('passes only the solid result mesh when a solid root group is transformed', async () => {
    const { SolidModel } = await import('@/solid/model/solid_model.js');
    const { SolidOperation } = await import('@/solid/types/solid_operation.js');
    const model = new SolidModel('RootFinalize');
    model.addBoxBrush(2, SolidOperation.Additive);
    let finalizeMeshes: THREE.Mesh[] = [];
    const host = createTransformCommitHost([], true);
    host.finalizeSolidTransforms = (meshes) => {
      finalizeMeshes = meshes.slice();
      return true;
    };
    refreshSceneVisualsAfterTransformCommit(host, [model.root]);
    expect(finalizeMeshes).toEqual([model.getResultMesh()]);
  });
});

/**
 * Builds a mutation host that records call order.
 *
 * @param order Shared call-order log.
 * @returns Mutation visual host.
 */
function createMutationHost(order: string[]): SceneMutationVisualHost {
  return {
    syncPrimitivesToViewports: () => order.push('syncPrimitivesToViewports'),
    refreshOutliner: () => order.push('refreshOutliner'),
    updateFaceSelectionMeshes: () => order.push('updateFaceSelectionMeshes'),
    ensureWorldMatricesCurrent: () => order.push('ensureWorldMatricesCurrent'),
    endCadRulerDrag: () => order.push('endCadRulerDrag'),
    refreshCadRulersFromSelection: () => order.push('refreshCadRulersFromSelection'),
    updateGizmoVisibility: () => order.push('updateGizmoVisibility'),
    updateGizmoPivot: () => order.push('updateGizmoPivot'),
    refreshPropertiesPanel: () => order.push('refreshPropertiesPanel'),
  };
}

/**
 * Builds a transform-commit host that records call order.
 *
 * @param order Shared call-order log.
 * @param solidOnly Whether finalizeSolidTransforms returns true.
 * @returns Transform commit visual host.
 */
function createTransformCommitHost(order: string[], solidOnly: boolean | undefined): SceneTransformCommitVisualHost {
  const host: SceneTransformCommitVisualHost = {
    syncSelectionVisualsDuringTransform: () => order.push('syncSelectionVisualsDuringTransform'),
    syncPrimitivesToViewports: () => order.push('syncPrimitivesToViewports'),
    ensureWorldMatricesCurrent: () => order.push('ensureWorldMatricesCurrent'),
    endCadRulerDrag: () => order.push('endCadRulerDrag'),
    refreshCadRulersFromSelection: () => order.push('refreshCadRulersFromSelection'),
    updateGizmoVisibility: () => order.push('updateGizmoVisibility'),
    updateGizmoPivot: () => order.push('updateGizmoPivot'),
    refreshPropertiesPanel: () => order.push('refreshPropertiesPanel'),
  };
  if (solidOnly !== undefined) {
    host.finalizeSolidTransforms = () => {
      order.push('finalizeSolidTransforms');
      return solidOnly;
    };
  }
  return host;
}

describe('properties panel transform commit hook', () => {
  it('invokes afterTransformCommit when position changes', async () => {
    const { ManagerSelection } = await import('@/selection/object/manager_selection.js');
    const { PanelProperties } = await import('@/ui/properties/panel_properties.js');
    const { CommandStack } = await import('@/commands/command_stack.js');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const selectionManager = new ManagerSelection();
    const panel = new PanelProperties(container, selectionManager);
    const commandStack = new CommandStack(16);
    panel.setCommandStack(commandStack);
    const mesh = new THREE.Mesh();
    mesh.position.set(0, 0, 0);
    panel.bindObject(mesh);
    const afterCommit = vi.fn();
    panel.setAfterTransformCommit(afterCommit);
    const positionSection = container.children[0]!.children[0]!;
    const inputs = positionSection.querySelectorAll('input');
    inputs[0]!.value = '12.5';
    inputs[0]!.dispatchEvent(new Event('change'));
    expect(afterCommit).toHaveBeenCalledTimes(1);
    expect(afterCommit.mock.calls[0]![0]).toContain(mesh);
    expect(mesh.position.x).toBeCloseTo(12.5);
    panel.dispose();
    container.remove();
  });

  it('invokes afterTransformCommit for rotation and scale edits', async () => {
    const { ManagerSelection } = await import('@/selection/object/manager_selection.js');
    const { PanelProperties } = await import('@/ui/properties/panel_properties.js');
    const { CommandStack } = await import('@/commands/command_stack.js');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const selectionManager = new ManagerSelection();
    const panel = new PanelProperties(container, selectionManager);
    panel.setCommandStack(new CommandStack(16));
    const mesh = new THREE.Mesh();
    panel.bindObject(mesh);
    const afterCommit = vi.fn();
    panel.setAfterTransformCommit(afterCommit);
    const panelRoot = container.children[0]!;
    const rotationInputs = panelRoot.children[1]!.querySelectorAll('input');
    rotationInputs[1]!.value = '90';
    rotationInputs[1]!.dispatchEvent(new Event('change'));
    const scaleInputs = panelRoot.children[2]!.querySelectorAll('input');
    scaleInputs[2]!.value = '2';
    scaleInputs[2]!.dispatchEvent(new Event('change'));
    expect(afterCommit).toHaveBeenCalledTimes(2);
    panel.dispose();
    container.remove();
  });
});
