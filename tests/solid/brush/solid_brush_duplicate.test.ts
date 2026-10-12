import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { isSolidBrushMarkedNonConvex, markSolidBrushPreviewValidity } from '@/edit/transform/brush_edit_convexity.js';
import { SolidBrushPreparer } from '@/solid/algorithm/compile/solid_brush_preparer.js';
import { SolidCompileCache } from '@/solid/algorithm/compile/solid_compile_cache.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { createIndependentSolidModelDuplicate } from '@/solid/model/solid_model_duplicate.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { CommandSolidBrushesDuplicate } from '@/solid/commands/brushes/command_solid_brushes_duplicate.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { isSolidCsgGroup, markAsSolidCsgGroup } from '@/solid/model/solid_group.js';

/** Tests that solid brush duplication stays inside the solid model hierarchy. */
describe('Duplicate solid brushes', () => {
  it('duplicates a brush under the same solid model root', () => {
    const world = new THREE.Group();
    const model = new SolidModel('DupSolid');
    const source = model.addBoxBrush(2, SolidOperation.Additive);
    world.add(model.root);
    expect(source.mesh).toBeTruthy();
    const clone = model.duplicateBrush(source.id);
    expect(clone).toBeTruthy();
    expect(model.getBrushCount()).toBe(2);
    expect(clone!.mesh?.parent).toBe(model.root);
    expect(SolidBrushVisual.isBrushObject(clone!.mesh!)).toBe(true);
    expect(SolidModel.fromObject(clone!.mesh!)).toBe(model);
    expect(clone!.position.x).toBeCloseTo(source.position.x, 5);
    expect(clone!.position.y).toBeCloseTo(source.position.y, 5);
    expect(clone!.position.z).toBeCloseTo(source.position.z, 5);
  });

  it('undoes solid brush duplication via command', () => {
    const model = new SolidModel('CmdSolid');
    const source = model.addBoxBrush(2, SolidOperation.Subtractive);
    const command = new CommandSolidBrushesDuplicate([source.mesh!], new THREE.Vector3(0, 0, 0));
    command.execute();
    expect(model.getBrushCount()).toBe(2);
    expect(command.getClonedMeshes().length).toBe(1);
    command.undo();
    expect(model.getBrushCount()).toBe(1);
    expect(command.getClonedMeshes().length).toBe(0);
  });

  it('duplicates multiple brushes in outliner order, not selection click order', () => {
    const model = new SolidModel('OrderDupSolid');
    const first = model.addBoxBrush(4, SolidOperation.Additive);
    const second = model.addBoxBrush(2, SolidOperation.Subtractive);
    const third = model.addBoxBrush(3, SolidOperation.Additive);
    first.mesh!.name = 'FirstBrush';
    second.mesh!.name = 'SecondBrush';
    third.mesh!.name = 'ThirdBrush';
    const selectionClickOrder = [third.mesh!, first.mesh!];
    const command = new CommandSolidBrushesDuplicate(selectionClickOrder, new THREE.Vector3(0, 0, 0));
    command.execute();
    const brushes = model.getBrushes();
    expect(brushes).toHaveLength(5);
    // Clones insert after each source in scene order with unique global names.
    expect(brushes).toHaveLength(5);
    expect(brushes[0]!.name).toBe('FirstBrush');
    expect(brushes[1]!.name).not.toBe('FirstBrush');
    expect(brushes[1]!.name.startsWith('FirstBrush')).toBe(true);
    expect(brushes[2]!.name).toBe('SecondBrush');
    expect(brushes[3]!.name).toBe('ThirdBrush');
    expect(brushes[4]!.name).not.toBe('ThirdBrush');
    expect(brushes[4]!.name.startsWith('ThirdBrush')).toBe(true);
    expect(brushes.map((brush) => brush.operation)).toEqual([
      SolidOperation.Additive,
      SolidOperation.Additive,
      SolidOperation.Subtractive,
      SolidOperation.Additive,
      SolidOperation.Additive,
    ]);
    const rootBrushMeshes = model.root.children.filter((child) => SolidBrushVisual.isBrushObject(child));
    expect(rootBrushMeshes).toHaveLength(5);
    expect(new Set(rootBrushMeshes.map((mesh) => mesh.name)).size).toBe(5);
  });

  it('duplicates a nested brush under the same solid CSG group after the source', () => {
    const model = new SolidModel('DupNested');
    const outer = model.addBoxBrush(4, SolidOperation.Additive);
    const nested = model.addBoxBrush(2, SolidOperation.Subtractive);
    const nestedSibling = model.addBoxBrush(2, SolidOperation.Additive);
    const group = new THREE.Group();
    group.name = 'Compound';
    markAsSolidCsgGroup(group);
    model.root.add(group);
    group.add(nested.mesh!);
    group.add(nestedSibling.mesh!);
    model.syncBrushOrderFromScene();
    model.rebuild(true);
    const clone = model.duplicateBrush(nested.id);
    expect(clone).toBeTruthy();
    expect(clone!.mesh?.parent).toBe(group);
    expect(model.root.children).not.toContain(clone!.mesh!);
    expect(outer.mesh?.parent).toBe(model.root);
    const nestedIndex = group.children.indexOf(nested.mesh!);
    const cloneIndex = group.children.indexOf(clone!.mesh!);
    expect(cloneIndex).toBe(nestedIndex + 1);
    expect(group.children.indexOf(nestedSibling.mesh!)).toBeGreaterThan(cloneIndex);
  });

  it('duplicates a solid CSG group with nested brushes under the solid root', () => {
    const model = new SolidModel('DupGroup');
    model.addBoxBrush(4, SolidOperation.Additive);
    const nestedA = model.addBoxBrush(2, SolidOperation.Subtractive);
    const nestedB = model.addBoxBrush(2, SolidOperation.Additive);
    const group = new THREE.Group();
    group.name = 'Compound';
    markAsSolidCsgGroup(group);
    model.root.add(group);
    group.add(nestedA.mesh!);
    group.add(nestedB.mesh!);
    model.syncBrushOrderFromScene();
    model.rebuild(true);
    const brushCountBefore = model.getBrushCount();
    const command = new CommandSolidBrushesDuplicate([group], new THREE.Vector3(0, 0, 0));
    command.execute();
    expect(model.getBrushCount()).toBe(brushCountBefore + 2);
    const clonedRoots = command.getClonedInspectorRoots();
    expect(clonedRoots).toHaveLength(1);
    const clonedGroup = clonedRoots[0] as THREE.Group;
    expect(isSolidCsgGroup(clonedGroup)).toBe(true);
    expect(clonedGroup.parent).toBe(model.root);
    expect(model.root.children.indexOf(clonedGroup)).toBe(model.root.children.indexOf(group) + 1);
    const clonedBrushes = clonedGroup.children.filter((child) => SolidBrushVisual.isBrushObject(child));
    expect(clonedBrushes).toHaveLength(2);
    expect(command.getClonedMeshes()).toHaveLength(2);
    command.undo();
    expect(model.getBrushCount()).toBe(brushCountBefore);
    expect(clonedGroup.parent).toBeNull();
  });

  it('leaves a duplicated invalid brush out of solid compilation', () => {
    const fixture = createInvalidBrushBesideValidBrush();
    const clone = fixture.model.duplicateBrush(fixture.invalid.id);
    expect(clone).toBeTruthy();
    if (!clone) {
      return;
    }
    expect(isSolidBrushMarkedNonConvex(requireBrushMesh(clone))).toBe(true);
    expect(preparedBrushIds(fixture.model)).toEqual([fixture.valid.id]);
  });

  it('leaves a duplicated valid brush in solid compilation', () => {
    const model = new SolidModel('ValidDupCompile');
    const source = model.addBoxBrush(createBrushExtent(), SolidOperation.Additive);
    const clone = model.duplicateBrush(source.id);
    expect(clone).toBeTruthy();
    if (!clone) {
      return;
    }
    expect(isSolidBrushMarkedNonConvex(requireBrushMesh(clone))).toBe(false);
    expect(preparedBrushIds(model)).toEqual([source.id, clone.id]);
  });

  it('keeps an invalid brush out of compilation when its solid model is duplicated', () => {
    const source = createModelWithInvalidBrush();
    const cloneModel = createIndependentSolidModelDuplicate(source);
    const cloneBrush = cloneModel.getBrushes()[0];
    expect(cloneBrush).toBeTruthy();
    if (!cloneBrush) {
      return;
    }
    expect(isSolidBrushMarkedNonConvex(requireBrushMesh(cloneBrush))).toBe(true);
    expect(preparedBrushIds(cloneModel)).toEqual([]);
  });
});

