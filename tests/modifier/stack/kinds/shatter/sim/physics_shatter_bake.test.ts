import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  PHYSICS_SHATTER_BAKE_VERSION,
  physicsShatterBakeDecode,
  physicsShatterBakeEncode,
} from '@/modifier/stack/kinds/shatter/sim/physics_shatter_bake.js';
import { PHYSICS_SHATTER_SIM_MAX_MOVING_PIECES } from '@/modifier/stack/kinds/shatter/sim/physics_shatter_sim.js';
import {
  PHYSICS_SHATTER_BAKE_KEY,
  physicsShatterBakeKeep,
} from '@/modifier/stack/kinds/shatter/physics_shatter_bake_state.js';
import {
  physicsShatterTransformIdentity,
  type PhysicsShatterPieceTransform,
} from '@/modifier/stack/kinds/shatter/physics_shatter_transform.js';

/**
 * Builds a transform list with turned, moved pieces and one identity piece.
 *
 * @param count Piece count.
 * @returns Transforms.
 */
function bakeTestTransforms(count: number): PhysicsShatterPieceTransform[] {
  return Array.from({ length: count }, (_unused, index) => {
    if (index === 1) return physicsShatterTransformIdentity();
    const axis = new THREE.Vector3(index + 1, 2, -index).normalize();
    const rotation = new THREE.Quaternion().setFromAxisAngle(axis, 0.3 * (index + 1));
    return { rotation, translation: new THREE.Vector3(index * 0.5, -index, 1.25 + index) };
  });
}

/**
 * Rewrites the version byte of bake text.
 *
 * @param bake Bake text.
 * @param version New version byte.
 * @returns Changed bake text.
 */
function bakeTestWithVersion(bake: string, version: number): string {
  const bytes = Uint8Array.from(atob(bake), (character) => character.charCodeAt(0));
  bytes[0] = version;
  return btoa(String.fromCharCode(...bytes));
}

describe('physics shatter bake codec', () => {
  it('stores a version byte, the piece count and 28 bytes of position and rotation per piece', () => {
    const transforms = bakeTestTransforms(5);
    const bytes = atob(physicsShatterBakeEncode(transforms));
    expect(bytes.charCodeAt(0)).toBe(PHYSICS_SHATTER_BAKE_VERSION);
    expect(bytes.charCodeAt(1) + bytes.charCodeAt(2) * 256).toBe(transforms.length);
    expect(bytes.length).toBe(3 + 28 * transforms.length);
  });

  it('round-trips every pose in piece order, identity included', () => {
    const transforms = bakeTestTransforms(7);
    const decoded = physicsShatterBakeDecode(physicsShatterBakeEncode(transforms), transforms.length);
    expect(decoded).not.toBeNull();
    transforms.forEach((transform, index) => {
      const back = decoded?.[index];
      expect(back?.translation.distanceTo(transform.translation)).toBeLessThan(1e-5);
      expect(Math.abs(back?.rotation.dot(transform.rotation) ?? 0)).toBeGreaterThan(1 - 1e-6);
    });
  });

  it('decodes another version, another piece count or malformed text as no bake', () => {
    const bake = physicsShatterBakeEncode(bakeTestTransforms(3));
    expect(physicsShatterBakeDecode(bakeTestWithVersion(bake, PHYSICS_SHATTER_BAKE_VERSION + 1), 3)).toBeNull();
    expect(physicsShatterBakeDecode(bake, 4)).toBeNull();
    expect(physicsShatterBakeDecode('not base64 at all!', 3)).toBeNull();
    expect(physicsShatterBakeDecode(bake.slice(0, 8), 3)).toBeNull();
  });

  it('keeps a bake of the most pieces a simulation may move', () => {
    const transforms = bakeTestTransforms(PHYSICS_SHATTER_SIM_MAX_MOVING_PIECES);
    const bake = physicsShatterBakeEncode(transforms);
    const kept: Record<string, unknown> = {};
    physicsShatterBakeKeep({ bake, bakeHash: '0123456789abcdef' }, kept);
    expect(kept[PHYSICS_SHATTER_BAKE_KEY]).toBe(bake);
    expect(physicsShatterBakeDecode(bake, transforms.length)).toHaveLength(transforms.length);
  });
});
