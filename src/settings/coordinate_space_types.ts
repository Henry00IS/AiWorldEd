/**
 * Coordinate space axis and handedness types for game profiles.
 */

/** Signed world axis used by up / right / forward basis vectors. */
export type AxisDirection = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

/** Coordinate system handedness. */
export type Handedness = 'right' | 'left';

/** Built-in engine coordinate space preset identifiers. */
export type BuiltInCoordinateSpaceId =
  | 'blender'
  | 'unity'
  | 'godot'
  | 'unreal';

/**
 * Full coordinate space definition stored on a game profile or custom preset.
 */
export interface CoordinateSpaceDefinition {
  /** Built-in id or custom preset id. */
  presetId: string;
  /** Display name (engine name or custom label). */
  name: string;
  /** Derived from the up, right, and forward axes. */
  handedness: Handedness;
  up: AxisDirection;
  right: AxisDirection;
  forward: AxisDirection;
  /** True when the preset is user-authored. */
  isCustom: boolean;
}

/** Ordered axis direction choices for dropdowns. */
export const AXIS_DIRECTION_OPTIONS: readonly AxisDirection[] = Object.freeze([
  '+x',
  '-x',
  '+y',
  '-y',
  '+z',
  '-z'
]);

/** Human-readable labels for axis directions. */
export const AXIS_DIRECTION_LABELS: Readonly<Record<AxisDirection, string>> =
  Object.freeze({
    '+x': '+X',
    '-x': '-X',
    '+y': '+Y',
    '-y': '-Y',
    '+z': '+Z',
    '-z': '-Z'
  });

/** Human-readable labels for handedness. */
export const HANDEDNESS_LABELS: Readonly<Record<Handedness, string>> =
  Object.freeze({
    right: 'Right-handed',
    left: 'Left-handed'
  });
