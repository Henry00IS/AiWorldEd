import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { physicsShatterInputHash } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_hash.js';
import {
  physicsShatterTestInputs,
  physicsShatterTestSettings,
  physicsShatterTestWall,
} from './physics_shatter_fixtures.js';

describe('physicsShatterInputHash', () => {
  it('stays the same for the same inputs and changes with seed, settings or geometry', () => {
    const wall = physicsShatterTestWall(2, 2, 0.2);
    const settings = physicsShatterTestSettings();
    const hash = physicsShatterInputHash(physicsShatterTestInputs(wall), settings);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect(physicsShatterInputHash(physicsShatterTestInputs(wall.clone()), physicsShatterTestSettings())).toBe(hash);
    expect(physicsShatterInputHash(physicsShatterTestInputs(wall), { ...settings, seed: 8 })).not.toBe(hash);
    expect(physicsShatterInputHash(physicsShatterTestInputs(wall), { ...settings, crackSize: 0.4 })).not.toBe(hash);
    const moved = wall.clone();
    moved.transformVertices(new THREE.Matrix4().makeTranslation(0, 0.01, 0));
    expect(physicsShatterInputHash(physicsShatterTestInputs(moved), settings)).not.toBe(hash);
  });
});
