import { describe, it, expect } from 'vitest';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidModelCodec, type SerializedSolidModel } from '@/solid/io/solid_model_codec.js';
import { getSolidGroupOperation, isSolidCsgGroup } from '@/solid/model/solid_group.js';
import type { SolidModel } from '@/solid/model/solid_model.js';
import {
  layoutBox,
  layoutGroup,
  layoutModelBuild,
  meshSignature,
} from '../algorithm/compile/solid_csg_pass_through_fixture.js';

/**
 * Builds a compiled model whose pass-through group holds a window cutter and a
 * nested additive group.
 *
 * @returns Compiled model.
 */
function passThroughModelBuild(): SolidModel {
  return layoutModelBuild('SavePassThrough', [
    layoutBox([0, 0, 0], [6, 3, 0.5]),
    layoutGroup(SolidOperation.PassThrough, [
      layoutBox([0, 0, 0], [1.5, 1.5, 2], SolidOperation.Subtractive),
      layoutGroup(SolidOperation.Additive, [layoutBox([4, 0, 0], [1, 3, 1])]),
    ]),
  ]).model;
}

/**
 * Lists the operations of every CSG group under a model in scene order.
 *
 * @param model Solid model.
 * @returns Group operations.
 */
function groupOperations(model: SolidModel): SolidOperation[] {
  const operations: SolidOperation[] = [];
  model.root.traverse((object) => {
    if (object !== model.root && isSolidCsgGroup(object)) operations.push(getSolidGroupOperation(object));
  });
  return operations;
}

/**
 * Saves a model to JSON text and loads it back as a compiled model.
 *
 * @param data Serialized model.
 * @returns Loaded and fully compiled model.
 */
function roundTrip(data: SerializedSolidModel): SolidModel {
  const loaded = SolidModelCodec.decode(JSON.parse(JSON.stringify(data)) as SerializedSolidModel, 'Loaded');
  loaded.markDirty();
  loaded.rebuild(true);
  return loaded;
}

/** Saving and loading keeps pass-through groups and reads unknown values safely. */
describe('SolidModelCodec pass-through groups', () => {
  it('keeps the pass-through operation and the mesh through save and load', () => {
    const model = passThroughModelBuild();
    const loaded = roundTrip(SolidModelCodec.encode(model));
    expect(groupOperations(loaded)).toEqual([SolidOperation.PassThrough, SolidOperation.Additive]);
    expect(meshSignature(loaded).triangles).toEqual(meshSignature(model).triangles);
  });

  it('reads an unknown group operation as additive', () => {
    const data = SolidModelCodec.encode(passThroughModelBuild());
    const group = data.hierarchy?.find((node) => node.kind === 'group');
    expect(group?.kind).toBe('group');
    if (group?.kind === 'group') Object.assign(group, { operation: 42 });
    expect(groupOperations(roundTrip(data))[0]).toBe(SolidOperation.Additive);
  });

  it('loads a brush stored with the group-only pass-through operation as additive', () => {
    const data = SolidModelCodec.encode(passThroughModelBuild());
    const brush = data.brushes[0];
    expect(brush).toBeDefined();
    if (brush) brush.operation = SolidOperation.PassThrough;
    const loaded = roundTrip(data);
    expect(loaded.getBrushes()[0]?.operation).toBe(SolidOperation.Additive);
    expect(loaded.getResultMesh().geometry.getAttribute('position').count).toBeGreaterThan(0);
  });

  it('keeps an old additive group save unchanged', () => {
    const model = layoutModelBuild('OldSave', [
      layoutBox([0, 0, 0], [6, 3, 0.5]),
      layoutGroup(SolidOperation.Additive, [layoutBox([0, 0, 0], [1.5, 1.5, 2], SolidOperation.Subtractive)]),
    ]).model;
    const data = SolidModelCodec.encode(model);
    const loaded = roundTrip(data);
    const savedAgain = SolidModelCodec.encode(loaded).hierarchy?.find((node) => node.kind === 'group');
    expect(savedAgain?.kind === 'group' ? savedAgain.operation : null).toBe(SolidOperation.Additive);
    expect(groupOperations(loaded)).toEqual([SolidOperation.Additive]);
    expect(meshSignature(loaded).volume).toBeCloseTo(6 * 3 * 0.5, 6);
  });
});
