import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { ModifierStackRecords } from '@/modifier/stack/evaluate/modifier_stack_records.js';
import { modifierStackReplacements } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import {
  modifierStackHiddenStandIn,
  modifierStackReshapeChanged,
  modifierStackReshapeClip,
  modifierStackReshapeTransform,
  modifierStackReshapedOf,
  modifierStackReplacedIds,
} from '@/modifier/stack/evaluate/modifier_stack_reshape.js';

/**
 * Builds a solid with one moved box brush.
 *
 * @returns Model and brush.
 */
function movedBox() {
  const model = new SolidModel('Reshape test');
  const brush = model.addBoxBrush(1, SolidOperation.Additive);
  brush.mesh?.position.set(3, 0, 0);
  model.root.updateMatrixWorld(true);
  return { model, brush };
}

describe('modifier stack reshape', () => {
  it('applies a model-space operator while keeping id, mesh and pose', () => {
    const { brush } = movedBox();
    const standIn = modifierStackReshapeTransform(brush, new THREE.Matrix4().makeScale(2, 1, 1), 'copied');
    expect(standIn.id).toBe(brush.id);
    expect(standIn.mesh).toBe(brush.mesh);
    const box = new THREE.Box3().setFromPoints(standIn.getModelSpaceBrush().vertices);
    expect([box.min.x, box.max.x]).toEqual([expect.closeTo(5), expect.closeTo(7)]);
  });

  it('cuts by a model-space plane, or reports when nothing or everything is left', () => {
    const { brush } = movedBox();
    const cut = modifierStackReshapeClip(brush, new THREE.Plane(new THREE.Vector3(1, 0, 0), -3));
    const box = new THREE.Box3().setFromPoints(cut?.getModelSpaceBrush().vertices ?? []);
    expect([box.min.x, box.max.x]).toEqual([expect.closeTo(3), expect.closeTo(3.5)]);
    expect(modifierStackReshapeClip(brush, new THREE.Plane(new THREE.Vector3(1, 0, 0), 0))).toBe(brush);
    expect(modifierStackReshapeClip(brush, new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0))).toBeNull();
  });

  it('keeps hidden stand-ins hidden and stable', () => {
    const { brush } = movedBox();
    const hidden = modifierStackHiddenStandIn(brush);
    hidden.pullTransformFromMesh();
    expect(hidden.visible).toBe(false);
    expect(modifierStackHiddenStandIn(brush)).toBe(hidden);
  });

  it('lists the authored ids the last compile replaced', () => {
    const { brush } = movedBox();
    const hidden = modifierStackHiddenStandIn(brush);
    const scope = 'reshape-replaced-ids';
    expect(modifierStackReshapeChanged(scope, new Map([[brush.id, hidden]]))).toEqual([brush.id]);
    expect(modifierStackReplacedIds(scope)).toEqual([brush.id]);
    expect(modifierStackReshapeChanged(scope, new Map())).toEqual([brush.id]);
    expect(modifierStackReplacedIds(scope)).toEqual([]);
  });

  it('collects reshaped authored brushes and tracks which replacements changed', () => {
    const { brush } = movedBox();
    const standIn = modifierStackReshapeTransform(brush, new THREE.Matrix4(), 'copied');
    const unit = { tree: brush.mesh ?? new THREE.Group(), brushes: [standIn], authored: true, origin: null };
    expect(modifierStackReshapedOf([unit]).size).toBe(0);
    const reshaped = modifierStackReshapedOf([{ ...unit, reshaped: true }]);
    expect(reshaped.get(brush.id)).toBe(standIn);
    expect(modifierStackReshapeChanged('scope', reshaped)).toEqual([brush.id]);
    expect(modifierStackReshapeChanged('scope', reshaped)).toEqual([]);
    expect(modifierStackReshapeChanged('scope', new Map())).toEqual([brush.id]);
  });
});

describe('modifier stack replacements', () => {
  it('keeps a brush removed when a later stack reshapes it', () => {
    const removed = new SolidBrushInstance(
      'wall',
      'wall',
      SolidBrushFactory.createBox(new THREE.Vector3(), new THREE.Vector3(1, 1, 1)),
    );
    const records = new ModifierStackRecords();
    records.hiddenAdd('wall');
    const sheared = new SolidBrushInstance('wall', 'wall', removed.brush.clone());
    const reshaped = new Map([['wall', sheared]]);
    const replaced = modifierStackReplacements(
      [removed],
      [
        { records, reshaped: new Map() },
        { records: new ModifierStackRecords(), reshaped },
      ],
    );
    expect(replaced.get('wall')).toBe(modifierStackHiddenStandIn(removed));
  });
});
