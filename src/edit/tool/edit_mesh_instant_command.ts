import type { HandlerComponentMeshOperations } from '@/edit/topology/handler_component_mesh_operations.js';
import type { EditMeshToolCommand } from './edit_mesh_tool_command.js';

/**
 * Runs an Edit Mode modelling command that applies at once, without an
 * interactive tool.
 *
 * @param command Requested command.
 * @param operations Mesh operations of the open edit session, if any.
 * @returns True when the command is an instant one and was handled here.
 */
export function runEditMeshInstantCommand(
  command: EditMeshToolCommand,
  operations: HandlerComponentMeshOperations | null,
): boolean {
  if (command === 'subdivide_edges') {
    operations?.subdivideSelectedEdges(1);
    return true;
  }
  if (command === 'make_face') {
    operations?.makeFaceFromSelection();
    return true;
  }
  return false;
}
