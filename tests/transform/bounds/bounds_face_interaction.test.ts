import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { BoundsFace } from '../../../src/types/bounds_face.js';
import {
  isBoundsFaceHitNearEdge,
  pickOrthographicSilhouetteEdgeFace,
  resolveBoundsFaceInteractionMode,
} from '../../../src/transform/bounds/bounds_face_interaction.js';
import type { OrientedBoundsData } from '../../../src/transform/bounds/oriented_bounds.js';

describe('bounds face interaction mode', () => {
  const bounds = createUnitBounds();

  it('treats the face center as a move interaction', () => {
    const center = new THREE.Vector3(0, 0, 1);
    expect(resolveBoundsFaceInteractionMode(center, bounds, BoundsFace.POS_Z)).toBe('move');
    expect(isBoundsFaceHitNearEdge(center, bounds, BoundsFace.POS_Z)).toBe(false);
  });

  it('treats hits near a face rim as resize', () => {
    const nearEdge = new THREE.Vector3(0.95, 0, 1);
    expect(resolveBoundsFaceInteractionMode(nearEdge, bounds, BoundsFace.POS_Z)).toBe('resize');
    expect(isBoundsFaceHitNearEdge(nearEdge, bounds, BoundsFace.POS_Z)).toBe(true);
  });

  it('treats hits near a face corner as resize', () => {
    const nearCorner = new THREE.Vector3(0.9, 0.9, 1);
    expect(resolveBoundsFaceInteractionMode(nearCorner, bounds, BoundsFace.POS_Z)).toBe('resize');
  });

  it('works for rotated bounds using world-space face points', () => {
    const rotated: OrientedBoundsData = {
      center: new THREE.Vector3(0, 0, 0),
      quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2),
      halfExtents: new THREE.Vector3(1, 1, 1),
    };
    const localCenter = new THREE.Vector3(1, 0, 0);
    const worldCenter = localCenter.clone().applyQuaternion(rotated.quaternion).add(rotated.center);
    expect(resolveBoundsFaceInteractionMode(worldCenter, rotated, BoundsFace.POS_X)).toBe('move');
    const localRim = new THREE.Vector3(1, 0.95, 0);
    const worldRim = localRim.clone().applyQuaternion(rotated.quaternion).add(rotated.center);
    expect(resolveBoundsFaceInteractionMode(worldRim, rotated, BoundsFace.POS_X)).toBe('resize');
  });
});

describe('orthographic silhouette edge pick', () => {
  const bounds = createUnitBounds();

  it('picks the full +X edge only on the wire or outside', () => {
    // On the wire (mid edge)
    expect(pickOrthographicSilhouetteEdgeFace(new THREE.Vector3(1, 0, 0), bounds, 'xz')).toBe(BoundsFace.POS_X);
    // Along the same edge near a corner
    expect(pickOrthographicSilhouetteEdgeFace(new THREE.Vector3(1, 0, 0.85), bounds, 'xz')).toBe(BoundsFace.POS_X);
    // Slightly outside the wire (exterior band)
    expect(pickOrthographicSilhouetteEdgeFace(new THREE.Vector3(1.05, 0, -0.4), bounds, 'xz')).toBe(BoundsFace.POS_X);
  });

  it('never starts silhouette resize inside the bounding box', () => {
    expect(pickOrthographicSilhouetteEdgeFace(new THREE.Vector3(0, 0, 0), bounds, 'xz')).toBeNull();
    expect(pickOrthographicSilhouetteEdgeFace(new THREE.Vector3(0.5, 0, 0.5), bounds, 'xz')).toBeNull();
    // Strictly inside near the edge — body drag only (no 50/50 band).
    expect(pickOrthographicSilhouetteEdgeFace(new THREE.Vector3(0.99, 0, 0), bounds, 'xz')).toBeNull();
    expect(pickOrthographicSilhouetteEdgeFace(new THREE.Vector3(0.95, 0, 0.5), bounds, 'xz')).toBeNull();
    expect(pickOrthographicSilhouetteEdgeFace(new THREE.Vector3(0, 0, 0.99), bounds, 'xz')).toBeNull();
  });

  it('picks ±Z edges in top view from outside', () => {
    expect(pickOrthographicSilhouetteEdgeFace(new THREE.Vector3(0, 0, 1), bounds, 'xz')).toBe(BoundsFace.POS_Z);
    expect(pickOrthographicSilhouetteEdgeFace(new THREE.Vector3(0.5, 0, -1.04), bounds, 'xz')).toBe(BoundsFace.NEG_Z);
  });

  it('picks vertical edges in front view and returns null in 3D', () => {
    expect(pickOrthographicSilhouetteEdgeFace(new THREE.Vector3(0, 1, 0), bounds, 'xy')).toBe(BoundsFace.POS_Y);
    expect(pickOrthographicSilhouetteEdgeFace(new THREE.Vector3(1.02, 0.2, 0), bounds, 'xy')).toBe(BoundsFace.POS_X);
    expect(pickOrthographicSilhouetteEdgeFace(new THREE.Vector3(1, 0, 0), bounds, 'xyz')).toBeNull();
  });

  it('picks side-view silhouette edges on Y and Z only', () => {
    expect(pickOrthographicSilhouetteEdgeFace(new THREE.Vector3(0, 1.03, 0.3), bounds, 'yz')).toBe(BoundsFace.POS_Y);
    expect(pickOrthographicSilhouetteEdgeFace(new THREE.Vector3(0, -0.2, 1.03), bounds, 'yz')).toBe(BoundsFace.POS_Z);
    // X faces are depth in side view — not silhouette edges.
    expect(pickOrthographicSilhouetteEdgeFace(new THREE.Vector3(1, 0, 0), bounds, 'yz')).toBeNull();
  });

  it('leaves the entire interior of a thin brush free for body drag', () => {
    const thin: OrientedBoundsData = {
      center: new THREE.Vector3(0, 0, 0),
      quaternion: new THREE.Quaternion(),
      // Half extent 0.1 along X → 0.2 thick brush in top view.
      halfExtents: new THREE.Vector3(0.1, 1, 2),
    };
    expect(pickOrthographicSilhouetteEdgeFace(new THREE.Vector3(0, 0, 0), thin, 'xz')).toBeNull();
    expect(pickOrthographicSilhouetteEdgeFace(new THREE.Vector3(0, 0, 1), thin, 'xz')).toBeNull();
    // Even near the inner side of the thin face — still interior.
    expect(pickOrthographicSilhouetteEdgeFace(new THREE.Vector3(0.08, 0, 0), thin, 'xz')).toBeNull();
    // Exterior of the thin sides still resizes.
    expect(pickOrthographicSilhouetteEdgeFace(new THREE.Vector3(0.12, 0, 0), thin, 'xz')).toBe(BoundsFace.POS_X);
    expect(pickOrthographicSilhouetteEdgeFace(new THREE.Vector3(-0.12, 0, 0.5), thin, 'xz')).toBe(BoundsFace.NEG_X);
  });
});

/**
 * Builds a unit OBB at the origin.
 *
 * @returns Oriented bounds with half-extents of 1.
 */
function createUnitBounds(): OrientedBoundsData {
  return {
    center: new THREE.Vector3(0, 0, 0),
    quaternion: new THREE.Quaternion(),
    halfExtents: new THREE.Vector3(1, 1, 1),
  };
}
