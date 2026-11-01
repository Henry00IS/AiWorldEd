import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { PanelOutliner } from '@/outliner/ui/panel_outliner.js';
import { Theme } from '@/theme.js';

describe('Outliner selection refused by a collaborator lock', () => {
  let container: HTMLElement;
  let selectionManager: ManagerSelection;
  let panel: PanelOutliner;
  let meshA: THREE.Mesh;
  let meshB: THREE.Mesh;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    selectionManager = new ManagerSelection();
    const root = new THREE.Group();
    meshA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    meshA.name = 'CubeA';
    meshB = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    meshB.name = 'CubeB';
    root.add(meshA, meshB);
    panel = new PanelOutliner(container, selectionManager, root);
    panel.refresh();
    selectionManager.selectionAdmissionSet((meshes) => !meshes.includes(meshB));
  });

  afterEach(() => {
    panel.dispose();
    selectionManager.dispose();
    container.remove();
  });

  it('does not highlight a row whose selection was refused', () => {
    rowByName(container, 'CubeB').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(selectionManager.isObjectSelected(meshB)).toBe(false);
    expect(isHighlighted(rowByName(container, 'CubeB'))).toBe(false);
  });

  it('keeps the previous rows when a Ctrl add is refused', () => {
    rowByName(container, 'CubeA').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    rowByName(container, 'CubeB').dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    expect(selectionManager.isObjectSelected(meshA)).toBe(true);
    expect(isHighlighted(rowByName(container, 'CubeA'))).toBe(true);
    expect(isHighlighted(rowByName(container, 'CubeB'))).toBe(false);
  });
});

/**
 * Finds the outliner row element whose name span matches.
 *
 * @param host Parent element that contains the outliner panel DOM.
 * @param name Object display name.
 * @returns The row element.
 */
function rowByName(host: HTMLElement, name: string): HTMLElement {
  const span = Array.from(host.querySelectorAll('span')).find((candidate) => candidate.textContent === name);
  const row = span?.closest<HTMLElement>('[data-outliner-object-uuid]') ?? span?.closest<HTMLElement>('div');
  if (!row) throw new Error(`Outliner row not found: ${name}`);
  return row;
}

/**
 * Returns whether a row carries the selected background.
 *
 * @param row Outliner row element.
 * @returns True when the row is highlighted as selected.
 */
function isHighlighted(row: HTMLElement): boolean {
  const probe = document.createElement('div');
  probe.style.background = Theme.outlinerSelectedColor;
  return row.style.background === probe.style.background;
}
