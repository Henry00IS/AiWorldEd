import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  fbxImportModelGeometricMatrix,
  fbxImportModelLocalMatrix,
} from '@/io/fbx/import/scene/fbx_import_model_transform.js';
import { FbxImportProperties } from '@/io/fbx/import/parse/fbx_import_properties.js';
import { FbxImportNode } from '@/io/fbx/import/parse/fbx_import_node.js';

/**
 * Builds model properties.
 *
 * @param values Property name to values.
 * @returns Properties.
 */
function properties(values: Record<string, number[]>): FbxImportProperties {
  const records = Object.entries(values).map(
    ([name, entries]) => new FbxImportNode('P', [name, '', '', '', ...entries], []),
  );
  return new FbxImportProperties(new FbxImportNode('Model', [], [new FbxImportNode('Properties70', [], records)]));
}

/**
 * Transforms a point and rounds it.
 *
 * @param matrix Matrix.
 * @param point Point.
 * @returns Rounded components.
 */
function moved(matrix: THREE.Matrix4, point: [number, number, number]): number[] {
  return new THREE.Vector3(...point)
    .applyMatrix4(matrix)
    .toArray()
    .map((value) => Math.round(value * 1e6) / 1e6 + 0);
}

describe('fbxImportModelLocalMatrix', () => {
  it('applies rotation order XYZ as X first, then Y, then Z', () => {
    const matrix = fbxImportModelLocalMatrix(properties({ 'Lcl Rotation': [90, 90, 0] }));
    const xThenY = new THREE.Vector3(0, 1, 0)
      .applyAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    expect(moved(matrix, [0, 1, 0])).toEqual(xThenY.toArray().map((value) => Math.round(value * 1e6) / 1e6 + 0));
  });

  it('applies translation after rotation and scale', () => {
    const matrix = fbxImportModelLocalMatrix(
      properties({ 'Lcl Translation': [5, 0, 0], 'Lcl Rotation': [0, 0, 90], 'Lcl Scaling': [2, 2, 2] }),
    );
    expect(moved(matrix, [1, 0, 0])).toEqual([5, 2, 0]);
  });

  it('rotates around the rotation pivot', () => {
    const matrix = fbxImportModelLocalMatrix(properties({ 'Lcl Rotation': [0, 0, 180], RotationPivot: [1, 0, 0] }));
    expect(moved(matrix, [1, 0, 0])).toEqual([1, 0, 0]);
    expect(moved(matrix, [0, 0, 0])).toEqual([2, 0, 0]);
  });

  it('uses pre-rotation only when rotation is active', () => {
    const inactive = fbxImportModelLocalMatrix(properties({ PreRotation: [0, 0, 90] }));
    const active = fbxImportModelLocalMatrix(properties({ PreRotation: [0, 0, 90], RotationActive: [1] }));
    expect(moved(inactive, [1, 0, 0])).toEqual([1, 0, 0]);
    expect(moved(active, [1, 0, 0])).toEqual([0, 1, 0]);
  });
});

describe('fbxImportModelGeometricMatrix', () => {
  it('offsets, rotates and scales vertices only', () => {
    const matrix = fbxImportModelGeometricMatrix(
      properties({ GeometricTranslation: [0, 1, 0], GeometricRotation: [0, 0, 90], GeometricScaling: [3, 3, 3] }),
    );
    expect(moved(matrix, [1, 0, 0])).toEqual([0, 4, 0]);
  });
});
