import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BodyCollaborationPresence } from '@/collaboration/presence/body_collaboration_presence.js';

const GROUND = { grounded: true, wallPushing: false, running: false };
const AIR = { grounded: false, wallPushing: false, running: false };

/**
 * Moves the body along a straight path at a speed for a while.
 *
 * @param body Remote body.
 * @param velocity Velocity in meters per second.
 * @param motion Motion flags.
 * @param seconds Duration.
 */
function travel(body: BodyCollaborationPresence, velocity: THREE.Vector3, motion: typeof GROUND, seconds = 1): void {
  const feet = new THREE.Vector3();
  for (let t = 0; t <= seconds; t += 1 / 60) {
    feet.copy(velocity).multiplyScalar(t);
    body.update(feet, 0.5, motion, 1 / 60);
  }
}

describe('BodyCollaborationPresence', () => {
  it('derives planar speed and direction from the shown feet', () => {
    const body = new BodyCollaborationPresence();
    travel(body, new THREE.Vector3(3, 0, 4), GROUND);
    expect(body.getPlanarSpeed()).toBeCloseTo(5, 1);
    expect(body.copyMoveIntentTo(new THREE.Vector3()).toArray()).toEqual([
      expect.closeTo(0.6, 2),
      0,
      expect.closeTo(0.8, 2),
    ]);
    expect(body.getYaw()).toBe(0.5);
  });

  it('stands still below the stand speed and after a reset', () => {
    const body = new BodyCollaborationPresence();
    travel(body, new THREE.Vector3(0.01, 0, 0), GROUND);
    expect(body.getPlanarSpeed()).toBe(0);
    travel(body, new THREE.Vector3(4, 0, 0), GROUND);
    body.reset();
    expect(body.getPlanarSpeed()).toBe(0);
  });

  it('caps a teleport-sized jump in one frame', () => {
    const body = new BodyCollaborationPresence();
    body.update(new THREE.Vector3(), 0, GROUND, 1 / 60);
    body.update(new THREE.Vector3(500, 0, 0), 0, GROUND, 1 / 60);
    expect(body.getPlanarSpeed()).toBeLessThanOrEqual(30);
  });

  it('reports vertical velocity only while airborne', () => {
    const body = new BodyCollaborationPresence();
    travel(body, new THREE.Vector3(0, -6, 0), GROUND);
    expect(body.getVerticalVelocity()).toBe(0);
    expect(body.getRawVerticalVelocity()).toBeCloseTo(-6, 1);
    travel(body, new THREE.Vector3(0, -6, 0), AIR);
    expect(body.getVerticalVelocity()).toBeCloseTo(-6, 1);
    expect(body.getIsGrounded()).toBe(false);
  });

  it('puts the wall in front of the facing while pushing', () => {
    const body = new BodyCollaborationPresence();
    body.update(new THREE.Vector3(), Math.PI / 2, { grounded: true, wallPushing: true, running: true }, 0);
    expect(body.getIsWallPushing()).toBe(true);
    expect(body.getWantsRun()).toBe(true);
    const normal = body.copyWallNormalTo(new THREE.Vector3());
    expect(normal.x).toBeCloseTo(-1, 6);
    expect(normal.z).toBeCloseTo(0, 6);
  });
});
