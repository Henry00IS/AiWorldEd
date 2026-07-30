import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  CoordinateSpaceAdapter,
  type CoordinateTransformComponents,
} from '../../src/coordinates/coordinate_space_adapter.js';
import { getBuiltInCoordinateSpace } from '../../src/settings/coordinate_space_presets.js';

describe('CoordinateSpaceAdapter', () => {
  it('keeps the default Godot presentation as an exact identity', () => {
    const adapter = createAdapter('godot');
    expect(adapter.isIdentity()).toBe(true);
    expect(adapter.getEditorToProfileBasis().elements).toEqual(new THREE.Matrix3().elements);
  });

  it('round-trips generated positions and directions for every built-in profile', () => {
    const random = createDeterministicRandom(9127);
    for (const profileId of ['godot', 'blender', 'unity', 'unreal']) {
      const adapter = createAdapter(profileId);
      for (let index = 0; index < 16; index += 1) {
        const position = generatedVector(random, 40);
        const direction = generatedVector(random, 1).normalize();
        expectVectorClose(adapter.toEditorPosition(adapter.toProfilePosition(position)), position);
        expectVectorClose(adapter.toEditorDirection(adapter.toProfileDirection(direction)), direction);
      }
    }
  });

  it('round-trips generated transform matrices through right- and left-handed profiles', () => {
    const random = createDeterministicRandom(1441);
    for (const profileId of ['blender', 'unity', 'unreal']) {
      const adapter = createAdapter(profileId);
      for (let index = 0; index < 12; index += 1) {
        const components = generatedTransform(random);
        const editorMatrix = composeTransform(components);
        const roundTrip = adapter.toEditorMatrix(adapter.toProfileMatrix(editorMatrix));
        expectMatrixClose(roundTrip, editorMatrix);
      }
    }
  });

  it('converts decomposed transforms without mutating supplied components', () => {
    const adapter = createAdapter('unity');
    const source = generatedTransform(createDeterministicRandom(331));
    const sourceMatrix = composeTransform(source);
    const converted = adapter.toProfileTransform(source.position, source.quaternion, source.scale);
    const restored = adapter.toEditorTransform(converted.position, converted.quaternion, converted.scale);
    expectMatrixClose(composeTransform(restored), sourceMatrix);
    expectMatrixClose(composeTransform(source), sourceMatrix);
  });

  it('maps profile axes back to the semantic editor directions', () => {
    const blenderAdapter = createAdapter('blender');
    expectVectorClose(blenderAdapter.profileAxisToEditorDirection('x'), new THREE.Vector3(1, 0, 0));
    expectVectorClose(blenderAdapter.profileAxisToEditorDirection('y'), new THREE.Vector3(0, 0, -1));
    expectVectorClose(blenderAdapter.profileAxisToEditorDirection('z'), new THREE.Vector3(0, 1, 0));
  });
});

/**
 * Creates an adapter for a required built-in profile.
 *
 * @param profileId Built-in profile identifier.
 * @returns Coordinate adapter.
 */
function createAdapter(profileId: string): CoordinateSpaceAdapter {
  const space = getBuiltInCoordinateSpace(profileId);
  if (!space) throw new Error(`Missing coordinate profile ${profileId}`);
  return new CoordinateSpaceAdapter(space);
}

/**
 * Creates deterministic pseudo-random values for repeatable generated cases.
 *
 * @param initialSeed Initial integer seed.
 * @returns Number generator in the range zero through one.
 */
function createDeterministicRandom(initialSeed: number): () => number {
  let seed = initialSeed >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

/**
 * Generates a vector without relying on production object positions.
 *
 * @param random Deterministic number generator.
 * @param extent Maximum absolute component.
 * @returns Generated vector.
 */
function generatedVector(random: () => number, extent: number): THREE.Vector3 {
  return new THREE.Vector3(...([0, 1, 2].map(() => (random() * 2 - 1) * extent) as [number, number, number]));
}

/**
 * Generates a valid transform with nonuniform positive scale.
 *
 * @param random Deterministic number generator.
 * @returns Generated transform components.
 */
function generatedTransform(random: () => number): CoordinateTransformComponents {
  const position = generatedVector(random, 30);
  const rotation = generatedVector(random, Math.PI);
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation.x, rotation.y, rotation.z, 'XYZ'));
  const scale = generatedVector(random, 2).set(random() * 2.5 + 0.25, random() * 2.5 + 0.25, random() * 2.5 + 0.25);
  return { position, quaternion, scale };
}

/**
 * Composes transform components for stable matrix comparisons.
 *
 * @param components Transform components.
 * @returns Composed transform matrix.
 */
function composeTransform(components: CoordinateTransformComponents): THREE.Matrix4 {
  return new THREE.Matrix4().compose(components.position, components.quaternion, components.scale);
}

/**
 * Expects two vectors to be numerically equivalent.
 *
 * @param actual Actual vector.
 * @param expected Expected vector.
 */
function expectVectorClose(actual: THREE.Vector3, expected: THREE.Vector3): void {
  expect(actual.distanceTo(expected)).toBeLessThan(1e-7);
}

/**
 * Expects two matrices to be numerically equivalent.
 *
 * @param actual Actual matrix.
 * @param expected Expected matrix.
 */
function expectMatrixClose(actual: THREE.Matrix4, expected: THREE.Matrix4): void {
  actual.elements.forEach((value, index) => expect(value).toBeCloseTo(expected.elements[index]!, 7));
}
