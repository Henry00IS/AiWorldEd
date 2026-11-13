import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { editAlignPositionsChanged, editAlignWorldPositions } from '@/edit/align/edit_align_positions.js';

/**
 * Builds a set of off-grid world positions.
 *
 * @returns Positions.
 */
function offGridPositions(): THREE.Vector3[] {
  return [new THREE.Vector3(0.13, 1.61, -0.37), new THREE.Vector3(-0.88, 0.07, 2.49), new THREE.Vector3(1.4, -0.6, 0)];
}

/**
 * Returns whether a value sits on a lattice of the given interval.
 *
 * @param value Value to test.
 * @param interval Lattice interval.
 * @returns True on the lattice.
 */
function onLattice(value: number, interval: number): boolean {
  return Math.abs(value / interval - Math.round(value / interval)) < 1e-9;
}

describe('editAlignWorldPositions', () => {
  it('moves every position onto the grid lattice even while snapping is switched off', () => {
    const grid = new GridSnap(false, 0.25);
    const aligned = editAlignWorldPositions(offGridPositions(), { kind: 'grid' }, grid);
    for (const position of aligned) {
      for (const value of position.toArray()) expect(onLattice(value, 0.25)).toBe(true);
    }
    offGridPositions().forEach((original, index) => {
      expect(original.distanceTo(at(aligned, index))).toBeLessThanOrEqual(Math.sqrt(3) * 0.125 + 1e-9);
    });
  });

  it('flattens one axis onto the minimum, center or maximum of the set and keeps the others', () => {
    const grid = new GridSnap(true, 0.25);
    const input = offGridPositions();
    const ys = input.map((position) => position.y);
    const expected = { min: Math.min(...ys), max: Math.max(...ys), center: (Math.min(...ys) + Math.max(...ys)) / 2 };
    for (const anchor of ['min', 'center', 'max'] as const) {
      const aligned = editAlignWorldPositions(input, { kind: 'axis', axis: 'y', anchor }, grid);
      aligned.forEach((position, index) => {
        expect(position.y).toBeCloseTo(expected[anchor], 9);
        expect(position.x).toBeCloseTo(at(input, index).x, 9);
        expect(position.z).toBeCloseTo(at(input, index).z, 9);
      });
    }
  });

  it('works in the working grid frame when the grid is rotated and moved', () => {
    const grid = new GridSnap(true, 0.5);
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.6);
    const origin = new THREE.Vector3(0.2, 0.3, -0.1);
    grid.setPlaneFrame({
      origin,
      uAxis: new THREE.Vector3(1, 0, 0).applyQuaternion(rotation),
      normal: new THREE.Vector3(0, 1, 0),
      vAxis: new THREE.Vector3(0, 0, 1).applyQuaternion(rotation),
    });
    const aligned = editAlignWorldPositions(offGridPositions(), { kind: 'axis', axis: 'x', anchor: 'max' }, grid);
    const locals = aligned.map((position) => grid.worldPositionToLocal(position, new THREE.Vector3()));
    for (const local of locals) expect(local.x).toBeCloseTo(at(locals, 0).x, 9);
    const snapped = editAlignWorldPositions(offGridPositions(), { kind: 'grid' }, grid);
    for (const position of snapped) {
      for (const value of grid.worldPositionToLocal(position, new THREE.Vector3()).toArray()) {
        expect(onLattice(value, 0.5)).toBe(true);
      }
    }
  });

  it('reports no change when the positions already line up', () => {
    const grid = new GridSnap(true, 0.25);
    const input = [new THREE.Vector3(0.5, 1, 0), new THREE.Vector3(-0.25, 0.75, 2)];
    expect(editAlignPositionsChanged(input, editAlignWorldPositions(input, { kind: 'grid' }, grid))).toBe(false);
    expect(editAlignPositionsChanged(input, editAlignWorldPositions(offGridPositions(), { kind: 'grid' }, grid))).toBe(
      true,
    );
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
