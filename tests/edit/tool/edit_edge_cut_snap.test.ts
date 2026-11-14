import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildDefaultPlaneFrame } from '@/navigation/orientation/editor_orientation_basis.js';
import { snapKnifeParameterToGrid } from '@/edit/tool/edit_edge_cut_snap.js';

/**
 * Snaps a knife parameter on the default unit grid.
 *
 * @param parameter Unsnapped parameter.
 * @param userSnapEnabled User snap preference.
 * @param shiftHeld True when Shift is held.
 * @returns Snapped parameter.
 */
function snapOnUnitGrid(parameter: number, userSnapEnabled: boolean, shiftHeld: boolean): number {
  return snapKnifeParameterToGrid(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(4, 0, 0),
    parameter,
    userSnapEnabled,
    shiftHeld,
    1,
    buildDefaultPlaneFrame(),
  );
}

describe('snapKnifeParameterToGrid', () => {
  it('snaps to the nearest grid plane when user snap is on and Shift is up', () => {
    const parameter = 0.3;
    const snapped = snapOnUnitGrid(parameter, true, false);
    expect(snapped).toBeCloseTo(0.25);
    expect(snapped).not.toBeCloseTo(parameter);
  });

  it('leaves the pointer parameter when user snap is on and Shift is held', () => {
    const parameter = 0.3;
    expect(snapOnUnitGrid(parameter, true, true)).toBeCloseTo(parameter);
  });

  it('leaves the pointer parameter when user snap is off and Shift is up', () => {
    const parameter = 0.3;
    expect(snapOnUnitGrid(parameter, false, false)).toBeCloseTo(parameter);
  });

  it('snaps when user snap is off and Shift inverts it on', () => {
    const parameter = 0.3;
    const snapped = snapOnUnitGrid(parameter, false, true);
    expect(snapped).toBeCloseTo(0.25);
    expect(snapped).not.toBeCloseTo(parameter);
  });
});
