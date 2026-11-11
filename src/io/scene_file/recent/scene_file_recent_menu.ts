import type { ToolbarMenuEntry } from '@/ui/menu/menu_types.js';
import { timeRelativeText } from '@/utils/utils_time_relative.js';
import type { SceneFileRecentItem } from './scene_file_recent.js';

/** What the Recent submenu does with a click. */
export interface SceneFileRecentMenuActions {
  /** Opens a Recent file. */
  open: (item: SceneFileRecentItem) => void;
  /** Empties the Recent list. */
  clear: () => void;
}

/** Tooltip of a Recent file the browser asks access for again. */
export const SCENE_FILE_RECENT_MENU_PROMPT_TOOLTIP = 'The browser asks for access to this file again when you open it.';

/**
 * Builds the rows of the Recent submenu: one per reachable file, newest first,
 * with how long ago it was used, then Clear Recent. Empty when no file is
 * reachable, so the submenu can hide.
 *
 * @param items Reachable Recent files, newest first.
 * @param actions Click handlers.
 * @param now Current time in milliseconds.
 * @returns Submenu entries.
 */
export function sceneFileRecentMenuEntries(
  items: readonly SceneFileRecentItem[],
  actions: SceneFileRecentMenuActions,
  now: number,
): ToolbarMenuEntry[] {
  if (items.length === 0) return [];
  const files = items.map<ToolbarMenuEntry>((item) => ({
    label: item.entry.handle.name,
    onClick: () => actions.open(item),
    shortcut: timeRelativeText(item.entry.usedAt, now),
    ...(item.access === 'prompt' ? { tooltip: SCENE_FILE_RECENT_MENU_PROMPT_TOOLTIP } : {}),
  }));
  return [...files, { kind: 'separator' }, { label: 'Clear Recent', onClick: () => actions.clear() }];
}
