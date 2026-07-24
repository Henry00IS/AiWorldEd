import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  axisToVector,
  buildCoordinateRotation,
  buildExportRootTransform,
  isReflectionMatrix,
  metersPerImperialUnit,
  metersPerMetricUnit,
  unitsPerMeter
} from '../../src/io/coordinate_space_transform.js';
import { getBuiltInCoordinateSpace } from '../../src/settings/coordinate_space_presets.js';
import { createDefaultGameProfile } from '../../src/settings/settings_defaults.js';
import type { GameProfile } from '../../src/settings/settings_types.js';
import type { CoordinateSpaceDefinition } from '../../src/settings/coordinate_space_types.js';

describe('coordinate_space_transform', () => {
  it('should map axis tokens to signed unit vectors', () => {
    expect(axisToVector('+x').toArray()).toEqual([1, 0, 0]);
    expect(axisToVector('-y').toArray()).toEqual([0, -1, 0]);
    expect(axisToVector('-z').toArray()).toEqual([0, 0, -1]);
  });

  it('should build identity rotation for the Godot / editor preset', () => {
    const godot = getBuiltInCoordinateSpace('godot')!;
    const rotation = buildCoordinateRotation(godot);
    expect(normalizeZeroSign(rotation.elements)).toEqual(
      normalizeZeroSign(new THREE.Matrix3().elements)
    );
  });

  it('should map editor +Y up to Blender +Z up via a 90deg X rotation', () => {
    const blender = getBuiltInCoordinateSpace('blender')!;
    const rotation = buildCoordinateRotation(blender);
    const editorUp = new THREE.Vector3(0, 1, 0);
    const blenderUp = editorUp.applyMatrix3(rotation);
    expect(blenderUp.x).toBeCloseTo(0, 6);
    expect(blenderUp.y).toBeCloseTo(0, 6);
    expect(blenderUp.z).toBeCloseTo(1, 6);
  });

  it('should map editor -Z forward to Blender +Y forward', () => {
    const blender = getBuiltInCoordinateSpace('blender')!;
    const rotation = buildCoordinateRotation(blender);
    const editorForward = new THREE.Vector3(0, 0, -1);
    const blenderForward = editorForward.applyMatrix3(rotation);
    expect(blenderForward.x).toBeCloseTo(0, 6);
    expect(blenderForward.y).toBeCloseTo(1, 6);
    expect(blenderForward.z).toBeCloseTo(0, 6);
  });

  it('should produce a reflection for left-handed Unity preset', () => {
    const unity = getBuiltInCoordinateSpace('unity')!;
    const rotation = buildCoordinateRotation(unity);
    const composed = new THREE.Matrix4().setFromMatrix3(rotation);
    expect(isReflectionMatrix(composed)).toBe(true);
  });

  it('should report no reflection for right-handed Blender preset', () => {
    const blender = getBuiltInCoordinateSpace('blender')!;
    const rotation = buildCoordinateRotation(blender);
    const composed = new THREE.Matrix4().setFromMatrix3(rotation);
    expect(isReflectionMatrix(composed)).toBe(false);
  });

  it('should scale by 100 for centimeter profile', () => {
    const profile = createDefaultGameProfile('p-cm', 'Centi');
    profile.metricUnit = 'centimeter';
    expect(unitsPerMeter(profile)).toBeCloseTo(100, 6);
  });

  it('should scale by 1000 for millimeter profile', () => {
    const profile = createDefaultGameProfile('p-mm', 'Milli');
    profile.metricUnit = 'millimeter';
    expect(unitsPerMeter(profile)).toBeCloseTo(1000, 6);
  });

  it('should scale by ~3.28084 for imperial foot profile', () => {
    const profile = createDefaultGameProfile('p-ft', 'Foot');
    profile.unitSystem = 'imperial';
    profile.imperialUnit = 'foot';
    expect(unitsPerMeter(profile)).toBeCloseTo(3.28084, 4);
  });

  it('should expose meter length in metric and imperial units', () => {
    expect(metersPerMetricUnit('meter')).toBe(1);
    expect(metersPerMetricUnit('centimeter')).toBeCloseTo(0.01, 6);
    expect(metersPerMetricUnit('kilometer')).toBe(1000);
    expect(metersPerImperialUnit('foot')).toBeCloseTo(0.3048, 6);
    expect(metersPerImperialUnit('mile')).toBeCloseTo(1609.344, 3);
  });

  it('should return identity transform for a null profile', () => {
    const matrix = buildExportRootTransform(null);
    expect(matrix.elements).toEqual(new THREE.Matrix4().elements);
  });

  it('should return identity transform for a default Godot meter profile', () => {
    const profile = createDefaultGameProfile('p-godot', 'Godot');
    const matrix = buildExportRootTransform(profile);
    expect(normalizeZeroSign(matrix.elements)).toEqual(
      normalizeZeroSign(new THREE.Matrix4().elements)
    );
  });

  it('should bake unit scale and Blender rotation into one Matrix4', () => {
    const profile = createDefaultGameProfile('p-blender-cm', 'Blender cm');
    profile.metricUnit = 'centimeter';
    profile.coordinateSpace = getBuiltInCoordinateSpace('blender')!;
    const matrix = buildExportRootTransform(profile);
    const editorPoint = new THREE.Vector3(0, 1, 0).applyMatrix4(matrix);
    expect(editorPoint.x).toBeCloseTo(0, 5);
    expect(editorPoint.y).toBeCloseTo(0, 5);
    expect(editorPoint.z).toBeCloseTo(100, 5);
  });

  it('should keep you at the same physical point when only the unit changes for Godot', () => {
    const profile: GameProfile = createDefaultGameProfile('p-cm-godot', 'Godot cm');
    profile.metricUnit = 'centimeter';
    const matrix = buildExportRootTransform(profile);
    const position = new THREE.Vector3(2, 4, -1).applyMatrix4(matrix);
    expect(position.x).toBeCloseTo(200, 5);
    expect(position.y).toBeCloseTo(400, 5);
    expect(position.z).toBeCloseTo(-100, 5);
  });

  it('should ignore stored handedness that disagrees with the axes', () => {
    const space = getBuiltInCoordinateSpace('godot')!;
    const overridden: CoordinateSpaceDefinition = {
      ...space,
      name: 'Godot with stale metadata',
      handedness: 'left',
      isCustom: true
    };
    const natural = buildCoordinateRotation(space);
    const overriddenRotation = buildCoordinateRotation(overridden);
    expect(overriddenRotation.elements).toEqual(natural.elements);
  });

  it('should not add a reflection when stored handedness matches the axes', () => {
    const blender = getBuiltInCoordinateSpace('blender')!;
    expect(
      new THREE.Matrix4()
        .setFromMatrix3(buildCoordinateRotation(blender))
        .determinant()
    ).toBeGreaterThan(0);
  });
});

/**
 * Normalizes negative-zero entries so equality comparisons ignore the
 * signed-zero artifacts produced by Three.js' negate() helpers.
 * @param elements Matrix or vector elements.
 * @returns New array with -0 replaced by 0.
 */
function normalizeZeroSign(elements: ArrayLike<number>): number[] {
  return Array.from(elements).map((value) => (value === 0 ? 0 : value));
}
