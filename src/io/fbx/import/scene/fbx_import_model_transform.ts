import * as THREE from 'three';
import type { FbxImportProperties } from '@/io/fbx/import/parse/fbx_import_properties.js';

/** Three.js Euler order per FBX rotation order (FBX "XYZ" applies X first). */
const FBX_IMPORT_EULER_ORDERS: readonly THREE.EulerOrder[] = ['ZYX', 'YZX', 'XZY', 'ZXY', 'YXZ', 'XYZ', 'ZYX'];

/** Origin vector used for missing offsets and pivots. */
const FBX_IMPORT_ZERO: readonly [number, number, number] = [0, 0, 0];

/** Unit vector used for missing scales. */
const FBX_IMPORT_ONE: readonly [number, number, number] = [1, 1, 1];

/**
 * Builds the local matrix of a model in file coordinates: T · Roff · Rp · Rpre
 * · R · Rpost⁻¹ · Rp⁻¹ · Soff · Sp · S · Sp⁻¹. Pre and post rotation and the
 * rotation order only apply when RotationActive is set.
 *
 * @param properties Model properties.
 * @returns Local matrix.
 */
export function fbxImportModelLocalMatrix(properties: FbxImportProperties): THREE.Matrix4 {
  const rotationActive = properties.number('RotationActive', 0) !== 0;
  const order = rotationActive ? properties.number('RotationOrder', 0) : 0;
  const pivotRotation = fbxImportTranslation(properties, 'RotationPivot');
  const pivotScaling = fbxImportTranslation(properties, 'ScalingPivot');
  return new THREE.Matrix4()
    .multiply(fbxImportTranslation(properties, 'Lcl Translation'))
    .multiply(fbxImportTranslation(properties, 'RotationOffset'))
    .multiply(pivotRotation)
    .multiply(rotationActive ? fbxImportRotation(properties, 'PreRotation', 0) : new THREE.Matrix4())
    .multiply(fbxImportRotation(properties, 'Lcl Rotation', order))
    .multiply(rotationActive ? fbxImportRotation(properties, 'PostRotation', 0).invert() : new THREE.Matrix4())
    .multiply(pivotRotation.clone().invert())
    .multiply(fbxImportTranslation(properties, 'ScalingOffset'))
    .multiply(pivotScaling)
    .multiply(new THREE.Matrix4().makeScale(...properties.vector3('Lcl Scaling', FBX_IMPORT_ONE)))
    .multiply(pivotScaling.clone().invert());
}

/**
 * Builds the geometric (vertex-only, not inherited) matrix of a model.
 *
 * @param properties Model properties.
 * @returns Geometric matrix.
 */
export function fbxImportModelGeometricMatrix(properties: FbxImportProperties): THREE.Matrix4 {
  return new THREE.Matrix4()
    .multiply(fbxImportTranslation(properties, 'GeometricTranslation'))
    .multiply(fbxImportRotation(properties, 'GeometricRotation', 0))
    .multiply(new THREE.Matrix4().makeScale(...properties.vector3('GeometricScaling', FBX_IMPORT_ONE)));
}

/**
 * Builds a translation matrix from a vector property.
 *
 * @param properties Model properties.
 * @param name Property name.
 * @returns Translation matrix.
 */
function fbxImportTranslation(properties: FbxImportProperties, name: string): THREE.Matrix4 {
  return new THREE.Matrix4().makeTranslation(...properties.vector3(name, FBX_IMPORT_ZERO));
}

/**
 * Builds a rotation matrix from a degrees property.
 *
 * @param properties Model properties.
 * @param name Property name.
 * @param order FBX rotation order (0 = XYZ).
 * @returns Rotation matrix.
 */
function fbxImportRotation(properties: FbxImportProperties, name: string, order: number): THREE.Matrix4 {
  const [x, y, z] = properties.vector3(name, FBX_IMPORT_ZERO).map(THREE.MathUtils.degToRad);
  const euler = new THREE.Euler(x, y, z, FBX_IMPORT_EULER_ORDERS[order] ?? 'ZYX');
  return new THREE.Matrix4().makeRotationFromEuler(euler);
}
