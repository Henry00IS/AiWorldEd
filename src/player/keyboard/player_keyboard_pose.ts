import * as THREE from 'three';
import {
  PLAYER_KEYBOARD_LOOK_YAW_LIMIT_RADIANS,
  PLAYER_KEYBOARD_MOVED_OFF_HEIGHT_METERS,
  PLAYER_KEYBOARD_MOVED_OFF_METERS,
} from './player_keyboard_constants.js';

/** Keyboard placement and the spot where its player stands. */
export interface PlayerKeyboardPose {
  position: THREE.Vector3;
  feet: THREE.Vector3;
  yaw: number;
}

/**
 * Clamps a look yaw around the playing direction, including across the angle
 * wrap.
 *
 * @param yaw Wanted yaw.
 * @param facing Keyboard's playing direction.
 * @returns Clamped yaw.
 */
export function playerKeyboardClampYaw(yaw: number, facing: number): number {
  const difference = Math.atan2(Math.sin(yaw - facing), Math.cos(yaw - facing));
  return (
    facing +
    THREE.MathUtils.clamp(difference, -PLAYER_KEYBOARD_LOOK_YAW_LIMIT_RADIANS, PLAYER_KEYBOARD_LOOK_YAW_LIMIT_RADIANS)
  );
}

/**
 * Tests displacement from the playing spot (including falling off a moved
 * brush).
 *
 * @param pose Playing spot.
 * @param feet Current player feet.
 * @returns Whether to put the keyboard away.
 */
export function playerKeyboardMovedOff(pose: PlayerKeyboardPose, feet: THREE.Vector3): boolean {
  const horizontal = Math.hypot(feet.x - pose.feet.x, feet.z - pose.feet.z);
  return (
    horizontal > PLAYER_KEYBOARD_MOVED_OFF_METERS ||
    Math.abs(feet.y - pose.feet.y) > PLAYER_KEYBOARD_MOVED_OFF_HEIGHT_METERS
  );
}
