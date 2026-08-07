/** Coordinate space axis and handedness type definitions. */

/** Signed direction along a primary world axis. */
export type AxisDirection = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

/** Coordinate system handedness. */
export type Handedness = 'right' | 'left';

/** Built-in engine coordinate space preset identifiers. */
export type BuiltInCoordinateSpaceId = 'blender' | 'unity' | 'godot' | 'unreal';

/** Full coordinate space definition with identity, basis axes, and handedness. */
export interface CoordinateSpaceDefinition {
  /** Built-in id or custom preset id. */
  presetId: string;
  /** Display name (engine name or custom label). */
  name: string;
  /** Left-handed or right-handed orientation of the basis. */
  handedness: Handedness;
  up: AxisDirection;
  right: AxisDirection;
  forward: AxisDirection;
  /** True when the preset is user-authored. */
  isCustom: boolean;
}

/** Frozen ordered list of every AxisDirection value. */
export const AXIS_DIRECTION_OPTIONS: readonly AxisDirection[] = Object.freeze(['+x', '-x', '+y', '-y', '+z', '-z']);

/** Human-readable labels for axis directions. */
export const AXIS_DIRECTION_LABELS: Readonly<Record<AxisDirection, string>> = Object.freeze({
  '+x': '+X',
  '-x': '-X',
  '+y': '+Y',
  '-y': '-Y',
  '+z': '+Z',
  '-z': '-Z',
});
