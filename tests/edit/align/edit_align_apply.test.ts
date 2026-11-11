import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { EditSession } from '@/edit/session/edit_session.js';
import { editAlignSelectionApply } from '@/edit/align/edit_align_apply.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';

/** One open edit session on a single off-grid box brush. */
interface AlignFixture {
  session: EditSession;
  model: SolidModel;
  instance: SolidBrushInstance;
  stack: CommandStack;
}

/**
 * Opens Edit Mode on an off-grid box inside a moved solid.
 *
 * @returns Fixture.
 */
function openAlignFixture(): AlignFixture {
  const model = new SolidModel('Align');
  model.root.position.set(0.13, -0.07, 0.31);
  model.root.updateMatrixWorld(true);
  const instance = model.addBoxBrush(1.3, SolidOperation.Additive);
  const session = new EditSession();
  if (!session.enter([model.root])) throw new Error('edit session did not open');
  return { session, model, instance, stack: new CommandStack(16) };
}

/**
 * Selects brush vertices by index.
 *
 * @param fixture Fixture.
 * @param indices Vertex indices.
 */
function selectVertices(fixture: AlignFixture, indices: readonly number[]): void {
  const targetId = `brush:${fixture.instance.id}`;
  fixture.session
    .getComponentSelection()
    .replaceAll(indices.map((index) => ({ targetId, kind: 'vertex' as const, componentKey: String(index) })));
}

/**
 * Returns the world position of every brush vertex.
 *
 * @param fixture Fixture.
 * @returns World positions in vertex order.
 */
function worldVertices(fixture: AlignFixture): THREE.Vector3[] {
  fixture.model.root.updateMatrixWorld(true);
  const matrix = fixture.model.root.matrixWorld.clone().multiply(fixture.instance.getLocalMatrix());
  return fixture.instance.brush.vertices.map((vertex) => vertex.clone().applyMatrix4(matrix));
}

/**
 * Returns whether a value sits on a lattice of the given interval.
 *
 * @param value Value to test.
 * @param interval Lattice interval.
 * @returns True on the lattice.
 */
function onLattice(value: number, interval: number): boolean {
  return Math.abs(value / interval - Math.round(value / interval)) < 1e-6;
}

describe('editAlignSelectionApply', () => {
  it('moves the selected vertices onto the grid as one undoable step', () => {
    const fixture = openAlignFixture();
    const before = worldVertices(fixture);
    const all = before.map((_, index) => index);
    selectVertices(fixture, all);
    const moved = editAlignSelectionApply(
      fixture.session,
      { kind: 'grid' },
      new GridSnap(true, 0.25),
      fixture.stack,
      null,
    );
    expect(moved).toBe(before.length);
    const after = worldVertices(fixture);
    for (const position of after) for (const value of position.toArray()) expect(onLattice(value, 0.25)).toBe(true);
    expect(fixture.stack.getUndoCount()).toBe(1);
    expect(fixture.stack.undo()).toBe(true);
    worldVertices(fixture).forEach((position, index) =>
      expect(position.distanceTo(at(before, index))).toBeLessThan(1e-9),
    );
    expect(fixture.stack.redo()).toBe(true);
    worldVertices(fixture).forEach((position, index) =>
      expect(position.distanceTo(at(after, index))).toBeLessThan(1e-9),
    );
  });

  it('flattens only the selected vertices across one axis', () => {
    const fixture = openAlignFixture();
    const before = worldVertices(fixture);
    const lowest = Math.min(...before.map((position) => position.y));
    const top = before
      .map((position, index) => ({ position, index }))
      .filter((entry) => entry.position.y > lowest + 0.5);
    const chosen = [at(top, 0).index, before.findIndex((position) => position.y <= lowest + 1e-9)];
    selectVertices(fixture, chosen);
    const grid = new GridSnap(true, 0.25);
    expect(
      editAlignSelectionApply(fixture.session, { kind: 'axis', axis: 'y', anchor: 'min' }, grid, fixture.stack, null),
    ).toBe(2);
    const after = worldVertices(fixture);
    after.forEach((position, index) => {
      if (chosen.includes(index)) expect(position.y).toBeCloseTo(lowest, 9);
      else expect(position.distanceTo(at(before, index))).toBeLessThan(1e-9);
      expect(position.x).toBeCloseTo(at(before, index).x, 9);
      expect(position.z).toBeCloseTo(at(before, index).z, 9);
    });
  });

  it('records nothing when the selection is already aligned', () => {
    const fixture = openAlignFixture();
    const before = worldVertices(fixture);
    const lowest = Math.min(...before.map((position) => position.y));
    const bottom = before.flatMap((position, index) => (position.y <= lowest + 1e-9 ? [index] : []));
    selectVertices(fixture, bottom);
    const grid = new GridSnap(true, 0.25);
    expect(
      editAlignSelectionApply(fixture.session, { kind: 'axis', axis: 'y', anchor: 'max' }, grid, fixture.stack, null),
    ).toBe(0);
    expect(fixture.stack.getUndoCount()).toBe(0);
  });
});

/**
 * Reads one list entry and fails the test when it is missing.
 *
 * @param list Source list.
 * @param index Entry index.
 * @returns Entry.
 */
function at<T>(list: readonly T[], index: number): T {
  const entry = list[index];
  if (entry === undefined) throw new Error(`missing entry ${index}`);
  return entry;
}
