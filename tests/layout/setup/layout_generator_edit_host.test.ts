import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { layoutGeneratorEditHostCreate } from '@/layout/setup/layout_generator_edit_host.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { EditorOverlayId } from '@/tools/overlay/editor_overlay_id.js';
import { PolicyEditorOverlay } from '@/tools/overlay/policy_editor_overlay.js';

/**
 * Builds a host over a real selection and overlay policy; the pick stack
 * returns the given meshes.
 *
 * @param stack Meshes under every client point, nearest first.
 * @returns Host, selection and policy.
 */
function setup(stack: THREE.Mesh[]) {
  const selectionManager = new ManagerSelection();
  const editorOverlayPolicy = new PolicyEditorOverlay();
  const pane = {
    getCamera: () => new THREE.PerspectiveCamera(),
    getContentElement: () => document.createElement('div'),
  };
  const host = layoutGeneratorEditHostCreate({
    selectionManager,
    editorOverlayPolicy,
    getInteractiveViewports: () => [pane, { ...pane, getContentElement: () => null }],
    pickStack: () => stack,
  });
  return { host, selectionManager, editorOverlayPolicy };
}

describe('layoutGeneratorEditHostCreate', () => {
  it('reports a generator only when it is the single selection', () => {
    const generator = modifierGeneratorNodeCreate('stairs');
    const brush = new THREE.Mesh();
    const { host, selectionManager } = setup([]);
    selectionManager.setSelection([generator]);
    expect(host.selectedGenerator()).toBe(generator);
    selectionManager.setSelection([generator, brush]);
    expect(host.selectedGenerator()).toBeNull();
    selectionManager.setSelection([brush]);
    expect(host.selectedGenerator()).toBeNull();
  });

  it('picks the nearest generator and never an ordinary object', () => {
    const generator = modifierGeneratorNodeCreate('column');
    const brush = new THREE.Mesh();
    const { host, selectionManager } = setup([brush, generator]);
    host.pickGenerator(5, 5);
    expect(selectionManager.getAllSelectedObjectsAsArray()).toEqual([generator]);
    const empty = setup([brush]);
    empty.selectionManager.setSelection([generator]);
    empty.host.pickGenerator(5, 5);
    expect(empty.selectionManager.getAllSelectedObjectsAsArray()).toEqual([generator]);
  });

  it('holds the generator editing overlay while editing', () => {
    const { host, editorOverlayPolicy } = setup([]);
    host.setEditing(true);
    expect(editorOverlayPolicy.isAllowed(EditorOverlayId.GENERATOR_EDITING)).toBe(true);
    host.setEditing(false);
    expect(editorOverlayPolicy.isAllowed(EditorOverlayId.GENERATOR_EDITING)).toBe(false);
  });

  it('lists only panes that have a content element', () => {
    expect(setup([]).host.panes()).toHaveLength(1);
  });
});
