import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { ensureMeshEditDocument } from '@/edit/mesh/mesh_edit_binding.js';
import { expandComponentSelectionToTransformVertices } from '@/edit/transform/component_transform_selection.js';
import { HandlerComponentTransform } from '@/edit/transform/handler_component_transform.js';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { writeMeshDocumentDisplayGeometry } from '@/mesh/convert/mesh_document_display_write.js';
import { ToolPrimitiveCreation } from '@/tools/creation/tool_primitive_creation.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { TransformMode } from '@/types/transform_mode.js';

/**
 * Builds a synthetic pick element with a fixed client rectangle.
 *
 * @returns HTML element for NDC projection.
 */
function pickElementCreate(): HTMLElement {
  const element = document.createElement('div');
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200 }),
  });
  return element;
}

/**
 * Returns the saved (and room) state of a mesh.
 *
 * @param mesh Mesh.
 * @returns Entry text.
 */
function savedText(mesh: THREE.Mesh): string {
  return JSON.stringify(new SceneSerializer().entryBuildShallow(mesh, ''));
}

/**
 * A room writes recorded states back on undo and redo and Edit Mode then
 * redraws the mesh from its document; a recorded state that redraws differently
 * is committed again as a new step, which drops the redo steps and hides the
 * real ones (undo does nothing, redo undoes). So a committed edit must already
 * be in the state its document redraws to.
 */
describe('committed Edit Mode vertex moves', () => {
  it('record the state the mesh document redraws to, through undo and redo', () => {
    const tool = new ToolPrimitiveCreation(new THREE.Group());
    const mesh = tool.createBox(1, 1, 1);
    const document = ensureMeshEditDocument(mesh);
    if (document === null) throw new Error('box without document');
    const stack = new CommandStack(100);
    const handler = new HandlerComponentTransform(new GridSnap(false, 1), stack);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const vertices = expandComponentSelectionToTransformVertices(
      [{ targetId: mesh.uuid, kind: 'vertex', componentKey: '0' }],
      [{ kind: 'content_mesh', mesh, targetId: mesh.uuid }],
    );
    const pivot = new THREE.Vector3();
    handler.beginSingleUseDrag(TransformMode.TRANSLATE, vertices, pivot, camera, pickElementCreate(), 100, 100);
    handler.applyPointerMove(160, 100);
    handler.commitIfNeeded();
    const redrawn = (): string => {
      const before = savedText(mesh);
      writeMeshDocumentDisplayGeometry(mesh, document);
      return before;
    };
    expect(redrawn()).toBe(savedText(mesh));
    stack.undo();
    expect(redrawn()).toBe(savedText(mesh));
    stack.redo();
    expect(redrawn()).toBe(savedText(mesh));
    tool.dispose();
  });
});
