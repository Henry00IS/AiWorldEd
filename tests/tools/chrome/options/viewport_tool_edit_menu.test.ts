import { describe, expect, it } from 'vitest';
import {
  buildViewportToolEdgeMenuEntries,
  buildViewportToolFaceMenuEntries,
  buildViewportToolMeshMenuEntries,
  buildViewportToolSelectMenuEntries,
  buildViewportToolVertexMenuEntries,
} from '@/tools/chrome/options/viewport_tool_edit_menu.js';
import { isMenuAction, isMenuSubmenu, type ToolbarMenuEntry } from '@/ui/menu/menu_types.js';
import type { TopologyVertexMergeMode } from '@/edit/topology/topology_vertex_merge_mode.js';
import type { EditSelectOperation } from '@/edit/component/component_selection_expand.js';

describe('viewport_tool_edit_menu', () => {
  it('exposes the mode-aware Mesh tools once', () => {
    const calls: string[] = [];
    const entries = buildViewportToolMeshMenuEntries(createActions(calls));
    const labels = entries.map((entry) => ('label' in entry ? entry.label : 'separator'));
    expect(labels).toEqual(['Knife Topology Tool', 'separator', 'Delete', 'Dissolve']);
    expect(shortcutForLabel(entries, 'Dissolve')).toBe('Delete');
    expect(shortcutForLabel(entries, 'Delete')).toBe('Backspace');
    const knife = entries[0];
    if (knife && isMenuAction(knife)) {
      knife.onClick();
    }
    expect(calls).toEqual(['knife']);
  });

  it('offers Merge Vertices in the Vertex menu and Loop Cut in the Edge menu', () => {
    const merges: TopologyVertexMergeMode[] = [];
    const actions = createActions([]);
    const vertexEntries = buildViewportToolVertexMenuEntries({ ...actions, onMerge: (mode) => merges.push(mode) });
    const merge = vertexEntries[0];
    expect(merge && isMenuSubmenu(merge)).toBe(true);
    if (merge && isMenuSubmenu(merge)) {
      const atCenter = merge.children.find((entry) => isMenuAction(entry) && entry.label === 'At Center');
      if (atCenter && isMenuAction(atCenter)) {
        atCenter.onClick();
      }
    }
    expect(merges).toEqual(['at_center']);
    expect(shortcutForLabel(buildViewportToolEdgeMenuEntries(actions), 'Loop Cut')).toBe('Ctrl+R');
  });

  it('lists every tool exactly once across the Edit Mode menus', () => {
    const calls: string[] = [];
    const actions = createActions(calls);
    const menus = [
      buildViewportToolSelectMenuEntries(actions),
      buildViewportToolMeshMenuEntries(actions),
      buildViewportToolVertexMenuEntries(actions),
      buildViewportToolEdgeMenuEntries(actions),
      buildViewportToolFaceMenuEntries(actions),
    ];
    const leaves = menus.flatMap((entries) => collectLeafActions(entries));
    for (const leaf of leaves) leaf.onClick();
    expect(new Set(calls).size).toBe(calls.length);
    const labels = leaves.map((leaf) => leaf.label);
    const topLevelLabels = menus.flatMap((entries) =>
      entries.filter((entry) => isMenuAction(entry)).map((entry) => (isMenuAction(entry) ? entry.label : '')),
    );
    expect(new Set(topLevelLabels).size).toBe(topLevelLabels.length);
    expect(labels.length).toBeGreaterThan(0);
  });

  it('exposes the Select menu and runs each selection operation', () => {
    const calls: string[] = [];
    const entries = buildViewportToolSelectMenuEntries(createActions(calls));
    const labels = entries.map((entry) => ('label' in entry ? entry.label : 'separator'));
    expect(labels).toEqual([
      'Select All',
      'Select None',
      'Invert Selection',
      'separator',
      'Select More',
      'Select Less',
      'Select Linked',
      'separator',
      'Select Loop',
      'Select Ring',
    ]);
    for (const entry of entries) if (isMenuAction(entry)) entry.onClick();
    expect(calls).toEqual([
      'select:all',
      'select:none',
      'select:invert',
      'select:more',
      'select:less',
      'select:linked',
      'select:loop',
      'select:ring',
    ]);
    expect(shortcutForLabel(entries, 'Select Linked')).toBe('Ctrl+L');
  });

  it('offers Inset Faces first in the Face menu', () => {
    const calls: string[] = [];
    const entries = buildViewportToolFaceMenuEntries(createActions(calls));
    const inset = entries[0];
    expect(inset && 'label' in inset ? inset.label : '').toBe('Inset Faces');
    if (inset && isMenuAction(inset)) inset.onClick();
    expect(calls).toEqual(['inset']);
    expect(shortcutForLabel(entries, 'Inset Faces')).toBe('I');
  });
});

/**
 * Reads the shortcut text of a labeled menu action.
 *
 * @param entries Menu entries.
 * @param label Action label.
 * @returns Shortcut text, or an empty string when the action is missing.
 */
function shortcutForLabel(entries: readonly ToolbarMenuEntry[], label: string): string {
  const entry = entries.find((candidate) => isMenuAction(candidate) && candidate.label === label);
  if (!entry || !isMenuAction(entry) || typeof entry.shortcut !== 'string') {
    return '';
  }
  return entry.shortcut;
}

/**
 * Flattens menu entries and nested submenus into clickable actions.
 *
 * @param entries Menu entries.
 * @returns Leaf actions in menu order.
 */
function collectLeafActions(entries: readonly ToolbarMenuEntry[]): Array<{ label: string; onClick: () => void }> {
  return entries.flatMap((entry) => {
    if (isMenuSubmenu(entry)) return collectLeafActions(entry.children);
    return isMenuAction(entry) ? [{ label: entry.label, onClick: entry.onClick }] : [];
  });
}

/**
 * Builds menu action spies that record names.
 *
 * @param calls Call log.
 * @returns Action bag.
 */
function createActions(calls: string[]): {
  onKnife: () => void;
  onLoopCut: () => void;
  onMerge: (mode: TopologyVertexMergeMode) => void;
  onDelete: () => void;
  onDissolve: () => void;
  onSelect: (operation: EditSelectOperation) => void;
  onInset: () => void;
} {
  return {
    onInset: () => {
      calls.push('inset');
    },
    onSelect: (operation) => {
      calls.push(`select:${operation}`);
    },
    onKnife: () => {
      calls.push('knife');
    },
    onLoopCut: () => {
      calls.push('loop');
    },
    onMerge: (mode) => {
      calls.push(mode);
    },
    onDelete: () => {
      calls.push('delete');
    },
    onDissolve: () => {
      calls.push('dissolve');
    },
  };
}
