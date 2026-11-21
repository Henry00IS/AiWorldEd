import type { SolidScriptValue } from './solid_script_value.js';

/** Pose of a generator or modifier volume in the level. */
export interface SolidScriptBoxPose {
  /** Position in metres. */
  position: readonly [number, number, number];
  /** Rotation in degrees, first around X, then Y, then Z, as Rotate To uses. */
  rotation: readonly [number, number, number];
  /** Scale of the volume in the level. */
  scale: readonly [number, number, number];
}

/** Lowest and highest corners of the box in script space. */
export interface SolidScriptBoxCorners {
  /** Lowest corner. */
  min: readonly [number, number, number];
  /** Highest corner. */
  max: readonly [number, number, number];
}

/** Pose used when a run has no generator or modifier volume. */
export const SOLID_SCRIPT_BOX_POSE_DEFAULT: SolidScriptBoxPose = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};

/**
 * Fills in any missing pose parts with the defaults a run without a volume
 * uses: the origin, no turn and a scale of one.
 *
 * @param pose Pose as given, or nothing.
 * @returns Complete pose.
 */
export function solidScriptBoxPoseComplete(pose?: Partial<SolidScriptBoxPose> | null): SolidScriptBoxPose {
  return {
    position: pose?.position ?? SOLID_SCRIPT_BOX_POSE_DEFAULT.position,
    rotation: pose?.rotation ?? SOLID_SCRIPT_BOX_POSE_DEFAULT.rotation,
    scale: pose?.scale ?? SOLID_SCRIPT_BOX_POSE_DEFAULT.scale,
  };
}

/**
 * Corners of a box of the given size, centred on the script origin, so Min is
 * minus Extents and Max is Extents.
 *
 * @param size Width, height and depth.
 * @returns Corners in script space.
 */
export function solidScriptBoxCornersFromSize(size: readonly [number, number, number]): SolidScriptBoxCorners {
  const half = size.map((value) => value / 2) as [number, number, number];
  return { min: half.map((value) => -value) as [number, number, number], max: half };
}

/**
 * Stand-in for a Box value when a run has no box: 1 for a number, a size of one
 * metre for Size, plus or minus half a metre for Max, Extents and Min.
 *
 * @param name Value name as taught, such as Box.Width.
 * @returns Stand-in value.
 */
export function solidScriptSystemMissingBox(name: string): SolidScriptValue {
  if (/\.Size$/i.test(name)) return [1, 1, 1];
  if (/\.Min$/i.test(name)) return [-0.5, -0.5, -0.5];
  if (/\.(Max|Extents)$/i.test(name)) return [0.5, 0.5, 0.5];
  return 1;
}
