import * as THREE from 'three';
import type { AxisDirection, CoordinateSpaceDefinition } from '../settings/coordinate_space_types.js';

/** Serializable transform components expressed in one coordinate space. */
export interface CoordinateTransformComponents {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}

/** Profile-space axis names used by viewport and transform presentation. */
export type CoordinateAxis = 'x' | 'y' | 'z';

/**
 * Reversible adapter between the immutable editor basis and one game-profile
 * coordinate space. Unit scaling is intentionally excluded.
 */
export class CoordinateSpaceAdapter {
  private readonly editorToProfileBasis: THREE.Matrix3;
  private readonly profileToEditorBasis: THREE.Matrix3;
  private readonly editorToProfileMatrix: THREE.Matrix4;
  private readonly profileToEditorMatrix: THREE.Matrix4;

  /**
   * Creates an adapter for a validated coordinate-space definition.
   *
   * @param space Target game-profile coordinate space.
   */
  constructor(space: CoordinateSpaceDefinition) {
    this.editorToProfileBasis = buildCoordinateBasis(space);
    this.profileToEditorBasis = this.editorToProfileBasis.clone().invert();
    this.editorToProfileMatrix = matrix4FromBasis(this.editorToProfileBasis);
    this.profileToEditorMatrix = matrix4FromBasis(this.profileToEditorBasis);
  }

  /**
   * Returns an independent editor-to-profile basis matrix.
   *
   * @returns Coordinate basis clone.
   */
  getEditorToProfileBasis(): THREE.Matrix3 {
    return this.editorToProfileBasis.clone();
  }

  /**
   * Returns an independent profile-to-editor basis matrix.
   *
   * @returns Inverse coordinate basis clone.
   */
  getProfileToEditorBasis(): THREE.Matrix3 {
    return this.profileToEditorBasis.clone();
  }

  /**
   * Converts an editor-space position to profile space.
   *
   * @param position Editor-space position.
   * @returns Converted position.
   */
  toProfilePosition(position: THREE.Vector3): THREE.Vector3 {
    return position.clone().applyMatrix3(this.editorToProfileBasis);
  }

  /**
   * Converts a profile-space position to editor space.
   *
   * @param position Profile-space position.
   * @returns Converted position.
   */
  toEditorPosition(position: THREE.Vector3): THREE.Vector3 {
    return position.clone().applyMatrix3(this.profileToEditorBasis);
  }

  /**
   * Converts and normalizes an editor-space direction.
   *
   * @param direction Editor-space direction.
   * @returns Profile-space direction.
   */
  toProfileDirection(direction: THREE.Vector3): THREE.Vector3 {
    return direction.clone().applyMatrix3(this.editorToProfileBasis).normalize();
  }

  /**
   * Converts and normalizes a profile-space direction.
   *
   * @param direction Profile-space direction.
   * @returns Editor-space direction.
   */
  toEditorDirection(direction: THREE.Vector3): THREE.Vector3 {
    return direction.clone().applyMatrix3(this.profileToEditorBasis).normalize();
  }

  /**
   * Converts an editor-space local transform matrix to profile space.
   *
   * @param matrix Editor-space transform.
   * @returns Profile-space transform.
   */
  toProfileMatrix(matrix: THREE.Matrix4): THREE.Matrix4 {
    return this.editorToProfileMatrix.clone().multiply(matrix).multiply(this.profileToEditorMatrix);
  }

  /**
   * Converts a profile-space local transform matrix to editor space.
   *
   * @param matrix Profile-space transform.
   * @returns Editor-space transform.
   */
  toEditorMatrix(matrix: THREE.Matrix4): THREE.Matrix4 {
    return this.profileToEditorMatrix.clone().multiply(matrix).multiply(this.editorToProfileMatrix);
  }

  /**
   * Converts editor transform components to profile components.
   *
   * @param position Editor-space position.
   * @param quaternion Editor-space orientation.
   * @param scale Editor-space scale.
   * @returns Converted transform components.
   */
  toProfileTransform(
    position: THREE.Vector3,
    quaternion: THREE.Quaternion,
    scale: THREE.Vector3,
  ): CoordinateTransformComponents {
    return decomposeMatrix(this.toProfileMatrix(composeMatrix(position, quaternion, scale)));
  }

  /**
   * Converts profile transform components to editor components.
   *
   * @param position Profile-space position.
   * @param quaternion Profile-space orientation.
   * @param scale Profile-space scale.
   * @returns Converted transform components.
   */
  toEditorTransform(
    position: THREE.Vector3,
    quaternion: THREE.Quaternion,
    scale: THREE.Vector3,
  ): CoordinateTransformComponents {
    return decomposeMatrix(this.toEditorMatrix(composeMatrix(position, quaternion, scale)));
  }

