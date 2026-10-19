import type { Mesh } from 'three';
import type { ManagerSelection } from '@/selection/object/manager_selection.js';

/**
 * Selects a newly created hull brush, then refreshes viewport pick lists.
 *
 * @param selectionManager Object selection that receives the hull mesh.
 * @param mesh Hull preview mesh already parented in the world.
 * @param refreshAfterWorldMutation Rebuilds selectable lists after the brush
 *   exists.
 */
export function hullBrushSelectionFinish(
  selectionManager: ManagerSelection,
  mesh: Mesh,
  refreshAfterWorldMutation: () => void,
): void {
  selectionManager.selectObject(mesh);
  refreshAfterWorldMutation();
}
