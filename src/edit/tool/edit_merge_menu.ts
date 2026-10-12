import { MenuContext } from '@/ui/menu/menu_context.js';
import type { TopologyVertexMergeMode } from '@/edit/topology/topology_vertex_merge_mode.js';

/**
 * Opens a Blender-style merge menu at a screen position.
 *
 * @param hostElement Host used to construct the menu.
 * @param clientX Screen X.
 * @param clientY Screen Y.
 * @param onMerge Chosen merge mode callback.
 * @returns Opened menu.
 */
export function openEditMergeMenu(
  hostElement: HTMLElement,
  clientX: number,
  clientY: number,
  onMerge: (mode: TopologyVertexMergeMode) => void,
): MenuContext {
  const menu = new MenuContext(hostElement, [
    { label: 'At Center', callback: () => onMerge('at_center') },
    { label: 'At First', callback: () => onMerge('at_first') },
    { label: 'At Last', callback: () => onMerge('at_last') },
    { kind: 'separator' },
    { label: 'By Distance', callback: () => onMerge('by_distance') },
  ]);
  menu.show(clientX, clientY);
  return menu;
}
