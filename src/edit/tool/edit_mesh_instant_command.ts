import type { HandlerComponentMeshOperations } from '@/edit/topology/handler_component_mesh_operations.js';
import type { EditMeshToolCommand } from './edit_mesh_tool_command.js';

/** Operations that apply at once, by command. */
const EDIT_MESH_INSTANT_COMMANDS: Partial<
  Record<EditMeshToolCommand, (operations: HandlerComponentMeshOperations) => boolean>
> = {
  subdivide_edges: (operations) => operations.subdivideSelectedEdges(1),
  make_face: (operations) => operations.makeFaceFromSelection(),
  connect_vertices: (operations) => operations.connectSelectedVertices(),
  smooth_vertices: (operations) => operations.smoothSelectedVertices(),
  bridge_edge_loops: (operations) => operations.bridgeSelectedEdgeLoops(),
  flip_faces: (operations) => operations.flipSelectedFaces(),
  duplicate_faces: (operations) => operations.duplicateSelectedFaces(),
  split_faces: (operations) => operations.splitOffSelectedFaces(),
  triangulate_faces: (operations) => operations.triangulateSelectedFaces(),
  poke_faces: (operations) => operations.pokeSelectedFaces(),
  join_triangles: (operations) => operations.joinSelectedTriangles(),
};

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
  const run = EDIT_MESH_INSTANT_COMMANDS[command];
  if (!run) return false;
  if (operations) run(operations);
  return true;
}
