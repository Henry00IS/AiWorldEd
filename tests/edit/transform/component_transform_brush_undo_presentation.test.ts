import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { CommandStack } from '@/commands/command_stack.js';
import { CommandComponentPositions } from '@/edit/transform/command_component_positions.js';
import type { ComponentTransformBrushVertex } from '@/edit/transform/component_transform_vertex.js';
import { applyComponentTranslationDelta } from '@/edit/transform/component_transform_apply.js';
import { CoordinatorEditMode } from '@/edit/coordinator/coordinator_edit_mode.js';
import { SOLID_BRUSH_EDGE_USERDATA_KEY } from '@/solid/model/solid_brush_edge_materials.js';
import { SOLID_BRUSH_EDGE_BATCH_USERDATA_KEY } from '@/solid/model/solid_brush_edge_batch.js';
import { isEditModeWireframeSuppressed } from '@/utils/edit_mode_wireframe_suppress.js';
import { buildBrushEditCage } from '@/edit/brush/brush_edit_cage.js';

describe('component brush edit undo presentation', () => {
  it('updates edit cage positions and re-hides brush edges after undo', () => {
    const scene = new THREE.Scene();
    const solidModel = new SolidModel('UndoBrush');
    scene.add(solidModel.root);
    const instance = solidModel.addBoxBrush(2, SolidOperation.Additive);
    solidModel.rebuild(true);
    const mesh = instance.mesh!;
    const brush = instance.brush;
    const vertexIndex = findVertexIndexWithMaxX(brush.vertices);
    const beforeLocal = brush.vertices[vertexIndex]!.clone();
    const coordinator = new CoordinatorEditMode({
      getPrimaryScene: () => scene,
      getSelectedObjects: () => [mesh],
      getViewports: () => [],
      showStatusMessage: () => undefined,
      getCommandStack: () => null,
    });
    expect(coordinator.enterFromObjectSelection()).toBe(true);
    const transformVertex: ComponentTransformBrushVertex = {
      kind: 'brush',
      targetId: instance.id,
      vertexIndex,
      solidModel,
      brushId: instance.id,
      brush,
      mesh,
      initialLocal: beforeLocal.clone(),
    };
    applyComponentTranslationDelta([transformVertex], new THREE.Vector3(0.75, 0, 0));
    coordinator.refreshDomainGeometryPresentation();
    const commandStack = new CommandStack(8);
    commandStack.recordExecuted(
      new CommandComponentPositions([transformVertex], () => {
        coordinator.refreshDomainGeometryPresentation();
      }),
    );
    expect(brush.vertices[vertexIndex]!.x).toBeCloseTo(beforeLocal.x + 0.75, 5);
    commandStack.undo();
    expect(brush.vertices[vertexIndex]!.x).toBeCloseTo(beforeLocal.x, 5);
    const cage = buildBrushEditCage(solidModel, instance, instance.id);
    expect(cage.worldPositions[vertexIndex]!.x).toBeCloseTo(beforeLocal.x, 5);
    const objectModeEdges = collectObjectModeEdgeHelpers(solidModel.root, mesh);
    expect(objectModeEdges.length).toBeGreaterThan(0);
    for (const edge of objectModeEdges) {
      expect(edge.visible).toBe(false);
      expect(isEditModeWireframeSuppressed(edge)).toBe(true);
    }
    coordinator.exitToObjectMode();
  });
});

/**
 * Collects personal brush edges and solid-root edge batches under a solid.
 *
 * @param solidRoot Solid model root.
 * @param brushMesh Brush preview mesh.
 * @returns Wireframe helper objects.
 */
function collectObjectModeEdgeHelpers(solidRoot: THREE.Group, brushMesh: THREE.Mesh): THREE.Object3D[] {
  const helpers: THREE.Object3D[] = [];
  for (const child of brushMesh.children) {
    if (child instanceof THREE.LineSegments && child.userData[SOLID_BRUSH_EDGE_USERDATA_KEY] === true) {
      helpers.push(child);
    }
  }
  solidRoot.traverse((object) => {
    if (object.userData[SOLID_BRUSH_EDGE_BATCH_USERDATA_KEY] === true) {
      helpers.push(object);
    }
  });
  return helpers;
}

/**
 * Finds the brush vertex with the largest local X.
 *
 * @param vertices Brush vertices.
 * @returns Vertex index.
 */
function findVertexIndexWithMaxX(vertices: readonly THREE.Vector3[]): number {
  let bestIndex = 0;
  let bestX = -Infinity;
  for (let index = 0; index < vertices.length; index++) {
    if (vertices[index]!.x > bestX) {
      bestX = vertices[index]!.x;
      bestIndex = index;
    }
  }
  return bestIndex;
}
