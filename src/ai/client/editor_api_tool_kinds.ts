/** MCP tools that only read the editor and never change the scene or selection. */
const EDITOR_API_READ_TOOLS: ReadonlySet<string> = new Set([
  'get_editor_context',
  'get_snap_settings',
  'list_solid_models',
  'get_solid_model',
  'get_brush',
  'get_scene_hierarchy',
  'get_selection',
  'get_csg_group',
  'find_brushes',
  'describe_brush',
  'half_extents',
  'query_brush_bounds',
  'query_overlaps',
  'query_point',
  'query_neighbors',
  'measure',
  'preview_transform',
  'preview_new_box',
  'explain_csg_at_point',
  'query_void_connectivity',
  'validate_brush',
  'validate_solid_model',
  'calculate',
  'capture_view',
]);

/**
 * Returns whether an MCP tool may change the scene, the selection or the
 * history, so it must go through the collaboration guard inside a room.
 *
 * @param name Tool name.
 * @returns True for every tool that is not a known read.
 */
export function editorApiToolMutates(name: string): boolean {
  return !EDITOR_API_READ_TOOLS.has(name);
}
