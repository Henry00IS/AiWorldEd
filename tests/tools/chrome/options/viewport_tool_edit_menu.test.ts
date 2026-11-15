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
import type { EditMeshToolCommand } from '@/edit/tool/edit_mesh_tool_command.js';

describe('viewport_tool_edit_menu', () => {
  it('exposes the mode-aware Mesh tools once', () => {
    const calls: string[] = [];
    const entries = buildViewportToolMeshMenuEntries(createActions(calls));
    const labels = entries.map((entry) => ('label' in entry ? entry.label : 'separator'));
    expect(labels).toEqual(['Knife Topology Tool', 'Make Face', 'separator', 'Delete', 'Dissolve']);
    expect(shortcutForLabel(entries, 'Dissolve')).toBe('Delete');
    expect(shortcutForLabel(entries, 'Delete')).toBe('Backspace');
    const knife = entries[0];
    if (knife && isMenuAction(knife)) {
      knife.onClick();
    }
    const makeFace = entries[1];
    if (makeFace && isMenuAction(makeFace)) makeFace.onClick();
    expect(calls).toEqual(['knife', 'tool:make_face']);
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

  it('offers Extrude Faces, Extrude Faces Individually and Inset Faces in the Face menu', () => {
    const calls: string[] = [];
    const entries = buildViewportToolFaceMenuEntries(createActions(calls));
    expect(entries.map((entry) => ('label' in entry ? entry.label : 'separator'))).toEqual([
      'Extrude Faces',
      'Extrude Faces Individually',
      'Inset Faces',
      'Solidify',
      'separator',
      'Duplicate Faces',
      'Split Faces',
      'Flip Faces',
      'Triangulate Faces',
      'Poke Faces',
      'Join Triangles',
    ]);
    for (const entry of entries) if (isMenuAction(entry)) entry.onClick();
    expect(calls).toEqual([
      'tool:extrude_faces',
      'tool:extrude_faces_individual',
      'tool:inset_faces',
      'tool:solidify_faces',
      'tool:duplicate_faces',
      'tool:split_faces',
      'tool:flip_faces',
      'tool:triangulate_faces',
      'tool:poke_faces',
      'tool:join_triangles',
    ]);
    expect(shortcutForLabel(entries, 'Duplicate Faces')).toBe('Shift+D');
    expect(shortcutForLabel(entries, 'Extrude Faces')).toBe('E');
    expect(shortcutForLabel(entries, 'Inset Faces')).toBe('I');
  });

  it('offers Connect Vertices with J in the Vertex menu', () => {
    const calls: string[] = [];
    const entries = buildViewportToolVertexMenuEntries(createActions(calls));
    const connect = entries.find((entry) => isMenuAction(entry) && entry.label === 'Connect Vertices');
    if (connect && isMenuAction(connect)) connect.onClick();
    expect(calls).toEqual(['tool:connect_vertices']);
    expect(shortcutForLabel(entries, 'Connect Vertices')).toBe('J');
  });

  it('offers Subdivide Edges, Extrude Edges and Bridge Edge Loops in the Edge menu', () => {
    const calls: string[] = [];
    const entries = buildViewportToolEdgeMenuEntries(createActions(calls));
    const subdivide = entries.find((entry) => isMenuAction(entry) && entry.label === 'Subdivide Edges');
    expect(subdivide && isMenuAction(subdivide)).toBe(true);
    if (subdivide && isMenuAction(subdivide)) subdivide.onClick();
    for (const label of ['Bevel Edges', 'Extrude Edges', 'Bridge Edge Loops']) {
      const entry = entries.find((candidate) => isMenuAction(candidate) && candidate.label === label);
      if (entry && isMenuAction(entry)) entry.onClick();
    }
    expect(calls).toEqual(['tool:subdivide_edges', 'tool:bevel_edges', 'tool:extrude_edges', 'tool:bridge_edge_loops']);
    expect(shortcutForLabel(entries, 'Bevel Edges')).toBe('Ctrl+B');
    expect(shortcutForLabel(entries, 'Extrude Edges')).toBe('E');
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
  onMeshTool: (command: EditMeshToolCommand) => void;
} {
  return {
    onMeshTool: (command) => {
      calls.push(`tool:${command}`);
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
