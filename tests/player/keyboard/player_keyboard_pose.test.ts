import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { playerKeyboardClampYaw, playerKeyboardMovedOff } from '@/player/keyboard/player_keyboard_pose.js';

describe('player keyboard pose', () => {
  it('keeps the first-person look within 60 degrees of the keyboard, across the wrap', () => {
    expect(playerKeyboardClampYaw(0.5, 0)).toBeCloseTo(0.5);
    expect(playerKeyboardClampYaw(2, 0)).toBeCloseTo(Math.PI / 3);
    expect(playerKeyboardClampYaw(-2, 0)).toBeCloseTo(-Math.PI / 3);
    const clamped = playerKeyboardClampYaw(-Math.PI + 0.1, Math.PI - 0.1);
    expect(Math.abs(Math.atan2(Math.sin(clamped - (Math.PI - 0.1)), Math.cos(clamped - (Math.PI - 0.1))))).toBeCloseTo(
      0.2,
    );
  });

  it('reports the player moved off the spot horizontally or vertically', () => {
    const pose = { position: new THREE.Vector3(0, 0, 0.42), feet: new THREE.Vector3(), yaw: 0 };
    expect(playerKeyboardMovedOff(pose, new THREE.Vector3(0.1, 0.05, 0.1))).toBe(false);
    expect(playerKeyboardMovedOff(pose, new THREE.Vector3(0.4, 0, 0))).toBe(true);
    expect(playerKeyboardMovedOff(pose, new THREE.Vector3(0, -0.6, 0))).toBe(true);
  });
});