/** A valid brush kept beside an invalid brush in one solid. */
interface InvalidBesideValid {
  model: SolidModel;
  valid: SolidBrushInstance;
  invalid: SolidBrushInstance;
}

/**
 * Builds a solid with one valid box and one box that shares a vertex position.
 *
 * @returns Model and the two brush instances.
 */
function createInvalidBrushBesideValidBrush(): InvalidBesideValid {
  const model = new SolidModel('InvalidDup');
  const valid = model.addBoxBrush(createBrushExtent(), SolidOperation.Additive);
  const invalid = model.addBoxBrush(createBrushExtent(), SolidOperation.Subtractive);
  markBrushInvalidBySharedVertex(invalid);
  return { model, valid, invalid };
}

/**
 * Builds a solid whose only brush has two vertices at one position.
 *
 * @returns Solid model.
 */
function createModelWithInvalidBrush(): SolidModel {
  const model = new SolidModel('InvalidModelDup');
  markBrushInvalidBySharedVertex(model.addBoxBrush(createBrushExtent(), SolidOperation.Additive));
  return model;
}

/**
 * Copies one vertex onto another and marks the preview from validation.
 *
 * @param instance Brush to invalidate.
 */
function markBrushInvalidBySharedVertex(instance: SolidBrushInstance): void {
  if (!placeFirstVertexOnSecond(instance.brush)) {
    throw new Error('box is missing a vertex pair');
  }
  markSolidBrushPreviewValidity(requireBrushMesh(instance), instance.brush);
}

