import type { ToolbarMenuEntry } from '@/ui/menu/menu_types.js';
import { ObjectApplyTransformKind, getObjectApplyTransformKindLabel } from '@/types/object_apply_transform_kind.js';
import { ObjectPivotPlacement, objectPivotPlacementLabel } from '@/transform/pivot/object_pivot_point.js';

/**
 * Builds the Object menu (Apply submenu) for the Edit Mode options bar.
 *
 * @param onApply Invoked when the user chooses an apply action.
 * @param onConvexHull Invoked when the user chooses Convex Hull.
 * @param onSetOrigin Invoked when the user chooses where the origin goes.
 * @returns Menu entries for PanelMenu.
 */
export function buildViewportToolObjectMenuEntries(
  onApply: (kind: ObjectApplyTransformKind) => void,
  onConvexHull?: () => void,
  onSetOrigin?: (placement: ObjectPivotPlacement) => void,
): ToolbarMenuEntry[] {
  return [
    {
      kind: 'submenu',
      label: 'Apply',
      children: buildObjectApplyMenuEntries(onApply),
    },
    {
      kind: 'submenu',
      label: 'Set Origin',
      children: buildObjectOriginMenuEntries((placement) => onSetOrigin?.(placement)),
    },
    {
      label: 'Convex Hull',
      tooltip: 'Build a convex brush around the selected brushes',
      onClick: () => onConvexHull?.(),
    },
  ];
}

/**
 * Builds Object → Apply submenu rows.
 *
 * @param onApply Apply callback.
 * @returns Apply menu entries.
 */
function buildObjectApplyMenuEntries(onApply: (kind: ObjectApplyTransformKind) => void): ToolbarMenuEntry[] {
  return [
    createApplyAction(ObjectApplyTransformKind.LOCATION, onApply),
    createApplyAction(ObjectApplyTransformKind.ROTATION, onApply),
    createApplyAction(ObjectApplyTransformKind.SCALE, onApply),
    { kind: 'separator' },
    createApplyAction(ObjectApplyTransformKind.ALL_TRANSFORMS, onApply),
    createApplyAction(ObjectApplyTransformKind.ROTATION_AND_SCALE, onApply),
  ];
}

/**
 * Builds one Apply action row.
 *
 * @param kind Apply kind.
 * @param onApply Apply callback.
 * @returns Menu action entry.
 */
function createApplyAction(
  kind: ObjectApplyTransformKind,
  onApply: (kind: ObjectApplyTransformKind) => void,
): ToolbarMenuEntry {
  return {
    label: getObjectApplyTransformKindLabel(kind),
    onClick: () => onApply(kind),
    tooltip: `Bake object ${getObjectApplyTransformKindLabel(kind).toLowerCase()} into mesh/brush geometry`,
  };
}

/**
 * Builds Object → Set Origin submenu rows.
 *
 * @param onSetOrigin Origin callback.
 * @returns Origin menu entries.
 */
function buildObjectOriginMenuEntries(onSetOrigin: (placement: ObjectPivotPlacement) => void): ToolbarMenuEntry[] {
  const tooltips: Record<ObjectPivotPlacement, string> = {
    [ObjectPivotPlacement.BOUNDS_CENTER]: 'Move the origin to the center of the geometry; the geometry stays in place',
    [ObjectPivotPlacement.BOUNDS_BOTTOM]:
      'Move the origin to the bottom center of the geometry; the geometry stays in place',
    [ObjectPivotPlacement.WORLD_ORIGIN]: 'Move the origin to the world origin; the geometry stays in place',
  };
  return Object.values(ObjectPivotPlacement).map((placement) => ({
    label: objectPivotPlacementLabel(placement),
    tooltip: tooltips[placement],
    onClick: () => onSetOrigin(placement),
  }));
}
