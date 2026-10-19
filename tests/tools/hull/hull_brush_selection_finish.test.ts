import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { hullBrushSelectionFinish } from '@/tools/hull/hull_brush_selection_finish.js';

describe('hull brush selection finish', () => {
  it('selects the hull before refreshing viewport pick lists', () => {
    const selection = new ManagerSelection();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    let selectedWhenRefreshRan = false;
    const refreshAfterWorldMutation = (): void => {
      selectedWhenRefreshRan = selection.isObjectSelected(mesh);
    };
    hullBrushSelectionFinish(selection, mesh, refreshAfterWorldMutation);
    expect(selectedWhenRefreshRan).toBe(true);
    expect(selection.getAllSelectedObjectsAsArray()).toEqual([mesh]);
  });
});
