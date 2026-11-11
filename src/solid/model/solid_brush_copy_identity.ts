import { SolidBrushCollection } from './solid_brush_collection.js';
import { hierarchyNameAllocator } from '@/utils/utils_hierarchy_name_allocator.js';

/**
 * Allocates a brush identity with a fresh display suffix.
 *
 * @param brushes Owning brush collection.
 * @param sourceName Source display name.
 * @returns Fresh internal id and display name.
 */
export function allocateBrushCopyIdentity(
  brushes: SolidBrushCollection,
  sourceName: string,
): { id: string; name: string } {
  brushes.nextBrushCounter();
  return { id: brushes.allocateBrushId(), name: hierarchyNameAllocator.allocateFromSourceName(sourceName) };
}
