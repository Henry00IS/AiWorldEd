import { describe, expect, it, vi } from 'vitest';
import {
  SCENE_FILE_RECENT_MENU_PROMPT_TOOLTIP,
  sceneFileRecentMenuEntries,
} from '@/io/scene_file/recent/scene_file_recent_menu.js';
import { isMenuAction, isMenuSeparator } from '@/ui/menu/menu_types.js';
import { sceneFileRecentFakeHandle } from './scene_file_recent_fakes.js';

describe('sceneFileRecentMenuEntries', () => {
  it('builds no rows without reachable files, so the submenu hides', () => {
    expect(sceneFileRecentMenuEntries([], { open: vi.fn(), clear: vi.fn() }, 0)).toEqual([]);
  });

  it('lists each file with how long ago it was used, then Clear Recent', () => {
    const now = Date.UTC(2026, 10, 11, 12);
    const open = vi.fn();
    const clear = vi.fn();
    const fresh = {
      entry: { handle: sceneFileRecentFakeHandle('fresh.aiworld'), usedAt: now - 5 * 60_000 },
      access: 'granted' as const,
    };
    const stale = {
      entry: { handle: sceneFileRecentFakeHandle('stale.aiworld'), usedAt: now - 3 * 3_600_000 },
      access: 'prompt' as const,
    };

    const entries = sceneFileRecentMenuEntries([fresh, stale], { open, clear }, now);
    const actions = entries.filter(isMenuAction);
    actions[1]!.onClick();
    actions[2]!.onClick();

    expect(actions.map((entry) => [entry.label, entry.shortcut])).toEqual([
      ['fresh.aiworld', '5 min ago'],
      ['stale.aiworld', '3 h ago'],
      ['Clear Recent', undefined],
    ]);
    expect(actions[0]!.tooltip).toBeUndefined();
    expect(actions[1]!.tooltip).toBe(SCENE_FILE_RECENT_MENU_PROMPT_TOOLTIP);
    expect(isMenuSeparator(entries[2]!)).toBe(true);
    expect(open).toHaveBeenCalledWith(stale);
    expect(clear).toHaveBeenCalledOnce();
  });
});
