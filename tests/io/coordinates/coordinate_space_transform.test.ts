import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  axisToVector,
  buildCoordinateRotation,
  buildExportRootTransform,
  isReflectionMatrix,
  metersPerMetricUnit,
  resolveFbxUnitScaleFactor,
  unitsPerMeter,
} from '@/io/coordinates/coordinate_space_transform.js';
import { getBuiltInCoordinateSpace } from '@/settings/coordinate/coordinate_space_presets.js';
import type { ExportSpace, MetricUnit } from '@/io/coordinates/export_space.js';

describe('coordinate_space_transform', () => {
  it('should map axis tokens to signed unit vectors', () => {
    expect(axisToVector('+x').toArray()).toEqual([1, 0, 0]);
    expect(axisToVector('-y').toArray()).toEqual([0, -1, 0]);
    expect(axisToVector('-z').toArray()).toEqual([0, 0, -1]);
  });

  it('should build identity rotation for the Godot / editor preset', () => {
    const godot = getBuiltInCoordinateSpace('godot')!;
    const rotation = buildCoordinateRotation(godot);
    expect(normalizeZeroSign(rotation.elements)).toEqual(normalizeZeroSign(new THREE.Matrix3().elements));
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

  it("should map the editor's model front (+Z) to Blender's (-Y)", () => {
    const blender = getBuiltInCoordinateSpace('blender')!;
    const rotation = buildCoordinateRotation(blender);
    const editorForward = new THREE.Vector3(0, 0, 1);
    const blenderForward = editorForward.applyMatrix3(rotation);
    expect(blenderForward.x).toBeCloseTo(0, 6);
    expect(blenderForward.y).toBeCloseTo(-1, 6);
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

  it('should scale by 100 for centimeters', () => {
    expect(unitsPerMeter(godotSpace('centimeter'))).toBeCloseTo(100, 6);
  });

  it('should expose meter length in metric units', () => {
    expect(metersPerMetricUnit('meter')).toBe(1);
    expect(metersPerMetricUnit('centimeter')).toBeCloseTo(0.01, 6);
  });

  it('should resolve FBX UnitScaleFactor as centimeters per file unit', () => {
    expect(resolveFbxUnitScaleFactor(null)).toBe(100);
    expect(resolveFbxUnitScaleFactor(godotSpace('meter'))).toBeCloseTo(100, 6);
    expect(resolveFbxUnitScaleFactor(godotSpace('centimeter'))).toBeCloseTo(1, 6);
  });

  it('should return identity transform without an export space', () => {
    const matrix = buildExportRootTransform(null);
    expect(matrix.elements).toEqual(new THREE.Matrix4().elements);
  });

  it('should return identity transform for Godot in meters', () => {
    const matrix = buildExportRootTransform(godotSpace('meter'));
    expect(normalizeZeroSign(matrix.elements)).toEqual(normalizeZeroSign(new THREE.Matrix4().elements));
  });

  it('should bake unit scale and Blender rotation into one Matrix4', () => {
    const space: ExportSpace = { coordinateSpace: getBuiltInCoordinateSpace('blender')!, metricUnit: 'centimeter' };
    const matrix = buildExportRootTransform(space);
    const editorPoint = new THREE.Vector3(0, 1, 0).applyMatrix4(matrix);
    expect(editorPoint.x).toBeCloseTo(0, 5);
    expect(editorPoint.y).toBeCloseTo(0, 5);
    expect(editorPoint.z).toBeCloseTo(100, 5);
  });

  it('should keep you at the same physical point when only the unit changes for Godot', () => {
    const matrix = buildExportRootTransform(godotSpace('centimeter'));
    const position = new THREE.Vector3(2, 4, -1).applyMatrix4(matrix);
    expect(position.x).toBeCloseTo(200, 5);
    expect(position.y).toBeCloseTo(400, 5);
    expect(position.z).toBeCloseTo(-100, 5);
  });
});

/**
 * Normalizes negative-zero entries so equality comparisons ignore the
 * signed-zero artifacts produced by Three.js' negate() helpers.
 *
 * @param elements Matrix or vector elements.
 * @returns New array with -0 replaced by 0.
 */
function normalizeZeroSign(elements: ArrayLike<number>): number[] {
  return Array.from(elements).map((value) => (value === 0 ? 0 : value));
}

/**
 * Builds an export space with the editor's (Godot) axes.
 *
 * @param metricUnit Length of one file unit.
 * @returns Export space.
 */
function godotSpace(metricUnit: MetricUnit): ExportSpace {
  return { coordinateSpace: getBuiltInCoordinateSpace('godot')!, metricUnit };
}
