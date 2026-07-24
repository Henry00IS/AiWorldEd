import * as THREE from 'three';
import type {
  AxisDirection,
  CoordinateSpaceDefinition
} from '../settings/coordinate_space_types.js';
import type { GameProfile } from '../settings/settings_types.js';
import type { ImperialUnit, MetricUnit } from '../settings/unit_presets.js';

/**
 * Editor's internal coordinate space convention.
 * Mirrors Three.js / Godot defaults: right +X, up +Y, forward -Z, right-handed.
 * All scene data in the world group is authored in this space.
 */
export const EDITOR_COORDINATE_SPACE: Readonly<CoordinateSpaceDefinition> = Object.freeze({
  presetId: 'editor',
  name: 'Editor (Three.js)',
  handedness: 'right',
  up: '+y',
  right: '+x',
  forward: '-z',
  isCustom: false
});

/**
 * Length of one meter expressed in the supplied metric unit.
 * @param unit Metric unit identifier.
 * @returns Meters-per-unit scale numerator (1m / unit in meters).
 */
export function metersPerMetricUnit(unit: MetricUnit): number {
  switch (unit) {
    case 'millimeter':
      return 0.001;
    case 'centimeter':
      return 0.01;
    case 'meter':
      return 1;
    case 'kilometer':
      return 1000;
  }
}

/**
 * Length of one meter expressed in the supplied imperial unit.
 * @param unit Imperial unit identifier.
 * @returns Meters-per-unit scale numerator (1m / unit in meters).
 */
export function metersPerImperialUnit(unit: ImperialUnit): number {
  switch (unit) {
    case 'inch':
      return 0.0254;
    case 'foot':
      return 0.3048;
    case 'yard':
      return 0.9144;
    case 'mile':
      return 1609.344;
  }
}

/**
 * Returns the length of one meter in the profile's selected length unit.
 * Editor authored values are in meters. Multiplying editor coordinates
 * by this factor expresses the same physical length in the target unit.
 * @param profile Active game profile.
 * @returns Units-per-meter scale (e.g. 100 for centimeter, ~3.28 for foot).
 */
export function unitsPerMeter(profile: GameProfile): number {
  const metersPerUnit = resolveMetersPerUnit(profile);
  return metersPerUnit === 0 ? 1 : 1 / metersPerUnit;
}

/**
 * Resolves the meters-per-unit factor for the profile's selected unit.
 * @param profile Active game profile.
 * @returns Length of one profile unit in meters.
 */
function resolveMetersPerUnit(profile: GameProfile): number {
  if (profile.unitSystem === 'metric') {
    return metersPerMetricUnit(profile.metricUnit);
  }
  return metersPerImperialUnit(profile.imperialUnit);
}

/**
 * Converts an axis direction token to a signed unit vector in editor space.
 * @param axis Axis direction token.
 * @returns Three.js unit vector for that axis direction.
 */
export function axisToVector(axis: AxisDirection): THREE.Vector3 {
  switch (axis) {
    case '+x':
      return new THREE.Vector3(1, 0, 0);
    case '-x':
      return new THREE.Vector3(-1, 0, 0);
    case '+y':
      return new THREE.Vector3(0, 1, 0);
    case '-y':
      return new THREE.Vector3(0, -1, 0);
    case '+z':
      return new THREE.Vector3(0, 0, 1);
    case '-z':
      return new THREE.Vector3(0, 0, -1);
  }
}

/**
 * Builds the 3x3 rotation (including any axis-derived reflection) that re-maps
 * editor-space coordinates into the target profile's coordinate space.
 * The editor's source convention is right +X, up +Y, forward -Z (Three.js).
 * The matrix columns are the target's right/up/(-forward) axes expressed
 * in editor space; the final column negates forward because editor +Z
 * corresponds to the editor's -forward direction.
 *
 * Handedness is determined by the three axes. The stored handedness is a
 * descriptive value and does not independently alter the export transform.
 * @param target Target coordinate space definition.
 * @returns Column-major 3x3 rotation matrix elements [r00..r22].
 */
export function buildCoordinateRotation(
  target: CoordinateSpaceDefinition
): THREE.Matrix3 {
  const right = axisToVector(target.right);
  const up = axisToVector(target.up);
  const negativeForward = axisToVector(target.forward).negate();
  const rotation = new THREE.Matrix3(
    right.x, up.x, negativeForward.x,
    right.y, up.y, negativeForward.y,
    right.z, up.z, negativeForward.z
  );
  return rotation;
}

/**
 * Returns true when the supplied 4x4 transform has a negative determinant.
 * A negative determinant indicates a reflection (handedness flip),
 * which inverts face winding on baked geometry. Callers that bake the
 * transform into indexed geometry must also flip triangle winding.
 * @param matrix Transform matrix to inspect.
 * @returns True when the matrix is reflective.
 */
export function isReflectionMatrix(matrix: THREE.Matrix4): boolean {
  return matrix.determinant() < 0;
}

/**
 * Builds the root export transform combining unit scale and coordinate
 * space conversion. Applies to the wrapped export group's matrix.
 * Returns the identity matrix when the profile is null.
 * @param profile Active game profile, or null when no profile is active.
 * @returns 4x4 transform matrix (scale x rotation, no translation).
 */
export function buildExportRootTransform(profile: GameProfile | null): THREE.Matrix4 {
  if (!profile) {
    return new THREE.Matrix4();
  }
  const rotation = buildCoordinateRotation(profile.coordinateSpace);
  const scale = unitsPerMeter(profile);
  const matrix4 = new THREE.Matrix4();
  composeFromRotationScale(matrix4, rotation, scale);
  normalizeNegativeZeros(matrix4);
  return matrix4;
}

/**
 * Replaces negative-zero entries with positive zero so subsequent strict
 * equality comparisons (used by Matrix4.equals) treat the matrix as
 * exactly identity. Three.js' negate() helper can produce -0 entries,
 * which would otherwise defeat identity short-circuits.
 * @param matrix Matrix whose elements to normalize in place.
 */
function normalizeNegativeZeros(matrix: THREE.Matrix4): void {
  const elements = matrix.elements;
  for (let i = 0; i < elements.length; i++) {
    if (elements[i] === 0) {
      elements[i] = 0;
    }
  }
}

/**
 * Composes a 4x4 matrix from a 3x3 rotation and a uniform scale.
 * Avoids Three.js quaternion decomposition to preserve reflection in
 * the rotation matrix (compose() would lose the negative determinant).
 * @param destination Matrix to overwrite.
 * @param rotation 3x3 rotation (may be reflective).
 * @param scale Uniform scale factor.
 */
function composeFromRotationScale(
  destination: THREE.Matrix4,
  rotation: THREE.Matrix3,
  scale: number
): void {
  const r = rotation.elements;
  destination.set(
    r[0] * scale, r[3] * scale, r[6] * scale, 0,
    r[1] * scale, r[4] * scale, r[7] * scale, 0,
    r[2] * scale, r[5] * scale, r[8] * scale, 0,
    0, 0, 0, 1
  );
}
