import type { ToolbarMenuEntry } from '@/ui/menu/menu_types.js';
import type { TopologyVertexMergeMode } from '@/edit/topology/topology_vertex_merge_mode.js';
import type { EditSelectOperation } from '@/edit/component/component_selection_expand.js';
import type { EditMeshToolCommand } from '@/edit/tool/edit_mesh_tool_command.js';

/** Callbacks for Edit Mode Mesh / Vertex / Edge / Face menus. */
export interface ViewportToolEditMenuActions {
  onKnife: () => void;
  onLoopCut: () => void;
  onMerge: (mode: TopologyVertexMergeMode) => void;
  onDelete: () => void;
  onDissolve: () => void;
  onSelect: (operation: EditSelectOperation) => void;
  onMeshTool: (command: EditMeshToolCommand) => void;
}

/**
 * Builds the Edit Mode Select menu.
 *
 * @param actions Edit tool actions.
 * @returns Menu entries.
 */
export function buildViewportToolSelectMenuEntries(actions: ViewportToolEditMenuActions): ToolbarMenuEntry[] {
  const select = (operation: EditSelectOperation) => () => actions.onSelect(operation);
  return [
    createAction('Select All', 'Ctrl+A', 'Select every component of the edited objects', select('all')),
    createAction('Select None', 'Alt+A', 'Clear the component selection', select('none')),
    createAction('Invert Selection', 'Ctrl+I', 'Select what is not selected and clear the rest', select('invert')),
    { kind: 'separator' },
    createAction('Select More', 'Ctrl+]', 'Grow the selection by its neighbours', select('more')),
    createAction('Select Less', 'Ctrl+[', 'Shrink the selection from its outer ring', select('less')),
    createAction('Select Linked', 'Ctrl+L', 'Add everything connected to the selection', select('linked')),
    { kind: 'separator' },
    createAction(
      'Select Loop',
      'Alt+L',
      'Follow the edge loop through four-way vertices, or a face strip from two adjacent faces',
      select('loop'),
    ),
    createAction(
      'Select Ring',
      'Alt+R',
      'Step selected edges across quads into rings, or a face strip from two adjacent faces',
      select('ring'),
    ),
  ];
}

/**
 * Builds the Edit Mode Mesh menu: tools that work in every component mode and
 * act on whatever the current selection holds.
 *
 * @param actions Edit tool actions.
 * @returns Menu entries.
 */
export function buildViewportToolMeshMenuEntries(actions: ViewportToolEditMenuActions): ToolbarMenuEntry[] {
  return [
    createAction('Knife Topology Tool', 'K', 'Insert a vertex on a hovered edge', actions.onKnife),
    createAction(
      'Make Face',
      '',
      'Fill a new mesh face through the selected vertices or edges, for example to close a hole',
      () => actions.onMeshTool('make_face'),
    ),
    createAction(
      'Fill Holes',
      '',
      'Close each hole whose rim touches the selected vertices or edges with a new face',
      () => actions.onMeshTool('fill_holes'),
    ),
    { kind: 'separator' },
    createAction(
      'Delete',
      'Backspace',
      'Delete the selected vertices, edges or faces; removing vertices or edges also removes the faces that use them',
      actions.onDelete,
    ),
    createAction(
      'Dissolve',
      'Delete',
      'Remove the selected vertices, edges or faces and join the surrounding faces',
      actions.onDissolve,
    ),
  ];
}

/**
 * Builds the Edit Mode Vertex menu.
 *
 * @param actions Edit tool actions.
 * @returns Menu entries.
 */
export function buildViewportToolVertexMenuEntries(actions: ViewportToolEditMenuActions): ToolbarMenuEntry[] {
  return [
    createMergeSubmenu(actions.onMerge),
    createAction('Connect Vertices', 'J', 'Cut the faces between the selected vertices with new edges', () =>
      actions.onMeshTool('connect_vertices'),
    ),
    createAction(
      'Smooth Vertices',
      '',
      'Relax the selected mesh vertices towards their neighbours; run it again to smooth further',
      () => actions.onMeshTool('smooth_vertices'),
    ),
  ];
}

