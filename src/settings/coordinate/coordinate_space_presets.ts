import type { CoordinateSpaceDefinition } from './coordinate_space_types.js';

/**
 * Built-in engine coordinate space presets, in a model's own terms: the axis
 * its top points along (up), the axis its front faces (forward) and the axis of
 * its own right-hand side (right). Blender: Up +Z, Forward -Y (the Front view
 * looks along +Y), Right -X, right-handed. Unity: Up +Y, Forward +Z, Right +X,
 * left-handed. Godot: Up +Y, Forward +Z (MODEL_FRONT), Right -X (MODEL_RIGHT),
 * right-handed. Unreal Engine: Up +Z, Forward +X, Right +Y, left-handed.
 */
export const BUILT_IN_COORDINATE_SPACE_PRESETS: readonly CoordinateSpaceDefinition[] = Object.freeze([
  Object.freeze({
    presetId: 'blender',
    up: '+z',
    right: '-x',
    forward: '-y',
  }),
  Object.freeze({
    presetId: 'unity',
    up: '+y',
    right: '+x',
    forward: '+z',
  }),
  Object.freeze({
    presetId: 'godot',
    up: '+y',
    right: '-x',
    forward: '+z',
  }),
  Object.freeze({
    presetId: 'unreal',
    up: '+z',
    right: '+y',
    forward: '+x',
  }),
]);

/**
 * Returns a cloned built-in preset by id.
 *
 * @param presetId Built-in preset identifier.
 * @returns Cloned definition or null when unknown.
 */
export function getBuiltInCoordinateSpace(presetId: string): CoordinateSpaceDefinition | null {
  const found = BUILT_IN_COORDINATE_SPACE_PRESETS.find((preset) => preset.presetId === presetId);
  return found ? cloneCoordinateSpace(found) : null;
}

/**
 * Deep-clones a coordinate space definition.
 *
 * @param space Source definition.
 * @returns Independent clone.
 */
function cloneCoordinateSpace(space: CoordinateSpaceDefinition): CoordinateSpaceDefinition {
  return {
    presetId: space.presetId,
    up: space.up,
    right: space.right,
    forward: space.forward,
  };
}
