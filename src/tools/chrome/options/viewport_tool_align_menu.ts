import type { ToolInstruction } from '@/tools/chrome/instruction/tool_instruction.js';
import { formatToolInstructionTooltip } from '@/tools/chrome/instruction/tool_instruction.js';
import {
  TOOL_INSTRUCTION_FACE_ALIGN,
  TOOL_INSTRUCTION_FACE_ALIGN_SEAT,
  TOOL_INSTRUCTION_HINGE_ALIGN,
} from '@/tools/chrome/instruction/tool_instruction_catalog.js';
import type { ToolbarMenuEntry } from '@/ui/menu/menu_types.js';
import type { EditAlignAnchor, EditAlignAxis, EditAlignRequest } from '@/edit/align/edit_align_request.js';

/** Callbacks for the object-mode Align menu. */
export interface ViewportToolAlignMenuActions {
  onFaceAlign: () => void;
  onHingeAlign: () => void;
  onFaceSeat: () => void;
  onAlignToOrigin: () => void;
  onAlignToGridCenter: () => void;
  onAlignToObject: () => void;
}

/**
 * Builds the Align menu rows.
 *
 * @param actions Menu callbacks.
 * @returns Menu entries.
 */
export function buildViewportToolAlignMenuEntries(actions: ViewportToolAlignMenuActions): ToolbarMenuEntry[] {
  return [...buildSnapAlignMenuEntries(actions), { kind: 'separator' }, ...buildObjectAlignMenuEntries(actions)];
}

/**
 * Builds the Edit Mode Align menu rows: grid alignment and one flatten submenu
 * per working grid axis.
 *
 * @param onEditAlign Alignment callback.
 * @returns Menu entries.
 */
export function buildViewportToolEditAlignMenuEntries(
  onEditAlign: (request: EditAlignRequest) => void,
): ToolbarMenuEntry[] {
  return [
    createPlainAction('To Grid', 'Move every selected vertex onto the nearest grid point', () =>
      onEditAlign({ kind: 'grid' }),
    ),
    { kind: 'separator' },
    ...(['x', 'y', 'z'] as const).map((axis) => createEditAlignAxisSubmenu(axis, onEditAlign)),
  ];
}

/**
 * Builds the Min, Center and Max rows that flatten the selection across one
 * axis.
 *
 * @param axis Working grid axis.
 * @param onEditAlign Alignment callback.
 * @returns Submenu entry.
 */
function createEditAlignAxisSubmenu(
  axis: EditAlignAxis,
  onEditAlign: (request: EditAlignRequest) => void,
): ToolbarMenuEntry {
  const label = axis.toUpperCase();
  const row = (anchor: EditAlignAnchor, title: string, where: string) =>
    createPlainAction(title, `Flatten the selection onto its ${where} ${label}`, () =>
      onEditAlign({ kind: 'axis', axis, anchor }),
    );
  return {
    kind: 'submenu',
    label: `Align ${label}`,
    children: [row('min', 'Min', 'lowest'), row('center', 'Center', 'center'), row('max', 'Max', 'highest')],
  };
}

/**
 * Builds Face Align, Hinge, and Seat rows.
 *
 * @param actions Menu callbacks.
 * @returns Snap-align menu entries.
 */
function buildSnapAlignMenuEntries(actions: ViewportToolAlignMenuActions): ToolbarMenuEntry[] {
  return [
    createInstructionAction('Face Align', TOOL_INSTRUCTION_FACE_ALIGN, actions.onFaceAlign),
    createInstructionAction('Hinge', TOOL_INSTRUCTION_HINGE_ALIGN, actions.onHingeAlign),
    createInstructionAction('Seat', TOOL_INSTRUCTION_FACE_ALIGN_SEAT, actions.onFaceSeat),
  ];
}

/**
 * Builds Origin, Grid Center, and To Object rows.
 *
 * @param actions Menu callbacks.
 * @returns Object-align menu entries.
 */
function buildObjectAlignMenuEntries(actions: ViewportToolAlignMenuActions): ToolbarMenuEntry[] {
  return [
    createPlainAction('Origin', 'Move the allowed axes of the selection to the world origin', actions.onAlignToOrigin),
    createPlainAction(
      'Grid Center',
      'Move the selection center onto the nearest grid cell',
      actions.onAlignToGridCenter,
    ),
    createPlainAction('To Object', 'Align the selection to the last selected object', actions.onAlignToObject),
  ];
}

/**
 * Builds one row whose tooltip comes from a tool instruction.
 *
 * @param label Visible label.
 * @param instruction Tooltip instruction.
 * @param onClick Click handler.
 * @returns Menu action.
 */
function createInstructionAction(label: string, instruction: ToolInstruction, onClick: () => void): ToolbarMenuEntry {
  return {
    label,
    tooltip: formatToolInstructionTooltip(instruction),
    onClick,
  };
}

/**
 * Builds one row with a fixed tooltip.
 *
 * @param label Visible label.
 * @param tooltip Hover help.
 * @param onClick Click handler.
 * @returns Menu action.
 */
function createPlainAction(label: string, tooltip: string, onClick: () => void): ToolbarMenuEntry {
  return { label, tooltip, onClick };
}
