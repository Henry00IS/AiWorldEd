import { cloneCoordinateSpace, getBuiltInCoordinateSpace } from '@/settings/coordinate/coordinate_space_presets.js';
import type { AxisDirection, CoordinateSpaceDefinition } from '@/settings/coordinate/coordinate_space_types.js';

/** Numeric FBX axis index used by GlobalSettings. */
export type FbxAxisIndex = 0 | 1 | 2;

/** Signed axis assignment used by one FBX GlobalSettings field pair. */
export interface FbxAxisSetting {
  axis: FbxAxisIndex;
  sign: 1 | -1;
}

/** Coordinate basis metadata written into an FBX GlobalSettings block. */
export interface FbxCoordinateSettings {
  up: FbxAxisSetting;
  front: FbxAxisSetting;
  coordinate: FbxAxisSetting;
}

/**
 * Resolves the coordinate basis that an FBX export will use.
 *
 * @param coordinateSpace Requested target coordinate space.
 * @returns Canonical coordinate space for FBX conversion.
 */
export function resolveFbxCoordinateSpace(coordinateSpace: CoordinateSpaceDefinition): CoordinateSpaceDefinition {
  if (coordinateSpace.presetId !== 'unreal') {
    return cloneCoordinateSpace(coordinateSpace);
  }
  return getBuiltInCoordinateSpace('unreal') ?? cloneCoordinateSpace(coordinateSpace);
}

/**
 * Converts a profile coordinate basis into FBX GlobalSettings axis metadata.
 *
 * @param coordinateSpace Target coordinate space from the active profile.
 * @returns FBX axis assignments for up, front, and coordinate directions.
 */
export function buildFbxCoordinateSettings(coordinateSpace: CoordinateSpaceDefinition): FbxCoordinateSettings {
  const resolvedCoordinateSpace = resolveFbxCoordinateSpace(coordinateSpace);
  return {
    up: convertAxisDirectionToFbxSetting(resolvedCoordinateSpace.up),
    front: convertAxisDirectionToFbxSetting(resolvedCoordinateSpace.forward),
    coordinate: convertAxisDirectionToFbxSetting(resolvedCoordinateSpace.right),
  };
}

/**
 * Converts one signed Three.js-style axis token to an FBX axis assignment.
 *
 * @param direction Signed target axis token.
 * @returns FBX numeric axis and sign.
 */
function convertAxisDirectionToFbxSetting(direction: AxisDirection): FbxAxisSetting {
  const axis = direction[1];
  const axisIndex: FbxAxisIndex = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  const sign = direction[0] === '+' ? 1 : -1;
  return { axis: axisIndex, sign };
}
