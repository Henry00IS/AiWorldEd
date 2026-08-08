import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  collectFaceSelectionSeedsFromFacePick,
  collectFaceSelectionSeedsFromHierarchyObject,
} from '@/selection/face/face_selection_hierarchy_targets.js';
import { ManagerFaceSelection } from '@/selection/face/manager_face_selection.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';

describe('face_selection_hierarchy_targets', () => {
  it('does not collect face seeds on free content meshes', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    const seeds = collectFaceSelectionSeedsFromHierarchyObject(mesh);
    expect(seeds.length).toBe(0);
  });

  it('does not expand free-mesh face picks into seeds', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    const seeds = collectFaceSelectionSeedsFromFacePick(mesh, 0);
    expect(seeds.length).toBe(0);
  });

  it('adds and removes solid face seeds with batch APIs', () => {
    const manager = new ManagerFaceSelection();
    const modelA = new SolidModel('BatchSolidA');
    modelA.addBoxBrush(2, SolidOperation.Additive);
    modelA.rebuild(true);
    const modelB = new SolidModel('BatchSolidB');
    modelB.addBoxBrush(2, SolidOperation.Additive);
    modelB.rebuild(true);
    const seedsA = collectFaceSelectionSeedsFromHierarchyObject(modelA.root);
    const seedsB = collectFaceSelectionSeedsFromHierarchyObject(modelB.root);
    manager.selectFaceSeeds(seedsA, false);
    manager.selectFaceSeeds(seedsB, true);
    expect(manager.getSelectedFaceCount()).toBe(seedsA.length + seedsB.length);
    manager.removeFaceSeeds(seedsA);
    expect(manager.getSelectedFaceCount()).toBe(seedsB.length);
  });

  it('collects all solid result surfaces for a solid root', () => {
    const model = new SolidModel('SolidFaceOutliner');
    model.addBoxBrush(2, SolidOperation.Additive);
    model.rebuild(true);
    const seeds = collectFaceSelectionSeedsFromHierarchyObject(model.root);
    expect(seeds.length).toBeGreaterThan(0);
    expect(seeds.every((seed) => seed.mesh === model.getResultMesh())).toBe(true);
  });

  it('collects only one brush surfaces when a brush row is targeted', () => {
    const model = new SolidModel('SolidBrushFaceOutliner');
    const brushA = model.addBoxBrush(2, SolidOperation.Additive);
    const brushB = model.addBoxBrush(1, SolidOperation.Additive);
    brushB.mesh!.position.set(4, 0, 0);
    model.rebuild(true);
    const seedsA = collectFaceSelectionSeedsFromHierarchyObject(brushA.mesh!);
    const seedsB = collectFaceSelectionSeedsFromHierarchyObject(brushB.mesh!);
    expect(seedsA.length).toBeGreaterThan(0);
    expect(seedsB.length).toBeGreaterThan(0);
    const keysA = new Set(seedsA.map((seed) => seed.regionKey));
    const keysB = new Set(seedsB.map((seed) => seed.regionKey));
    for (const key of keysA) {
      expect(keysB.has(key)).toBe(false);
    }
    expect(SolidBrushVisual.isBrushObject(brushA.mesh!)).toBe(true);
  });

  it('collects whole-brush seeds from a solid result face pick', () => {
    const model = new SolidModel('SolidFacePickBrush');
    model.addBoxBrush(2, SolidOperation.Additive);
    model.rebuild(true);
    const resultMesh = model.getResultMesh();
    const fromPick = collectFaceSelectionSeedsFromFacePick(resultMesh, 0);
    const fromBrush = collectFaceSelectionSeedsFromHierarchyObject(model.getBrushes()[0]!.mesh!);
    expect(fromPick.length).toBe(fromBrush.length);
    expect(fromPick.length).toBeGreaterThan(1);
  });

  it('collects no seeds from an ordinary free-mesh face pick', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    const seeds = collectFaceSelectionSeedsFromFacePick(mesh, 0);
    expect(seeds.length).toBe(0);
  });
});
