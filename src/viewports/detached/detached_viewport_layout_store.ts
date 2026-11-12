import { deserializeAreaLayout, serializeAreaLayout } from '@/layout/area/area_layout_serializer.js';
import { listAreaLeafPlacements } from '@/layout/area/area_layout_tree.js';
import type { AreaTreeNode } from '@/layout/area/area_tree_node.js';
import { DETACHED_VIEWPORT_LAYOUT_STORAGE_KEY } from '@/settings/storage/settings_storage_keys.js';
import { areEditorStorageWritesSuppressed } from '@/settings/storage/clear_editor_storage.js';

/** Most areas a remembered detached layout may hold. */
export const DETACHED_VIEWPORT_LAYOUT_MAX_AREAS = 16;

/**
 * Reads the remembered detached window layout of this user.
 *
 * @param storage Browser storage, or null when unavailable.
 * @returns Layout tree, or null when nothing valid is stored.
 */
export function detachedViewportLayoutLoad(storage: Storage | null): AreaTreeNode | null {
  const text = readStoredText(storage);
  if (text === null) return null;
  try {
    const root = deserializeAreaLayout(JSON.parse(text));
    return root !== null && isUsableLayout(root) ? root : null;
  } catch {
    return null;
  }
}

/**
 * Remembers the detached window layout of this user.
 *
 * @param storage Browser storage, or null when unavailable.
 * @param root Layout tree to store.
 */
export function detachedViewportLayoutSave(storage: Storage | null, root: AreaTreeNode): void {
  if (storage === null || areEditorStorageWritesSuppressed()) return;
  try {
    storage.setItem(DETACHED_VIEWPORT_LAYOUT_STORAGE_KEY, JSON.stringify(serializeAreaLayout(root)));
  } catch {
    return;
  }
}

/**
 * Reads the raw stored layout text.
 *
 * @param storage Browser storage, or null.
 * @returns Stored text, or null.
 */
function readStoredText(storage: Storage | null): string | null {
  if (storage === null) return null;
  try {
    return storage.getItem(DETACHED_VIEWPORT_LAYOUT_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Returns whether a layout has a sane area count and unique area ids.
 *
 * @param root Parsed layout tree.
 * @returns True when the layout can be shown.
 */
function isUsableLayout(root: AreaTreeNode): boolean {
  const ids = listAreaLeafPlacements(root).map((placement) => placement.payload.areaId);
  return ids.length <= DETACHED_VIEWPORT_LAYOUT_MAX_AREAS && new Set(ids).size === ids.length;
}
