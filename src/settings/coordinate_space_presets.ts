import type {
  AxisDirection,
  BuiltInCoordinateSpaceId,
  CoordinateSpaceDefinition,
  Handedness
} from './coordinate_space_types.js';
import { AXIS_DIRECTION_OPTIONS } from './coordinate_space_types.js';

/** Default coordinate space for new game profiles (Three.js / OpenGL style). */
export const DEFAULT_COORDINATE_SPACE_ID: BuiltInCoordinateSpaceId = 'godot';

/**
 * Built-in engine coordinate space presets.
 * Blender: Z-up, right-handed (Up +Z, Right +X, Forward +Y).
 * Unity: Y-up, left-handed (Up +Y, Right +X, Forward +Z).
 * Godot: Y-up, right-handed (Up +Y, Right +X, Forward -Z).
 * Unreal Engine: Z-up, left-handed (Up +Z, Right +Y, Forward +X).
 *
 * Note: Blender's front orthographic camera looks toward -Y, so a character
 * facing the front camera has object forward +Y.
 */
export const BUILT_IN_COORDINATE_SPACE_PRESETS: readonly CoordinateSpaceDefinition[] =
  Object.freeze([
    Object.freeze({
      presetId: 'blender',
      name: 'Blender',
      handedness: 'right',
      up: '+z',
      right: '+x',
      forward: '+y',
      isCustom: false
    }),
    Object.freeze({
      presetId: 'unity',
      name: 'Unity',
      handedness: 'left',
      up: '+y',
      right: '+x',
      forward: '+z',
      isCustom: false
    }),
    Object.freeze({
      presetId: 'godot',
      name: 'Godot',
      handedness: 'right',
      up: '+y',
      right: '+x',
      forward: '-z',
      isCustom: false
    }),
    Object.freeze({
      presetId: 'unreal',
      name: 'Unreal Engine',
      handedness: 'left',
      up: '+z',
      right: '+y',
      forward: '+x',
      isCustom: false
    })
  ]);

/**
 * Returns a cloned built-in preset by id.
 * @param presetId Built-in preset identifier.
 * @returns Cloned definition or null when unknown.
 */
export function getBuiltInCoordinateSpace(
  presetId: string
): CoordinateSpaceDefinition | null {
  const found = BUILT_IN_COORDINATE_SPACE_PRESETS.find(
    (preset) => preset.presetId === presetId
  );
  return found ? cloneCoordinateSpace(found) : null;
}

/**
 * Returns the default coordinate space definition for new profiles.
 * @returns Cloned Godot / OpenGL-style definition.
 */
export function createDefaultCoordinateSpace(): CoordinateSpaceDefinition {
  return getBuiltInCoordinateSpace(DEFAULT_COORDINATE_SPACE_ID) as CoordinateSpaceDefinition;
}

/**
 * Deep-clones a coordinate space definition.
 * @param space Source definition.
 * @returns Independent clone.
 */
export function cloneCoordinateSpace(
  space: CoordinateSpaceDefinition
): CoordinateSpaceDefinition {
  return {
    presetId: space.presetId,
    name: space.name,
    handedness: space.handedness,
    up: space.up,
    right: space.right,
    forward: space.forward,
    isCustom: space.isCustom
  };
}

/**
 * Builds a short human-readable summary of a coordinate space.
 * @param space Coordinate space definition.
 * @returns Summary string for UI labels.
 */
export function formatCoordinateSpaceSummary(
  space: CoordinateSpaceDefinition
): string {
  const hand = space.handedness === 'right' ? 'Right-handed' : 'Left-handed';
  return `${hand} · Up ${formatAxis(space.up)} · Right ${formatAxis(space.right)} · Forward ${formatAxis(space.forward)}`;
}

/**
 * Formats an axis direction for display.
 * @param axis Axis direction.
 * @returns Uppercase signed axis label.
 */
export function formatAxis(axis: AxisDirection): string {
  return axis.toUpperCase();
}

/**
 * Derives handedness from up / right / forward axes via the scalar triple product.
 * In engine conventions, forward = right × up is left-handed (Unity),
 * while forward = -(right × up) is right-handed (OpenGL / Godot / Blender).
 * @param up Up axis.
 * @param right Right axis.
 * @param forward Forward axis.
 * @returns Handedness, or null when axes are invalid (not an orthonormal basis).
 */
