import { describe, expect, it } from 'vitest';
import {
  buildViewportToolEdgeMenuEntries,
  buildViewportToolFaceMenuEntries,
  buildViewportToolMeshMenuEntries,
  buildViewportToolVertexMenuEntries,
} from '@/tools/chrome/options/viewport_tool_edit_menu.js';
import { isMenuAction, isMenuSubmenu, type ToolbarMenuEntry } from '@/ui/menu/menu_types.js';
import type { TopologyVertexMergeMode } from '@/edit/topology/topology_vertex_merge_mode.js';

describe('viewport_tool_edit_menu', () => {
  it('exposes Blender-style Mesh tools including knife, loop cut, and merge', () => {
    const calls: string[] = [];
    const entries = buildViewportToolMeshMenuEntries(createActions(calls));
    const labels = entries.map((entry) => ('label' in entry ? entry.label : 'separator'));
    expect(labels).toEqual(['Knife Topology Tool', 'Loop Cut', 'separator', 'Merge Vertices', 'Delete', 'Dissolve']);
    expect(shortcutForLabel(entries, 'Dissolve')).toBe('Delete');
    expect(shortcutForLabel(entries, 'Delete')).toBe('');
    expect(shortcutForLabel(buildViewportToolVertexMenuEntries(createActions([])), 'Dissolve Vertices')).toBe('Delete');
    expect(shortcutForLabel(buildViewportToolEdgeMenuEntries(createActions([])), 'Dissolve Edges')).toBe('Delete');
    expect(shortcutForLabel(buildViewportToolFaceMenuEntries(createActions([])), 'Dissolve Faces')).toBe('Delete');
    const knife = entries[0];
    if (knife && isMenuAction(knife)) {
      knife.onClick();
    }
    expect(calls).toEqual(['knife']);
  });

  it('exposes Vertex merge modes and Edge loop cut', () => {
    const merges: TopologyVertexMergeMode[] = [];
    const vertexEntries = buildViewportToolVertexMenuEntries({
      onKnife: () => undefined,
      onLoopCut: () => undefined,
      onMerge: (mode) => {
        merges.push(mode);
      },
      onDelete: () => undefined,
      onDissolve: () => undefined,
    });
    const merge = vertexEntries[0];
    expect(merge && isMenuSubmenu(merge)).toBe(true);
    if (merge && isMenuSubmenu(merge)) {
      const atCenter = merge.children.find((entry) => isMenuAction(entry) && entry.label === 'At Center');
      if (atCenter && isMenuAction(atCenter)) {
        atCenter.onClick();
      }
    }
    expect(merges).toEqual(['at_center']);
    const edgeLabels = buildViewportToolEdgeMenuEntries(createActions([])).map((entry) =>
      'label' in entry ? entry.label : 'separator',
    );
    expect(edgeLabels).toContain('Loop Cut');
    expect(buildViewportToolFaceMenuEntries(createActions([]))[0] && true).toBe(true);
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
} {
  return {
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
