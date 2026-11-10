import * as THREE from 'three';
import type { FbxImportProperties } from '@/io/fbx/import/parse/fbx_import_properties.js';

/** Centimeters per meter (FBX unit scale factors are in centimeters). */
const FBX_IMPORT_CENTIMETERS_PER_METER = 100;

/** Unit vector per FBX axis index (0 = X, 1 = Y, 2 = Z). */
const FBX_IMPORT_AXIS_VECTORS: readonly THREE.Vector3[] = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 0, 1),
];

/**
 * Builds the matrix that takes file coordinates into editor space (meters, +Y
 * up, +Z toward the viewer, +X right): the file's coord axis maps to +X, its up
 * axis to +Y and its front axis to +Z, then file units scale to meters
 * (UnitScaleFactor is centimeters per file unit). Files without axis settings
 * use the FBX defaults (Y up, Z front, X coord, centimeters).
 *
 * @param settings Global settings of the file.
 * @returns Conversion matrix (rotation or reflection times uniform scale).
 */
export function fbxImportAxisConversion(settings: FbxImportProperties): THREE.Matrix4 {
  const coord = fbxImportAxisVector(settings, 'CoordAxis', 0);
  const up = fbxImportAxisVector(settings, 'UpAxis', 1);
  const front = fbxImportAxisVector(settings, 'FrontAxis', 2);
  const basis = new THREE.Matrix4().makeBasis(coord, up, front);
  const rotation = Math.abs(basis.determinant()) > 0.5 ? basis.transpose() : new THREE.Matrix4();
  const scale = fbxImportMetersPerFileUnit(settings);
  return new THREE.Matrix4().makeScale(scale, scale, scale).multiply(rotation);
}

/**
 * Returns the length of one file unit in meters.
 *
 * @param settings Global settings of the file.
 * @returns Meters per unit.
 */
function fbxImportMetersPerFileUnit(settings: FbxImportProperties): number {
  const centimeters = settings.number('UnitScaleFactor', 1);
  return centimeters > 0 && Number.isFinite(centimeters) ? centimeters / FBX_IMPORT_CENTIMETERS_PER_METER : 0.01;
}

/**
 * Reads one signed axis of the file's axis system.
 *
 * @param settings Global settings.
 * @param name Axis property name ("UpAxis", "FrontAxis", "CoordAxis").
 * @param fallbackAxis Axis index when missing.
 * @returns Signed unit vector in file coordinates.
 */
function fbxImportAxisVector(settings: FbxImportProperties, name: string, fallbackAxis: number): THREE.Vector3 {
  const axis = FBX_IMPORT_AXIS_VECTORS[settings.number(name, fallbackAxis)] ?? FBX_IMPORT_AXIS_VECTORS[fallbackAxis];
  const sign = settings.number(`${name}Sign`, 1) < 0 ? -1 : 1;
  return (axis ?? new THREE.Vector3()).clone().multiplyScalar(sign);
}
