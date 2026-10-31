import { describe, expect, it } from 'vitest';
import {
  buildViewportToolAlignMenuEntries,
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
