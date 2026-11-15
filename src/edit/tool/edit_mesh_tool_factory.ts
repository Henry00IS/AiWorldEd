import type { Tool } from '@/editor/tools/tool.js';
import { EditFaceExtrudeTool } from './edit_face_extrude_tool.js';
import { EditFaceInsetTool } from './edit_face_inset_tool.js';
import type { EditMeshToolCommand } from './edit_mesh_tool_command.js';

/**
 * Creates the single-use tool for an interactive Edit Mode modelling command.
 * Extrude follows the component mode, so Extrude Edges shares its tool.
 *
 * @param command Tool to create.
 * @returns New tool instance.
 */
export function createEditMeshTool(command: EditMeshToolCommand): Tool {
  if (command === 'extrude_faces_individual') return new EditFaceExtrudeTool('individual');
  if (command === 'inset_faces') return new EditFaceInsetTool();
  return new EditFaceExtrudeTool('region');
}
