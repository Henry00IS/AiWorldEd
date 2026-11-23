import type { Camera } from 'three';
import * as THREE from 'three';

/**
 * Writes a Three.js camera pose onto the Web Audio listener (same model as
 * THREE.AudioListener without allocating a second AudioContext).
 *
 * @param context Live audio context whose listener is updated.
 * @param camera Camera that owns the listener pose (typically perspective).
 */
export function syncAudioListenerFromCamera(context: AudioContext, camera: Camera): void {
  camera.updateMatrixWorld(true);
  const worldPosition = new THREE.Vector3();
  const worldQuaternion = new THREE.Quaternion();
  camera.getWorldPosition(worldPosition);
  camera.getWorldQuaternion(worldQuaternion);
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(worldQuaternion).normalize();
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(worldQuaternion).normalize();
  writeAudioListenerPose(context, worldPosition, forward, up);
}

/**
 * Time constant in seconds over which the listener glides to a new pose, so
 * per-frame camera turns do not step every panner's gains (zipper crackle).
 */
export const AUDIO_LISTENER_SMOOTHING = 0.015;

/** Listener parameters in the order of position, forward and up. */
const AUDIO_LISTENER_PARAMS = [
  'positionX',
  'positionY',
  'positionZ',
  'forwardX',
  'forwardY',
  'forwardZ',
  'upX',
  'upY',
  'upZ',
] as const;

/**
 * Writes position and orientation onto a Web Audio listener.
 *
 * @param context Live audio context whose listener is updated.
 * @param position World position.
 * @param forward Unit forward vector (camera look direction).
 * @param up Unit up vector.
 */
function writeAudioListenerPose(
  context: AudioContext,
  position: THREE.Vector3,
  forward: THREE.Vector3,
  up: THREE.Vector3,
): void {
  const listener = context.listener;
  if (hasAudioParamListener(listener)) {
    writeAudioParamListener(context, position, forward, up);
    return;
  }
  writeLegacyAudioListener(listener, position, forward, up);
}

/**
 * Returns whether the listener exposes AudioParam position/orientation fields.
 *
 * @param listener Context listener.
 * @returns True when modern AudioParam setters exist.
 */
function hasAudioParamListener(listener: AudioListener): boolean {
  return typeof listener.positionX !== 'undefined';
}

/**
 * Writes pose using AudioParam fields (current Web Audio), gliding each one.
 *
 * @param context Live audio context whose listener is updated.
 * @param position World position.
 * @param forward Unit forward.
 * @param up Unit up.
 */
function writeAudioParamListener(
  context: AudioContext,
  position: THREE.Vector3,
  forward: THREE.Vector3,
  up: THREE.Vector3,
): void {
  const values = [...position.toArray(), ...forward.toArray(), ...up.toArray()];
  AUDIO_LISTENER_PARAMS.forEach((name, index) => glideParam(context, context.listener[name], values[index] ?? 0));
}

/**
 * Glides an AudioParam to a value from the current audio time, or sets it
 * outright where scheduling is not available.
 *
 * @param context Live audio context.
 * @param param Listener parameter.
 * @param value Target value.
 */
function glideParam(context: AudioContext, param: AudioParam, value: number): void {
  if (typeof param.setTargetAtTime !== 'function') {
    param.value = value;
    return;
  }
  param.setTargetAtTime(value, context.currentTime, AUDIO_LISTENER_SMOOTHING);
}

/**
 * Writes pose using legacy setPosition/setOrientation when present.
 *
 * @param listener Context listener.
 * @param position World position.
 * @param forward Unit forward.
 * @param up Unit up.
 */
function writeLegacyAudioListener(
  listener: AudioListener,
  position: THREE.Vector3,
  forward: THREE.Vector3,
  up: THREE.Vector3,
): void {
  const legacy = listener as AudioListener & {
    setPosition?: (x: number, y: number, z: number) => void;
    setOrientation?: (fx: number, fy: number, fz: number, ux: number, uy: number, uz: number) => void;
  };
  legacy.setPosition?.(position.x, position.y, position.z);
  legacy.setOrientation?.(forward.x, forward.y, forward.z, up.x, up.y, up.z);
}
