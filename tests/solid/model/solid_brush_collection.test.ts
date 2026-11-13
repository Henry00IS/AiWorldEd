import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

/** SolidBrushCollection.findBrush stays correct as the brush list changes. */
describe('SolidBrushCollection.findBrush', () => {
  it('finds every brush, follows reorders and forgets removed brushes', () => {
    const world = new THREE.Group();
    const model = new SolidModel('lookup');
    world.add(model.root);
    const brushes = [0, 1, 2, 3].map((index) => {
      const brush = model.addBoxBrush(1, SolidOperation.Additive, null, false);
      brush.position.set(index * 2, 0, 0);
      brush.pushTransformToMesh();
      return brush;
    });
    for (const brush of brushes) expect(model.findBrush(brush.id)).toBe(brush);
    const last = brushes[3];
    expect(last).toBeDefined();
    if (!last?.mesh) return;
    model.root.remove(last.mesh);
    model.root.add(last.mesh);
    model.syncBrushesFromScene();
    model.syncBrushOrderFromScene();
    for (const brush of brushes) expect(model.findBrush(brush.id)).toBe(brush);
    expect(model.findBrush('missing-id')).toBeUndefined();
  });
});
