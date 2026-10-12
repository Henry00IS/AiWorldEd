import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildDefaultPlaneFrame } from '@/navigation/orientation/editor_orientation_basis.js';
import { snapLoopCutParameterToGridPlanes } from '@/edit/tool/edit_loop_cut_slide_snap.js';
import type { LoopCutBeltParameterRange } from '@/edit/topology/topology_loop_cut_belt_range.js';

describe('edit_loop_cut_slide_snap', () => {
  it('snaps an axis-aligned edge to the grid plane it crosses', () => {
    const parameter = 0.3;
    const snapped = snapOnDefaultGrid(new THREE.Vector3(0, 0, 0), new THREE.Vector3(4, 0, 0), parameter, true, null);
    expect(snapped).toBeCloseTo(0.25);
    expect(snapped).not.toBeCloseTo(parameter);
  });

  it('snaps a diagonal edge to the nearest crossed grid plane', () => {
    const start = new THREE.Vector3(0, 0, 0);
    const end = new THREE.Vector3(4, 2, 2);
    const parameter = 0.3;
    const snapped = snapOnDefaultGrid(start, end, parameter, true, null);
    expect(snapped).toBeCloseTo(0.25);
    expect(pointOnEdge(start, end, snapped).x).toBeCloseTo(1);
  });

  it('keeps the pointer parameter when grid snapping is disabled', () => {
    const start = new THREE.Vector3(0, 0, 0);
    const end = new THREE.Vector3(4, 2, 2);
    const parameter = 0.3;
    expect(snapOnDefaultGrid(start, end, parameter, false, null)).toBeCloseTo(parameter);
  });

  it('uses an in-range grid plane instead of falling back to the raw parameter', () => {
    const range = { min: 0.4, max: 0.9 };
    const snapped = snapOnDefaultGrid(new THREE.Vector3(0, 0, 0), new THREE.Vector3(4, 0, 0), 0.3, true, range);
    expect(snapped).toBeCloseTo(0.5);
  });

  it('leaves a short edge smooth when it crosses no grid plane', () => {
    const parameter = 0.4;
    const snapped = snapOnDefaultGrid(
      new THREE.Vector3(0.1, 0, 0),
      new THREE.Vector3(0.2, 0, 0),
      parameter,
      true,
      null,
    );
    expect(snapped).toBeCloseTo(parameter);
  });

  it('snaps against a translated grid origin', () => {
    const frame = buildDefaultPlaneFrame();
    frame.origin = new THREE.Vector3(0.5, 0, 0);
    const snapped = snapLoopCutParameterToGridPlanes(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(4, 0, 0),
      0.3,
      true,
      1,
      frame,
      null,
    );
    expect(snapped).toBeCloseTo(0.375);
  });
});

/**
 * Snaps a parameter on the default unit grid.
 *
 * @param worldA Edge start.
 * @param worldB Edge end.
 * @param parameter Unsnapped parameter.
 * @param snapEnabled True when snapping is on.
 * @param range Belt window, or null.
 * @returns Snapped parameter.
 */
function snapOnDefaultGrid(
  worldA: THREE.Vector3,
  worldB: THREE.Vector3,
  parameter: number,
  snapEnabled: boolean,
  range: LoopCutBeltParameterRange | null,
): number {
  return snapLoopCutParameterToGridPlanes(worldA, worldB, parameter, snapEnabled, 1, buildDefaultPlaneFrame(), range);
}

/**
 * Returns a point along an edge.
 *
 * @param worldA Edge start.
 * @param worldB Edge end.
 * @param parameter Edge parameter.
 * @returns World point.
 */
function pointOnEdge(worldA: THREE.Vector3, worldB: THREE.Vector3, parameter: number): THREE.Vector3 {
  return worldA.clone().lerp(worldB, parameter);
}
