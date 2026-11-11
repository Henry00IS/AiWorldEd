/**
 * Object transform components that can be baked into mesh/brush geometry
 * (Object → Apply).
 */
export enum ObjectApplyTransformKind {
  LOCATION = 'location',
  ROTATION = 'rotation',
  SCALE = 'scale',
  ALL_TRANSFORMS = 'all_transforms',
  ROTATION_AND_SCALE = 'rotation_and_scale',
}

/**
 * Returns a short status label for an apply kind.
 *
 * @param kind Apply kind.
 * @returns Human-readable label.
 */
export function getObjectApplyTransformKindLabel(kind: ObjectApplyTransformKind): string {
  if (kind === ObjectApplyTransformKind.LOCATION) {
    return 'Location';
  }
  if (kind === ObjectApplyTransformKind.ROTATION) {
    return 'Rotation';
  }
  if (kind === ObjectApplyTransformKind.SCALE) {
    return 'Scale';
  }
  if (kind === ObjectApplyTransformKind.ALL_TRANSFORMS) {
    return 'All Transforms';
  }
  return 'Rotation & Scale';
}