/**
 * Chooses a box edge length at runtime.
 *
 * @returns Edge length.
 */
function createBrushExtent(): number {
  return 1 + Math.random();
}

/**
 * Copies the first vertex position onto the second vertex.
 *
 * @param brush Brush whose vertices are updated.
 * @returns True when both vertices exist.
 */
function placeFirstVertexOnSecond(brush: SolidBrush): boolean {
  const source = brush.vertices[0];
  const destination = brush.vertices[1];
  if (!source || !destination) {
    return false;
  }
  destination.copy(source);
  return true;
}

/**
 * Returns the preview mesh or fails the test setup.
 *
 * @param instance Brush instance.
 * @returns Preview mesh.
 */
function requireBrushMesh(instance: SolidBrushInstance): THREE.Mesh {
  const mesh = instance.mesh;
  if (!mesh) {
    throw new Error('brush has no preview mesh');
  }
  return mesh;
}

/**
 * Lists brush ids the solid compiler would consume.
 *
 * @param model Solid model.
 * @returns Prepared brush ids in evaluation order.
 */
function preparedBrushIds(model: SolidModel): string[] {
  const preparer = new SolidBrushPreparer(new SolidCompileCache());
  const prepared = preparer.prepareBrushes(model.getBrushes(), { forceFull: true });
  return prepared.map((entry) => entry.instance.id);
}
