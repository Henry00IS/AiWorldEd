import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PlayerSpawnState } from '@/player/player_spawn_state.js';

describe('PlayerSpawnState', () => {
  it('starts without a spawn point', () => {
    const state = new PlayerSpawnState();
    expect(state.hasSpawnPoint()).toBe(false);
    expect(state.copySpawnFeetPositionTo(new THREE.Vector3())).toBeNull();
  });

  it('stores and clears a placed spawn point', () => {
    const state = new PlayerSpawnState();
    const feet = new THREE.Vector3(2, 0, -4);
    state.placeSpawn(feet, Math.PI / 2);
    expect(state.hasSpawnPoint()).toBe(true);
    expect(state.getSpawnYawRadians()).toBeCloseTo(Math.PI / 2);
    const out = new THREE.Vector3();
    expect(state.copySpawnFeetPositionTo(out)).toBe(out);
    expect(out.x).toBeCloseTo(2);
    expect(out.z).toBeCloseTo(-4);
    state.clearSpawn();
    expect(state.hasSpawnPoint()).toBe(false);
  });

  it('copies spawn position so later mutation of the source is ignored', () => {
    const state = new PlayerSpawnState();
    const feet = new THREE.Vector3(1, 0, 1);
    state.placeSpawn(feet, 0);
    feet.set(99, 99, 99);
    const out = new THREE.Vector3();
    state.copySpawnFeetPositionTo(out);
    expect(out.x).toBeCloseTo(1);
    expect(out.z).toBeCloseTo(1);
  });
});
