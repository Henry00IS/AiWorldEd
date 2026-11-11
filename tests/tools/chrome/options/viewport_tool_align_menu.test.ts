import { describe, expect, it } from 'vitest';
import type { EditAlignRequest } from '@/edit/align/edit_align_request.js';
import {
  buildViewportToolAlignMenuEntries,
  buildViewportToolEditAlignMenuEntries,
  type ViewportToolAlignMenuActions,
} from '@/tools/chrome/options/viewport_tool_align_menu.js';
import { isMenuAction, isMenuSeparator, isMenuSubmenu, type ToolbarMenuEntry } from '@/ui/menu/menu_types.js';

describe('buildViewportToolAlignMenuEntries', () => {
  it('lists face tools, then object alignment, and runs each action', () => {
    const chosen: string[] = [];
    const entries = buildViewportToolAlignMenuEntries(createRecordingActions(chosen));
    expect(entries.map(readEntryLabel)).toEqual([
      'Face Align',
      'Hinge',
      'Seat',
      '',
      'Origin',
      'Grid Center',
      'To Object',
    ]);
    expect(entries.some((entry) => isMenuSeparator(entry))).toBe(true);
    expect(readActionTooltip(entries[0])).toContain('Click a face');
    invokeActions(entries);
    expect(chosen).toEqual(['face', 'hinge', 'seat', 'origin', 'grid', 'object']);
  });
});

describe('buildViewportToolEditAlignMenuEntries', () => {
  it('lists To Grid and one submenu per axis whose rows send the matching request', () => {
    const requests: EditAlignRequest[] = [];
    const entries = buildViewportToolEditAlignMenuEntries((request) => requests.push(request));
    expect(entries.map(readEntryLabel)).toEqual(['To Grid', '', 'Align X', 'Align Y', 'Align Z']);
    const submenu = entries[3];
    if (!submenu || !isMenuSubmenu(submenu)) throw new Error('Align Y is not a submenu');
    expect(submenu.children.map(readEntryLabel)).toEqual(['Min', 'Center', 'Max']);
    expect(readActionTooltip(submenu.children[2])).toBe('Flatten the selection onto its highest Y');
    invokeActionsDeep(entries);
    expect(requests).toEqual([
      { kind: 'grid' },
      ...(['x', 'y', 'z'] as const).flatMap((axis) =>
        (['min', 'center', 'max'] as const).map((anchor) => ({ kind: 'axis', axis, anchor })),
      ),
    ]);
  });
});

/**
 * Builds callbacks that record which align action ran.
 *
 * @param chosen Recorded action ids.
 * @returns Menu callbacks.
 */
function createRecordingActions(chosen: string[]): ViewportToolAlignMenuActions {
  return {
    onFaceAlign: () => chosen.push('face'),
    onHingeAlign: () => chosen.push('hinge'),
    onFaceSeat: () => chosen.push('seat'),
    onAlignToOrigin: () => chosen.push('origin'),
    onAlignToGridCenter: () => chosen.push('grid'),
    onAlignToObject: () => chosen.push('object'),
  };
}

/**
 * Reads the visible label of one menu entry.
 *
 * @param entry Menu entry.
 * @returns Label, or an empty string for a separator.
 */
function readEntryLabel(entry: ToolbarMenuEntry): string {
  if (isMenuSeparator(entry)) {
    return '';
  }
  if (isMenuAction(entry) || isMenuSubmenu(entry)) {
    return entry.label;
  }
  return '';
}

/**
 * Reads the tooltip of an action entry.
 *
 * @param entry Menu entry candidate.
 * @returns Tooltip text, or an empty string.
 */
function readActionTooltip(entry: ToolbarMenuEntry | undefined): string {
  if (!entry || !isMenuAction(entry) || typeof entry.tooltip !== 'string') {
    return '';
  }
  return entry.tooltip;
}

/**
 * Invokes every action entry in order.
 *
 * @param entries Menu entries.
 */
function invokeActions(entries: readonly ToolbarMenuEntry[]): void {
  for (const entry of entries) {
    if (isMenuAction(entry)) {
      entry.onClick();
    }
  }
}

/**
 * Invokes every action entry in order, descending into submenus.
 *
 * @param entries Menu entries.
 */
function invokeActionsDeep(entries: readonly ToolbarMenuEntry[]): void {
  for (const entry of entries) {
    if (isMenuAction(entry)) entry.onClick();
    else if (isMenuSubmenu(entry)) invokeActionsDeep(entry.children);
  }
}
