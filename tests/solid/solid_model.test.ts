import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../src/solid/types/solid_operation.js';
import { SolidBrushVisual } from '../../src/solid/model/solid_brush_visual.js';

/**
 * Unit tests for hierarchical solid models with brush children.
 */
describe('SolidModel', () => {
  it('creates a group root with result mesh and registry lookup', () => {
    const model = new SolidModel('TestSolid');
    expect(model.root).toBeInstanceOf(THREE.Group);
    expect(model.root.name).toBe('TestSolid');
    expect(SolidModel.isSolidModelObject(model.root)).toBe(true);
    expect(SolidModel.fromObject(model.root)).toBe(model);
    expect(SolidModel.isResultMesh(model.getResultMesh())).toBe(true);
  });

  it('puts each brush in the hierarchy as a selectable child mesh', () => {
    const model = new SolidModel();
    const first = model.addBoxBrush(2, SolidOperation.Additive);
    const second = model.addBoxBrush(1, SolidOperation.Subtractive);
    expect(model.getBrushCount()).toBe(2);
    expect(first.mesh).toBeInstanceOf(THREE.Mesh);
    expect(second.mesh).toBeInstanceOf(THREE.Mesh);
    expect(first.mesh?.parent).toBe(model.root);
    expect(second.mesh?.parent).toBe(model.root);
    expect(SolidBrushVisual.isBrushObject(first.mesh!)).toBe(true);
    expect(SolidModel.fromObject(first.mesh!)).toBe(model);
  });

  it('rebuilds textured result geometry after brush transforms', () => {
    const model = new SolidModel();
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    expect(brush.mesh).toBeTruthy();
    brush.mesh!.position.set(1, 0, 0);
    model.syncBrushesFromScene();
    model.rebuild(true);
    const position = model.getResultMesh().geometry.getAttribute('position');
    expect(position.count).toBeGreaterThan(0);
    const uv = model.getResultMesh().geometry.getAttribute('uv');
    expect(uv).toBeDefined();
    expect(uv.count).toBe(position.count);
  });

  it('live rebuild updates result geometry while dragging a brush', () => {
    const model = new SolidModel();
    const outer = model.addBoxBrush(4, SolidOperation.Additive);
    const cutter = model.addBoxBrush(2, SolidOperation.Subtractive);
    expect(outer.mesh && cutter.mesh).toBeTruthy();
    const before = model
      .getResultMesh()
      .geometry.getAttribute('position')
      .array.slice(0);
    cutter.mesh!.position.set(0.75, 0, 0);
    model.rebuildLive();
    const after = model.getResultMesh().geometry.getAttribute('position');
    expect(after.count).toBeGreaterThan(0);
    let changed = before.length !== after.array.length;
    if (!changed) {
      for (let i = 0; i < before.length; i++) {
        if (Math.abs(before[i] - after.array[i]) > 1e-6) {
          changed = true;
          break;
        }
      }
    }
    expect(changed).toBe(true);
  });

  it('live rebuild keeps materials so the solid does not disappear mid-drag', () => {
    const model = new SolidModel();
    model.addBoxBrush(2, SolidOperation.Additive);
    model.addBoxBrush(1, SolidOperation.Subtractive);
    model.getBrushes()[1].mesh!.position.set(0.5, 0, 0);
    model.rebuildLive();
    const result = model.getResultMesh();
    const position = result.geometry.getAttribute('position');
    expect(position.count).toBeGreaterThan(0);
    const material = result.material;
    const hasMaterial = Array.isArray(material)
      ? material.length > 0
      : material != null;
    expect(hasMaterial).toBe(true);
    const uv = result.geometry.getAttribute('uv');
    expect(uv).toBeDefined();
    expect(uv.count).toBe(position.count);
  });

  it('clones the hierarchy without circular userData errors', () => {
    const model = new SolidModel('CloneSafe');
    model.addBoxBrush(2);
    expect(() => model.root.clone(true)).not.toThrow();
    const clone = model.root.clone(true);
    expect(SolidModel.isSolidModelObject(clone)).toBe(true);
    expect(SolidModel.fromObject(clone)).toBeNull();
    expect(SolidModel.fromObject(model.root)).toBe(model);
  });

  it('removes brush meshes from the hierarchy', () => {
    const model = new SolidModel();
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const mesh = brush.mesh!;
    expect(model.removeBrush(brush.id)).toBe(true);
    expect(model.getBrushCount()).toBe(0);
    expect(mesh.parent).toBeNull();
  });
});
