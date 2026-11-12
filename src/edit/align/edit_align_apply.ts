import type { CommandStack } from '@/commands/command_stack.js';
import type { EditSession } from '@/edit/session/edit_session.js';
import { CommandComponentPositions } from '@/edit/transform/command_component_positions.js';
import { applyComponentWorldPositions } from '@/edit/transform/component_transform_apply.js';
import { expandComponentSelectionToTransformVertices } from '@/edit/transform/component_transform_selection.js';
import { componentTransformLocalToWorld } from '@/edit/transform/component_transform_vertex.js';
import type { GridSnap } from '@/transform/snap/grid_snap.js';
import { editAlignPositionsChanged, editAlignWorldPositions } from './edit_align_positions.js';
import type { EditAlignRequest } from './edit_align_request.js';

/**
 * Aligns the vertices of the current Edit Mode selection and records one undo
 * step for them.
 *
 * @param session Active Edit Mode session.
 * @param request Alignment to perform.
 * @param gridSnap Working grid frame and snap interval.
 * @param commandStack Undo stack, or null to skip history.
 * @param afterDisplaysRebuilt Presentation refresh run after undo and redo.
 * @returns Number of selected vertices, or 0 when nothing moved.
 */
export function editAlignSelectionApply(
  session: EditSession,
  request: EditAlignRequest,
  gridSnap: GridSnap,
  commandStack: CommandStack | null,
  afterDisplaysRebuilt: (() => void) | null,
): number {
  const vertices = expandComponentSelectionToTransformVertices(
    session.getComponentSelection().getSelected(),
    session.getDomain(),
  );
  const before = vertices.map((vertex) => componentTransformLocalToWorld(vertex, vertex.initialLocal));
  const after = editAlignWorldPositions(before, request, gridSnap);
  if (!editAlignPositionsChanged(before, after)) return 0;
  applyComponentWorldPositions(vertices, after);
  commandStack?.recordExecuted(new CommandComponentPositions(vertices, afterDisplaysRebuilt));
  return vertices.length;
}