export function deriveHandedness(
  up: AxisDirection,
  right: AxisDirection,
  forward: AxisDirection
): Handedness | null {
  const upVec = axisToVector(up);
  const rightVec = axisToVector(right);
  const forwardVec = axisToVector(forward);
  if (!areAxesOrthogonal(upVec, rightVec, forwardVec)) {
    return null;
  }
  const cross = crossProduct(rightVec, upVec);
  const triple = dotProduct(cross, forwardVec);
  if (triple > 0) {
    return 'left';
  }
  if (triple < 0) {
    return 'right';
  }
  return null;
}

/**
 * Validates that three axis directions form a proper coordinate basis.
 * @param up Up axis.
 * @param right Right axis.
 * @param forward Forward axis.
 * @returns True when axes are mutually perpendicular and non-collinear pairs.
 */
export function areValidCoordinateAxes(
  up: AxisDirection,
  right: AxisDirection,
  forward: AxisDirection
): boolean {
  return deriveHandedness(up, right, forward) !== null;
}

/**
 * Checks whether a value is a known axis direction token.
 * @param value Candidate value.
 * @returns True when value is a valid AxisDirection.
 */
export function isAxisDirection(value: unknown): value is AxisDirection {
  return (
    typeof value === 'string' &&
    AXIS_DIRECTION_OPTIONS.includes(value as AxisDirection)
  );
}

/**
 * Checks whether a value is a known handedness token.
 * @param value Candidate value.
 * @returns True when value is right or left.
 */
export function isHandedness(value: unknown): value is Handedness {
  return value === 'right' || value === 'left';
}

/**
 * Parses and validates a coordinate space object from JSON. Handedness is
 * always re-derived from the three axes, normalizing legacy profiles whose
 * stored handedness did not match their basis.
 * @param value Candidate object.
 * @returns Cloned definition.
 * @throws Error when invalid.
 */
export function parseCoordinateSpaceDefinition(
  value: unknown
): CoordinateSpaceDefinition {
  if (!value || typeof value !== 'object') {
    throw new Error('Coordinate space must be an object');
  }
  const candidate = value as Partial<CoordinateSpaceDefinition>;
  requireNonEmptyString(candidate.presetId, 'presetId');
  requireNonEmptyString(candidate.name, 'name');
  if (!isAxisDirection(candidate.up)) {
    throw new Error('Coordinate space has invalid up axis');
  }
  if (!isAxisDirection(candidate.right)) {
    throw new Error('Coordinate space has invalid right axis');
  }
  if (!isAxisDirection(candidate.forward)) {
    throw new Error('Coordinate space has invalid forward axis');
  }
  if (!areValidCoordinateAxes(candidate.up, candidate.right, candidate.forward)) {
    throw new Error('Coordinate space axes are not a valid basis');
  }
  const handedness = deriveHandedness(
    candidate.up,
    candidate.right,
    candidate.forward
  );
  if (!handedness) {
    throw new Error('Coordinate space has invalid handedness');
  }
  return {
    presetId: String(candidate.presetId),
    name: String(candidate.name),
    handedness,
    up: candidate.up,
    right: candidate.right,
    forward: candidate.forward,
    isCustom: candidate.isCustom === true
  };
}

/**
 * Converts an axis direction to a unit vector triple.
 * @param axis Axis direction.
 * @returns [x, y, z] components.
 */
function axisToVector(axis: AxisDirection): [number, number, number] {
  switch (axis) {
    case '+x':
      return [1, 0, 0];
    case '-x':
      return [-1, 0, 0];
    case '+y':
      return [0, 1, 0];
    case '-y':
      return [0, -1, 0];
    case '+z':
      return [0, 0, 1];
    case '-z':
      return [0, 0, -1];
  }
}

/**
 * Returns true when the three vectors are mutually orthogonal unit axes.
 * @param a First vector.
 * @param b Second vector.
 * @param c Third vector.
 * @returns True when pairwise dots are zero.
 */
function areAxesOrthogonal(
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number]
): boolean {
  return (
    Math.abs(dotProduct(a, b)) < 1e-9 &&
    Math.abs(dotProduct(a, c)) < 1e-9 &&
    Math.abs(dotProduct(b, c)) < 1e-9
  );
}

/**
 * Dot product of two 3D vectors.
 * @param a First vector.
 * @param b Second vector.
 * @returns Scalar product.
 */
function dotProduct(
  a: [number, number, number],
  b: [number, number, number]
): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Cross product of two 3D vectors.
 * @param a First vector.
 * @param b Second vector.
 * @returns a × b.
 */
function crossProduct(
  a: [number, number, number],
  b: [number, number, number]
): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

/**
 * Ensures a field is a non-empty string.
 * @param value Candidate value.
 * @param fieldName Field label for errors.
 */
function requireNonEmptyString(value: unknown, fieldName: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Coordinate space missing valid ${fieldName}`);
  }
}
