import { afterEach, describe, expect, it } from 'vitest';
import {
  DETACHED_VIEWPORT_LAYOUT_MAX_AREAS,
  detachedViewportLayoutLoad,
  detachedViewportLayoutSave,
} from '@/viewports/detached/detached_viewport_layout_store.js';
import { createDualTopPerspectiveLayout } from '@/layout/area/area_layout_presets.js';
import { listAreaLeafPlacements } from '@/layout/area/area_layout_tree.js';
import { DETACHED_VIEWPORT_LAYOUT_STORAGE_KEY } from '@/settings/storage/settings_storage_keys.js';
import {
  allowEditorStorageWritesForTests,
  suppressEditorStorageWrites,
} from '@/settings/storage/clear_editor_storage.js';

/**
 * Builds a serialized leaf.
 *
 * @param areaId Area id.
 * @returns Leaf document.
 */
function leaf(areaId: string): object {
  return { type: 'leaf', areaId, editorType: 'viewport', viewportKind: 'top' };
}

/**
 * Builds a horizontal chain of leaves.
 *
 * @param ids Area ids.
 * @returns Node document.
 */
function chain(ids: readonly string[]): object {
  const [first, ...rest] = ids;
  if (first === undefined) throw new Error('empty chain');
  if (rest.length === 0) return leaf(first);
  return { type: 'split', direction: 'horizontal', ratio: 0.5, first: leaf(first), second: chain(rest) };
}

afterEach(() => {
  localStorage.clear();
  allowEditorStorageWritesForTests();
});

describe('detached viewport layout store', () => {
  it('round-trips a split layout through storage', () => {
    detachedViewportLayoutSave(localStorage, createDualTopPerspectiveLayout());
    const loaded = detachedViewportLayoutLoad(localStorage);
    expect(loaded).not.toBeNull();
    const kinds = listAreaLeafPlacements(loaded ?? createDualTopPerspectiveLayout()).map((p) => p.payload.viewportKind);
    expect(kinds).toEqual(['top', 'perspective']);
  });

  it('returns null for missing, malformed or hostile documents', () => {
    expect(detachedViewportLayoutLoad(null)).toBeNull();
    expect(detachedViewportLayoutLoad(localStorage)).toBeNull();
    localStorage.setItem(DETACHED_VIEWPORT_LAYOUT_STORAGE_KEY, '{not json');
    expect(detachedViewportLayoutLoad(localStorage)).toBeNull();
    localStorage.setItem(DETACHED_VIEWPORT_LAYOUT_STORAGE_KEY, JSON.stringify({ version: 1, root: chain(['a', 'a']) }));
    expect(detachedViewportLayoutLoad(localStorage)).toBeNull();
    const many = Array.from({ length: DETACHED_VIEWPORT_LAYOUT_MAX_AREAS + 1 }, (_, index) => `area_${index}`);
    localStorage.setItem(DETACHED_VIEWPORT_LAYOUT_STORAGE_KEY, JSON.stringify({ version: 1, root: chain(many) }));
    expect(detachedViewportLayoutLoad(localStorage)).toBeNull();
  });

  it('does not write while editor storage writes are suppressed', () => {
    suppressEditorStorageWrites();
    detachedViewportLayoutSave(localStorage, createDualTopPerspectiveLayout());
    expect(localStorage.getItem(DETACHED_VIEWPORT_LAYOUT_STORAGE_KEY)).toBeNull();
  });
});
