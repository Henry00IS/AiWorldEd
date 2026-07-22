import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { SelectionManager } from '../../src/managers/selection_manager.js';

describe('SelectionManager', () => {
  let manager: SelectionManager;
  let meshA: THREE.Mesh;
  let meshB: THREE.Mesh;
  let meshC: THREE.Mesh;

  beforeEach(() => {
    manager = new SelectionManager();
    meshA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    meshB = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    meshC = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  });

  it('should start with an empty selection', () => {
    expect(manager.getSelectedObjectCount()).toBe(0);
    expect(manager.getSelectedObjects().size).toBe(0);
  });

  it('should select a single object', () => {
    manager.selectObject(meshA);
    expect(manager.getSelectedObjectCount()).toBe(1);
    expect(manager.isObjectSelected(meshA)).toBe(true);
  });

  it('should clear previous selection when selecting a new object', () => {
    manager.selectObject(meshA);
    manager.selectObject(meshB);
    expect(manager.getSelectedObjectCount()).toBe(1);
    expect(manager.isObjectSelected(meshA)).toBe(false);
    expect(manager.isObjectSelected(meshB)).toBe(true);
  });

  it('should not duplicate selection when selecting the same object', () => {
    manager.selectObject(meshA);
    manager.selectObject(meshA);
    expect(manager.getSelectedObjectCount()).toBe(1);
  });

  it('should add object to existing selection', () => {
    manager.selectObject(meshA);
    manager.addToSelection(meshB);
    expect(manager.getSelectedObjectCount()).toBe(2);
    expect(manager.isObjectSelected(meshA)).toBe(true);
    expect(manager.isObjectSelected(meshB)).toBe(true);
  });

  it('should not duplicate when adding already selected object', () => {
    manager.addToSelection(meshA);
    manager.addToSelection(meshA);
    expect(manager.getSelectedObjectCount()).toBe(1);
  });

  it('should remove object from selection', () => {
    manager.addToSelection(meshA);
    manager.addToSelection(meshB);
    manager.removeFromSelection(meshA);
    expect(manager.getSelectedObjectCount()).toBe(1);
    expect(manager.isObjectSelected(meshA)).toBe(false);
    expect(manager.isObjectSelected(meshB)).toBe(true);
  });

  it('should handle removal of non-selected object gracefully', () => {
    manager.addToSelection(meshA);
    manager.removeFromSelection(meshB);
    expect(manager.getSelectedObjectCount()).toBe(1);
  });

  it('should clear all selections', () => {
    manager.addToSelection(meshA);
    manager.addToSelection(meshB);
    manager.addToSelection(meshC);
    manager.clearSelection();
    expect(manager.getSelectedObjectCount()).toBe(0);
    expect(manager.isObjectSelected(meshA)).toBe(false);
    expect(manager.isObjectSelected(meshB)).toBe(false);
    expect(manager.isObjectSelected(meshC)).toBe(false);
  });

  it('should handle clear on empty selection without error', () => {
    expect(() => manager.clearSelection()).not.toThrow();
  });

  it('should fire callback on selection change', () => {
    let callbackCount = 0;
    manager.onSelectionChanged(() => { callbackCount++; });
    manager.selectObject(meshA);
    expect(callbackCount).toBe(1);
  });

  it('should fire callback with correct selection set', () => {
    let capturedSet: Set<THREE.Mesh> | null = null;
    manager.onSelectionChanged((selected) => { capturedSet = selected; });
    manager.selectObject(meshA);
    expect(capturedSet).not.toBeNull();
    expect(capturedSet?.has(meshA)).toBe(true);
  });

  it('should support multiple change callbacks', () => {
    let countA = 0;
    let countB = 0;
    manager.onSelectionChanged(() => { countA++; });
    manager.onSelectionChanged(() => { countB++; });
    manager.selectObject(meshA);
    expect(countA).toBe(1);
    expect(countB).toBe(1);
  });

  it('should return false for isObjectSelected on unselected mesh', () => {
    expect(manager.isObjectSelected(meshA)).toBe(false);
  });

  it('should dispose and clear all state', () => {
    manager.selectObject(meshA);
    manager.dispose();
    expect(manager.getSelectedObjectCount()).toBe(0);
  });

  it('should not fire callbacks after disposal', () => {
    let callbackCount = 0;
    manager.onSelectionChanged(() => { callbackCount++; });
    manager.dispose();
    manager.selectObject(meshA);
    expect(callbackCount).toBe(0);
  });

  it('should stop firing a callback after it is unregistered', () => {
    let callbackCount = 0;
    const callback = () => { callbackCount++; };
    manager.onSelectionChanged(callback);
    manager.selectObject(meshA);
    expect(callbackCount).toBe(1);
    manager.offSelectionChanged(callback);
    manager.selectObject(meshB);
    expect(callbackCount).toBe(1);
  });

  it('should keep other callbacks firing after one is unregistered', () => {
    let countA = 0;
    let countB = 0;
    const callbackA = () => { countA++; };
    const callbackB = () => { countB++; };
    manager.onSelectionChanged(callbackA);
    manager.onSelectionChanged(callbackB);
    manager.selectObject(meshA);
    expect(countA).toBe(1);
    expect(countB).toBe(1);
    manager.offSelectionChanged(callbackA);
    manager.selectObject(meshB);
    expect(countA).toBe(1);
    expect(countB).toBe(2);
  });

  it('should support multi-select via selectFromClick additive mode', () => {
    manager.selectFromClick(meshA, false, false);
    manager.selectFromClick(meshB, true, false);
    expect(manager.getSelectedObjectCount()).toBe(2);
    expect(manager.isObjectSelected(meshA)).toBe(true);
    expect(manager.isObjectSelected(meshB)).toBe(true);
  });

  it('should toggle selection via selectFromClick toggle mode', () => {
    manager.selectFromClick(meshA, false, false);
    manager.selectFromClick(meshA, false, true);
    expect(manager.getSelectedObjectCount()).toBe(0);
    manager.selectFromClick(meshB, false, true);
    expect(manager.isObjectSelected(meshB)).toBe(true);
  });

  it('should replace selection with setSelection', () => {
    manager.selectObject(meshA);
    manager.setSelection([meshB, meshC]);
    expect(manager.getSelectedObjectCount()).toBe(2);
    expect(manager.isObjectSelected(meshA)).toBe(false);
    expect(manager.isObjectSelected(meshB)).toBe(true);
    expect(manager.isObjectSelected(meshC)).toBe(true);
  });

  it('should not notify when setSelection is given the same set', () => {
    manager.setSelection([meshA, meshB]);
    let notifyCount = 0;
    manager.onSelectionChanged(() => {
      notifyCount++;
    });
    manager.setSelection([meshA, meshB]);
    expect(notifyCount).toBe(0);
  });

  it('should prune selected meshes that are not under the scene root', () => {
    const world = new THREE.Group();
    world.add(meshA);
    world.add(meshB);
    manager.setSelection([meshA, meshB, meshC]);
    const removed = manager.pruneSelectionNotInScene(world);
    expect(removed).toBe(true);
    expect(manager.getSelectedObjectCount()).toBe(2);
    expect(manager.isObjectSelected(meshA)).toBe(true);
    expect(manager.isObjectSelected(meshB)).toBe(true);
    expect(manager.isObjectSelected(meshC)).toBe(false);
  });

  it('should prune all selection when every mesh is detached', () => {
    const world = new THREE.Group();
    world.add(meshA);
    manager.selectObject(meshA);
    world.remove(meshA);
    const removed = manager.pruneSelectionNotInScene(world);
    expect(removed).toBe(true);
    expect(manager.getSelectedObjectCount()).toBe(0);
  });

  it('should not notify when prune finds nothing to remove', () => {
    const world = new THREE.Group();
    world.add(meshA);
    manager.selectObject(meshA);
    let callbackCount = 0;
    manager.onSelectionChanged(() => {
      callbackCount++;
    });
    const removed = manager.pruneSelectionNotInScene(world);
    expect(removed).toBe(false);
    expect(callbackCount).toBe(0);
    expect(manager.isObjectSelected(meshA)).toBe(true);
  });
});
