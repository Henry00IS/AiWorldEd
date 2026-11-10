/** Coordinate space axis type definitions. */

/** Signed direction along a primary world axis. */
export type AxisDirection = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

/** Built-in engine coordinate space preset identifiers. */
export type BuiltInCoordinateSpaceId = 'blender' | 'unity' | 'godot' | 'unreal';

/** Coordinate space definition: preset id and basis axes. */
export interface CoordinateSpaceDefinition {
  /** Preset id ("godot", …). */
  presetId: string;
  up: AxisDirection;
  right: AxisDirection;
  forward: AxisDirection;
}
