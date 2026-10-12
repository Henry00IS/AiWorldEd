import type { ToolbarMenuEntry } from '@/ui/menu/menu_types.js';
import type { TopologyVertexMergeMode } from '@/edit/topology/topology_vertex_merge_mode.js';

/** Callbacks for Edit Mode Mesh / Vertex / Edge / Face menus. */
export interface ViewportToolEditMenuActions {
  onKnife: () => void;
  onLoopCut: () => void;
  onMerge: (mode: TopologyVertexMergeMode) => void;
  onDelete: () => void;
  onDissolve: () => void;
}

/**
 * Builds the Blender-style Mesh menu.
 *
 * @param actions Edit tool actions.
 * @returns Menu entries.
 */
export function buildViewportToolMeshMenuEntries(actions: ViewportToolEditMenuActions): ToolbarMenuEntry[] {
  return [
    createAction('Knife Topology Tool', 'K', 'Insert a vertex on a hovered edge', actions.onKnife),
    createAction('Loop Cut', 'Ctrl+R', 'Cut a convex edge belt and slide it', actions.onLoopCut),
    { kind: 'separator' },
    createMergeSubmenu(actions.onMerge),
    createAction('Delete', '', 'Delete the current component selection', actions.onDelete),
    createAction(
      'Dissolve',
      'Delete',
      'Dissolve the current component selection into the surrounding faces',
      actions.onDissolve,
    ),
  ];
}

/**
 * Builds the Blender-style Vertex menu.
 *
 * @param actions Edit tool actions.
 * @returns Menu entries.
 */
export function buildViewportToolVertexMenuEntries(actions: ViewportToolEditMenuActions): ToolbarMenuEntry[] {
  return [
    createMergeSubmenu(actions.onMerge),
    createAction('Delete Vertices', '', 'Delete selected vertices and the faces that use them', actions.onDelete),
    createAction(
      'Dissolve Vertices',
      'Delete',
      'Dissolve selected vertices into the surrounding faces',
      actions.onDissolve,
    ),
  ];
}

/**
 * Builds the Blender-style Edge menu.
 *
 * @param actions Edit tool actions.
 * @returns Menu entries.
 */
export function buildViewportToolEdgeMenuEntries(actions: ViewportToolEditMenuActions): ToolbarMenuEntry[] {
  return [
    createAction('Loop Cut', 'Ctrl+R', 'Cut a convex edge belt and slide it', actions.onLoopCut),
    createAction('Knife Topology Tool', 'K', 'Insert a vertex on a hovered edge', actions.onKnife),
    { kind: 'separator' },
    createAction('Delete Edges', '', 'Delete edge vertices and every face that used them', actions.onDelete),
    createAction(
      'Dissolve Edges',
      'Delete',
      'Join the faces beside the selected edges into one face',
      actions.onDissolve,
    ),
  ];
}

/**
 * Builds the Blender-style Face menu.
 *
 * @param actions Edit tool actions.
 * @returns Menu entries.
 */
export function buildViewportToolFaceMenuEntries(actions: ViewportToolEditMenuActions): ToolbarMenuEntry[] {
  return [
    createAction('Delete Faces', '', 'Delete the selected faces and leave the others unchanged', actions.onDelete),
    createAction('Dissolve Faces', 'Delete', 'Join two adjacent selected faces into one', actions.onDissolve),
  ];
}

/**
 * Builds the Merge Vertices submenu.
 *
 * @param onMerge Merge callback.
 * @returns Submenu entry.
 */
function createMergeSubmenu(onMerge: (mode: TopologyVertexMergeMode) => void): ToolbarMenuEntry {
  return {
    kind: 'submenu',
    label: 'Merge Vertices',
    children: [
      createAction('At Center', 'M', 'Merge selected vertices at their centroid', () => onMerge('at_center')),
      createAction('At First', 'M', 'Merge selected vertices at the first selected', () => onMerge('at_first')),
      createAction('At Last', 'M', 'Merge selected vertices at the last selected', () => onMerge('at_last')),
      { kind: 'separator' },
      createAction('By Distance', 'M', 'Weld vertices closer than the merge epsilon', () => onMerge('by_distance')),
    ],
  };
}

/**
 * Builds one labeled action row.
 *
 * @param label Visible label.
 * @param shortcut Shortcut text.
 * @param tooltip Hover help.
 * @param onClick Click handler.
 * @returns Menu action.
 */
function createAction(label: string, shortcut: string, tooltip: string, onClick: () => void): ToolbarMenuEntry {
  return { label, shortcut, tooltip, onClick };
}
