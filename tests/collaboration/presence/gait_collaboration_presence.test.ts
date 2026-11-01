import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GaitCollaborationPresence } from '@/collaboration/presence/gait_collaboration_presence.js';

/**
 * Builds a root with the two thigh bones named like the character model.
 *
 * @returns Root and the left thigh.
 */
function rig(): { root: THREE.Group; thigh: THREE.Bone } {
  const root = new THREE.Group();
  const thigh = new THREE.Bone();
  thigh.name = 'UpperLegL';
  const other = new THREE.Bone();
  other.name = 'UpperLegR';
  root.add(thigh, other);
  return { root, thigh };
}

describe('presence walk cycle', () => {
  it('swings the legs while moving and returns them to rest when standing', () => {
    const { root, thigh } = rig();
    const gait = new GaitCollaborationPresence();
    gait.bind(root);
    const position = new THREE.Vector3();
    gait.update(position, 0);
    let angles = 0;
    for (let frame = 0; frame < 60; frame++) {
      position.x += 0.05;
      expect(gait.update(position, 1000 / 60)).toBe(true);
      angles = Math.max(angles, thigh.quaternion.angleTo(new THREE.Quaternion()));
    }
    expect(angles).toBeGreaterThan(0.2);
    expect(gait.amplitude()).toBeGreaterThan(0.9);
    let frames = 0;
    while (gait.update(position, 1000 / 60) && frames < 600) frames++;
    expect(frames).toBeLessThan(600);
    expect(thigh.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-3);
  });

  it('does not swing while only turning in place', () => {
    const gait = new GaitCollaborationPresence();
    gait.bind(rig().root);
    expect(gait.update(new THREE.Vector3(), 16)).toBe(false);
    expect(gait.update(new THREE.Vector3(0, 0.001, 0), 16)).toBe(false);
  });
});
