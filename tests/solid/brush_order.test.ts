import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../src/solid/types/solid_operation.js';
import { BrushMembership } from '../../src/solid/algorithm/brush_membership.js';

/**
 * Outliner / scene-graph brush order must drive CSG evaluation order.
 */
describe('Solid brush CSG order', () => {
  it('syncs brush list order from scene graph children', () => {
    const model = new SolidModel('OrderSolid');
    const first = model.addBoxBrush(2, SolidOperation.Additive);
    const second = model.addBoxBrush(2, SolidOperation.Subtractive);
    expect(model.getBrushes().map((b) => b.id)).toEqual([first.id, second.id]);
    model.root.remove(second.mesh!);
    model.root.remove(first.mesh!);
    model.root.add(second.mesh!);
    model.root.add(first.mesh!);
    model.syncBrushOrderFromScene();
    expect(model.getBrushes().map((b) => b.id)).toEqual([second.id, first.id]);
  });

  it('does not cut additive volume when subtractive is evaluated first', () => {
    const model = new SolidModel('SubFirst');
    const additive = model.addBoxBrush(4, SolidOperation.Additive);
    const subtractive = model.addBoxBrush(2, SolidOperation.Subtractive);
    model.rebuild(true);
    const holeVerts =
      model.getResultMesh().geometry.getAttribute('position').count;
    subtractive.mesh!.position.set(0, 0, 0);
    subtractive.pushTransformToMesh();
    model.root.remove(subtractive.mesh!);
    model.root.remove(additive.mesh!);
    model.root.add(subtractive.mesh!);
    model.root.add(additive.mesh!);
    model.syncBrushOrderFromScene();
    model.markDirty();
    model.rebuild(true);
    const center = new THREE.Vector3(0, 0, 0);
    const brushes = model.getBrushes();
    let inside = false;
    for (const instance of brushes) {
      const modelBrush = instance.getModelSpaceBrush();
      const inBrush = BrushMembership.isInsidePlanes(center, modelBrush.planes);
      if (instance.operation === SolidOperation.Additive) {
        inside = inside || inBrush;
      } else if (instance.operation === SolidOperation.Subtractive) {
        inside = inside && !inBrush;
      }
    }
    expect(inside).toBe(true);
    const solidVerts =
      model.getResultMesh().geometry.getAttribute('position').count;
    expect(solidVerts).toBeGreaterThan(0);
    expect(solidVerts).toBeLessThan(holeVerts);
  });

  it('rebuildAllUnder resyncs order from the scene graph', () => {
    const world = new THREE.Group();
    const model = new SolidModel('RebuildAll');
    world.add(model.root);
    const additive = model.addBoxBrush(4, SolidOperation.Additive);
    const subtractive = model.addBoxBrush(2, SolidOperation.Subtractive);
    model.rebuild(true);
    const holeVerts =
      model.getResultMesh().geometry.getAttribute('position').count;
    model.root.remove(subtractive.mesh!);
    model.root.remove(additive.mesh!);
    model.root.add(subtractive.mesh!);
    model.root.add(additive.mesh!);
    SolidModel.rebuildAllUnder(world);
    expect(model.getBrushes().map((b) => b.operation)).toEqual([
      SolidOperation.Subtractive,
      SolidOperation.Additive
    ]);
    expect(
      model.getResultMesh().geometry.getAttribute('position').count
    ).toBeLessThan(holeVerts);
  });
});

