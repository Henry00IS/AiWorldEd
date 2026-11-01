import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CommandSelectionClearRestore } from '@/selection/commands/command_selection_clear_restore.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';

/**
 * Builds a named mesh for selection tests.
 *
 * @param name Mesh name.
 * @returns Created mesh.
 */
function createNamedMesh(name: string): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  mesh.name = name;
  return mesh;
}

describe('CommandSelectionClearRestore', () => {
  it('clears on execute and restores meshes and inspector objects on undo', () => {
    const selectionManager = new ManagerSelection();
    const meshA = createNamedMesh('A');
    const meshB = createNamedMesh('B');
    const group = new THREE.Group();
    group.add(meshA, meshB);
    selectionManager.setSelection([meshA, meshB], [group]);
    const command = new CommandSelectionClearRestore(selectionManager);
    command.execute();
    expect(selectionManager.getSelectedObjectCount()).toBe(0);
    command.undo();
    expect(selectionManager.getAllSelectedObjectsAsArray()).toEqual([meshA, meshB]);
    expect(selectionManager.getInspectorObjects()).toEqual([group]);
    expect(selectionManager.getLastSelectedObject()).toBe(meshB);
    command.execute();
    expect(selectionManager.getSelectedObjectCount()).toBe(0);
  });

  it('restores an empty selection when nothing was selected', () => {
    const selectionManager = new ManagerSelection();
    const command = new CommandSelectionClearRestore(selectionManager);
    command.execute();
    selectionManager.selectObject(createNamedMesh('Later'));
    command.undo();
    expect(selectionManager.getSelectedObjectCount()).toBe(0);
  });

  it('does not change a locked selection', () => {
    const selectionManager = new ManagerSelection();
    const mesh = createNamedMesh('Locked');
    selectionManager.selectObject(mesh);
    const command = new CommandSelectionClearRestore(selectionManager);
    selectionManager.setSelectionChangeLockGuard(() => true);
    command.execute();
    expect(selectionManager.getAllSelectedObjectsAsArray()).toEqual([mesh]);
  });
});