  /**
   * Resolves a positive profile axis as a direction in editor space.
   *
   * @param axis Profile X, Y, or Z axis.
   * @returns Editor-space unit direction.
   */
  profileAxisToEditorDirection(axis: CoordinateAxis): THREE.Vector3 {
    return this.toEditorDirection(vectorForCoordinateAxis(axis));
  }

  /**
   * Resolves which profile axis an editor axis represents.
   *
   * @param axis Positive editor X, Y, or Z.
   * @returns Corresponding profile axis, ignoring sign.
   */
  editorAxisToProfileAxis(axis: CoordinateAxis): CoordinateAxis {
    const converted = this.toProfileDirection(vectorForCoordinateAxis(axis));
    return coordinateAxisFromDirection(converted);
  }

  /**
   * Reports whether this adapter is the identity presentation.
   *
   * @returns True when profile and editor coordinates are identical.
   */
  isIdentity(): boolean {
    return matrix3ApproximatelyEquals(this.editorToProfileBasis, new THREE.Matrix3());
  }
}

/**
 * Builds the editor-to-profile basis used by presentation and export.
 *
 * @param space Target coordinate-space definition.
 * @returns Orthonormal basis, which may contain a reflection.
 */
export function buildCoordinateBasis(space: CoordinateSpaceDefinition): THREE.Matrix3 {
  const right = axisDirectionToVector(space.right);
  const up = axisDirectionToVector(space.up);
  const negativeForward = axisDirectionToVector(space.forward).negate();
  const basis = new THREE.Matrix3().set(
    right.x,
    up.x,
    negativeForward.x,
    right.y,
    up.y,
    negativeForward.y,
    right.z,
    up.z,
    negativeForward.z,
  );
  normalizeNegativeZeros(basis);
  return basis;
}

/**
 * Converts an axis token into its signed unit vector.
 *
 * @param axis Signed coordinate axis.
 * @returns Unit vector.
 */
export function axisDirectionToVector(axis: AxisDirection): THREE.Vector3 {
  if (axis === '+x') return new THREE.Vector3(1, 0, 0);
  if (axis === '-x') return new THREE.Vector3(-1, 0, 0);
  if (axis === '+y') return new THREE.Vector3(0, 1, 0);
  if (axis === '-y') return new THREE.Vector3(0, -1, 0);
  if (axis === '+z') return new THREE.Vector3(0, 0, 1);
  return new THREE.Vector3(0, 0, -1);
}

/**
 * Promotes a 3x3 coordinate basis to a 4x4 transform.
 *
 * @param basis Coordinate basis.
 * @returns Equivalent 4x4 matrix.
 */
function matrix4FromBasis(basis: THREE.Matrix3): THREE.Matrix4 {
  return new THREE.Matrix4().setFromMatrix3(basis);
}

/**
 * Composes transform components into a matrix.
 *
 * @param position Translation.
 * @param quaternion Orientation.
 * @param scale Scale.
 * @returns Composed matrix.
 */
function composeMatrix(position: THREE.Vector3, quaternion: THREE.Quaternion, scale: THREE.Vector3): THREE.Matrix4 {
  return new THREE.Matrix4().compose(position, quaternion, scale);
}

/**
 * Decomposes a transform matrix into independent components.
 *
 * @param matrix Transform matrix.
 * @returns Decomposed components.
 */
function decomposeMatrix(matrix: THREE.Matrix4): CoordinateTransformComponents {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, quaternion, scale);
  return { position, quaternion, scale };
}

/**
 * Returns a canonical positive coordinate axis.
 *
 * @param axis Axis name.
 * @returns Unit vector.
 */
function vectorForCoordinateAxis(axis: CoordinateAxis): THREE.Vector3 {
  if (axis === 'x') return new THREE.Vector3(1, 0, 0);
  if (axis === 'y') return new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3(0, 0, 1);
}

/**
 * Finds the dominant coordinate axis of an axis-aligned direction.
 *
 * @param direction Axis-aligned direction.
 * @returns Dominant coordinate axis.
 */
function coordinateAxisFromDirection(direction: THREE.Vector3): CoordinateAxis {
  if (Math.abs(direction.x) > 0.5) return 'x';
  if (Math.abs(direction.y) > 0.5) return 'y';
  return 'z';
}

/**
 * Compares two 3x3 matrices using a small numeric tolerance.
 *
 * @param left First matrix.
 * @param right Second matrix.
 * @returns True when all elements are approximately equal.
 */
function matrix3ApproximatelyEquals(left: THREE.Matrix3, right: THREE.Matrix3): boolean {
  return left.elements.every((value, index) => Math.abs(value - right.elements[index]!) < 1e-9);
}

/**
 * Replaces signed zero values so identity comparisons remain exact.
 *
 * @param matrix Matrix to normalize in place.
 */
function normalizeNegativeZeros(matrix: THREE.Matrix3): void {
  matrix.elements.forEach((value, index) => {
    if (value === 0) matrix.elements[index] = 0;
  });
}
