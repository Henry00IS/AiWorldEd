import type { SceneJSON } from '@/io/scene/io_types.js';

/**
 * Counts everything in a serialized level: each scene object, plus every brush,
 * CSG group, generator and volume inside each solid model. It reads the data
 * that was just serialized for the save, so it costs one walk over it.
 *
 * @param data Serialized level.
 * @returns Object count.
 */
export function projectHistoryObjectCount(data: SceneJSON): number {
  let count = data.objects.length;
  for (const object of data.objects) {
    const model = object.solidModel;
    if (model === undefined) continue;
    count += model.brushes.length + projectHistoryBranchCount(model.hierarchy ?? []);
  }
  return count;
}

/**
 * Counts the groups, generators and volumes of a solid model hierarchy; its
 * brush leaves are counted with the brush list.
 *
 * @param nodes Hierarchy nodes.
 * @returns Count.
 */
function projectHistoryBranchCount(nodes: readonly Record<string, unknown>[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node['kind'] === 'brush') continue;
    count += 1;
    const children = node['children'];
    if (Array.isArray(children)) count += projectHistoryBranchCount(children as Record<string, unknown>[]);
  }
  return count;
}
