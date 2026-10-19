import type { ToolbarMenuEntry } from '@/ui/menu/menu_types.js';
import { ObjectApplyTransformKind, getObjectApplyTransformKindLabel } from '@/types/object_apply_transform_kind.js';

/**
 * Builds the Object menu (Apply submenu) for the Edit Mode options bar.
 *
 * @param onApply Invoked when the user chooses an apply action.
 * @param onConvexHull Invoked when the user chooses Convex Hull.
 * @returns Menu entries for PanelMenu.
 */
export function buildViewportToolObjectMenuEntries(
  onApply: (kind: ObjectApplyTransformKind) => void,
  onConvexHull?: () => void,
): ToolbarMenuEntry[] {
  return [
    {
      kind: 'submenu',
      label: 'Apply',
      children: buildObjectApplyMenuEntries(onApply),
    },
    {
      label: 'Convex Hull',
      tooltip: 'Build a convex brush around the selected brushes',
      onClick: () => onConvexHull?.(),
    },
  ];
}

/**
 * Builds Blender-style Apply submenu rows.
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
