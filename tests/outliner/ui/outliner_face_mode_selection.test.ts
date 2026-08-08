import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { PanelOutliner } from '@/outliner/ui/panel_outliner.js';
import { ControllerFaceExtrusion } from '@/tools/face/controller_face_extrusion.js';
import { CommandStack } from '@/commands/command_stack.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { SelectionMode } from '@/types/selection_mode.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

describe('Outliner face mode selection', () => {
  let container: HTMLElement;
  let selectionManager: ManagerSelection;
  let root: THREE.Group;
  let panel: PanelOutliner;
  let faceController: ControllerFaceExtrusion;
  let solidA: SolidModel;
  let solidB: SolidModel;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    selectionManager = new ManagerSelection();
    root = new THREE.Group();
    solidA = new SolidModel('SolidA');
    solidA.addBoxBrush(2, SolidOperation.Additive);
    solidA.rebuild(true);
    solidA.root.name = 'SolidA';
    solidB = new SolidModel('SolidB');
    solidB.addBoxBrush(2, SolidOperation.Additive);
    solidB.rebuild(true);
    solidB.root.name = 'SolidB';
    root.add(solidA.root);
    root.add(solidB.root);
    panel = new PanelOutliner(container, selectionManager, root);
    faceController = new ControllerFaceExtrusion(new THREE.Scene(), new CommandStack(16), new GridSnap(false, 1), root);
    faceController.setSelectionMode(SelectionMode.FACE);
    panel.setFaceModeSelectionHandler((hierarchyObject, isShiftPressed, isCtrlPressed) =>
      faceController.applyOutlinerHierarchyFaceSelection(hierarchyObject, isShiftPressed, isCtrlPressed),
    );
    panel.refresh();
  });

  afterEach(() => {
    faceController.dispose();
    panel.dispose();
    selectionManager.dispose();
    container.remove();
  });

  it('selects solid faces without object-selecting free content meshes', () => {
    clickOutlinerRowByName(container, 'SolidA');
    expect(selectionManager.getSelectedObjectCount()).toBe(0);
    expect(faceController.getSelectedFaceCount()).toBeGreaterThan(0);
    expect(faceController.getSelectedFaces().every((face) => face.mesh === solidA.getResultMesh())).toBe(true);
  });

  it('adds solid faces from a second solid with Shift', () => {
    clickOutlinerRowByName(container, 'SolidA');
    const firstCount = faceController.getSelectedFaceCount();
    clickOutlinerRowByName(container, 'SolidB', { shiftKey: true });
    expect(selectionManager.getSelectedObjectCount()).toBe(0);
    expect(faceController.getSelectedFaceCount()).toBeGreaterThan(firstCount);
  });

  it('removes solid faces with Ctrl', () => {
    clickOutlinerRowByName(container, 'SolidA');
    clickOutlinerRowByName(container, 'SolidB', { shiftKey: true });
    const bothCount = faceController.getSelectedFaceCount();
    clickOutlinerRowByName(container, 'SolidA', { ctrlKey: true });
    expect(faceController.getSelectedFaceCount()).toBeLessThan(bothCount);
    expect(faceController.getSelectedFaces().every((face) => face.mesh === solidB.getResultMesh())).toBe(true);
  });

  it('replaces face selection on plain click', () => {
    clickOutlinerRowByName(container, 'SolidA');
    clickOutlinerRowByName(container, 'SolidB');
    expect(faceController.getSelectedFaceCount()).toBeGreaterThan(0);
    expect(faceController.getSelectedFaces().every((face) => face.mesh === solidB.getResultMesh())).toBe(true);
  });

  it('ignores free content mesh rows in face mode', () => {
    const freeMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    freeMesh.name = 'FreeCube';
    root.add(freeMesh);
    panel.refresh();
    clickOutlinerRowByName(container, 'FreeCube');
    expect(faceController.getSelectedFaceCount()).toBe(0);
    expect(selectionManager.getSelectedObjectCount()).toBe(0);
  });

  it('falls through to object selection when face mode is inactive', () => {
    faceController.setSelectionMode(SelectionMode.OBJECT);
    clickOutlinerRowByName(container, 'SolidA');
    expect(selectionManager.getSelectedObjectCount()).toBeGreaterThan(0);
    expect(faceController.getSelectedFaceCount()).toBe(0);
  });

  it('does not object-select when handler returns true', () => {
    const handler = vi.fn().mockReturnValue(true);
    panel.setFaceModeSelectionHandler(handler);
    clickOutlinerRowByName(container, 'SolidA', { shiftKey: true });
    expect(handler).toHaveBeenCalled();
    expect(selectionManager.getSelectedObjectCount()).toBe(0);
  });
});

/**
 * Clicks the outliner row whose name span matches.
 *
 * @param host Parent element that contains the outliner panel DOM.
 * @param name Object display name.
 * @param modifiers Optional Shift/Ctrl flags.
 */
function clickOutlinerRowByName(
  host: HTMLElement,
  name: string,
  modifiers: { shiftKey?: boolean; ctrlKey?: boolean } = {},
): void {
  const nameSpans = Array.from(host.querySelectorAll('span'));
  const match = nameSpans.find((span) => span.textContent === name);
  expect(match).toBeDefined();
  const row = match!.closest('[data-outliner-row], .outliner-row, button, div');
  expect(row).toBeTruthy();
  row!.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      shiftKey: modifiers.shiftKey === true,
      ctrlKey: modifiers.ctrlKey === true,
    }),
  );
}