/**
 * Builds the Edit Mode Edge menu.
 *
 * @param actions Edit tool actions.
 * @returns Menu entries.
 */
export function buildViewportToolEdgeMenuEntries(actions: ViewportToolEditMenuActions): ToolbarMenuEntry[] {
  return [
    createAction('Loop Cut', 'Ctrl+R', 'Cut a convex edge belt and slide it', actions.onLoopCut),
    createAction('Subdivide Edges', '', 'Split each selected mesh edge in half; run it again for finer cuts', () =>
      actions.onMeshTool('subdivide_edges'),
    ),
    createAction(
      'Bevel Edges',
      'Ctrl+B',
      'Cut the selected mesh edges off with a flat chamfer; move away from the edges or type a width',
      () => actions.onMeshTool('bevel_edges'),
    ),
    createAction(
      'Extrude Edges',
      'E',
      'Pull the selected open border edges straight out of their faces into a new strip; the new edges stay selected',
      () => actions.onMeshTool('extrude_edges'),
    ),
    createAction(
      'Bridge Edge Loops',
      '',
      'Join two selected edge loops, or two open edge runs of the same length, with a strip of faces',
      () => actions.onMeshTool('bridge_edge_loops'),
    ),
    createAction(
      'Rotate Edges',
      '',
      'Turn each selected edge between two mesh faces to the next corners, such as the other diagonal of a quad',
      () => actions.onMeshTool('rotate_edges'),
    ),
    createAction(
      'Collapse Edges',
      '',
      'Merge each run of selected mesh edges into one vertex at its middle, removing faces that shrink away',
      () => actions.onMeshTool('collapse_edges'),
    ),
  ];
}

/**
 * Builds the Edit Mode Face menu.
 *
 * @param actions Edit tool actions.
 * @returns Menu entries.
 */
export function buildViewportToolFaceMenuEntries(actions: ViewportToolEditMenuActions): ToolbarMenuEntry[] {
  const tool = (command: EditMeshToolCommand) => () => actions.onMeshTool(command);
  return [
    createAction(
      'Extrude Faces',
      'E',
      'Pull the selected mesh faces out along their normal, or push them in to cut a pocket; touching faces move together',
      tool('extrude_faces'),
    ),
    createAction(
      'Extrude Faces Individually',
      '',
      'Pull each selected mesh face out along its own normal, with walls between neighbours',
      tool('extrude_faces_individual'),
    ),
    createAction(
      'Inset Faces',
      'I',
      'Shrink the selected mesh faces inside their outline and ring them with new faces; Tab sets the depth, I toggles individual faces',
      tool('inset_faces'),
    ),
    createAction(
      'Solidify',
      '',
      'Give loose mesh faces, such as a single panel, a thickness so they become a closed slab',
      tool('solidify_faces'),
    ),
    createAction(
      'Shrink / Fatten',
      '',
      'Move the selected mesh faces in or out along their normals so the surface swells or sinks without new faces',
      tool('fatten_faces'),
    ),
    { kind: 'separator' },
    createAction(
      'Duplicate Faces',
      'Shift+D',
      'Copy the selected mesh faces onto their own vertices and select the copy, ready to move',
      tool('duplicate_faces'),
    ),
    createAction(
      'Split Faces',
      'Y',
      'Detach the selected mesh faces from the rest of the mesh so they move on their own',
      tool('split_faces'),
    ),
    createAction('Flip Faces', '', 'Turn the selected mesh faces to face the other way', tool('flip_faces')),
    createAction(
      'Triangulate Faces',
      '',
      'Split the selected mesh faces into triangles along their outline',
      tool('triangulate_faces'),
    ),
    createAction(
      'Poke Faces',
      '',
      'Fan the selected mesh faces into triangles around a new center vertex',
      tool('poke_faces'),
    ),
    createAction(
      'Join Triangles',
      '',
      'Join flat pairs of selected triangles into quads, for example after importing a triangulated model',
      tool('join_triangles'),
    ),
    { kind: 'separator' },
    createAction(
      'Assign Texture',
      '',
      'Paint the selected mesh faces with the texture last picked in the Texture Browser',
      tool('assign_texture'),
    ),
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
