import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PlayerLookState } from '@/player/look/player_look_state.js';
import { PLAYER_PITCH_LIMIT_RADIANS } from '@/player/player_constants.js';

describe('PlayerLookState', () => {
  it('applies yaw and pitch from mouse deltas', () => {
    const look = new PlayerLookState(0, 0);
    look.applyMouseDelta(100, 0);
    expect(look.getYawRadians()).toBeLessThan(0);
    look.applyMouseDelta(0, -50);
    expect(look.getPitchRadians()).toBeGreaterThan(0);
  });

  it('clamps pitch to the configured limit', () => {
    const look = new PlayerLookState(0, 0);
    look.applyMouseDelta(0, -100000);
    expect(look.getPitchRadians()).toBeCloseTo(PLAYER_PITCH_LIMIT_RADIANS);
    look.applyMouseDelta(0, 100000);
    expect(look.getPitchRadians()).toBeCloseTo(-PLAYER_PITCH_LIMIT_RADIANS);
  });

  it('builds horizontal forward and right basis vectors matching fly camera', () => {
    const look = new PlayerLookState(0, 0);
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    look.copyHorizontalForwardTo(forward);
    look.copyHorizontalRightTo(right);
    expect(forward.y).toBeCloseTo(0);
    expect(right.y).toBeCloseTo(0);
    expect(forward.length()).toBeCloseTo(1);
    expect(right.length()).toBeCloseTo(1);
    expect(forward.dot(right)).toBeCloseTo(0);
    expect(right.x).toBeCloseTo(-1);
    expect(right.z).toBeCloseTo(0);
  });

  it('syncs angles from a camera look direction', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 1.65, 0);
    camera.lookAt(0, 1.65, 10);
    camera.updateMatrixWorld(true);
    const look = new PlayerLookState();
    look.syncFromCamera(camera);
    expect(look.getYawRadians()).toBeCloseTo(0, 1);
    expect(Math.abs(look.getPitchRadians())).toBeLessThan(0.1);
  });
});
