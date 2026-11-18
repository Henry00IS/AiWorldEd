import { afterEach, describe, expect, it } from 'vitest';
import { EditorSettingsStore } from '@/settings/store/editor_settings_store.js';
import { MemorySettingsStorage } from '@/settings/storage/settings_storage.js';
import type { DesktopPresenceSource } from '@/desktop/presence/desktop_presence_source.js';
import { desktopPresenceAttachRegister } from '@/desktop/presence/desktop_presence_source.js';
import {
  DiscordRichPresenceReporter,
  discordRichPresenceEditorStateFrom,
} from '@/desktop/discord/discord_rich_presence_reporter.js';
import type { DiscordRichPresenceBridge } from '@/desktop/discord/discord_rich_presence_protocol.js';
import type { DiscordRichPresenceEditorState } from '@/desktop/discord/discord_rich_presence_activity.js';

/**
 * Creates a presence source with an in-memory settings store.
 *
 * @param store Settings store.
 * @param brushCount Brush count to report.
 * @returns Presence source.
 */
function sourceWithStore(store: EditorSettingsStore, brushCount: number = 4): DesktopPresenceSource {
  return {
    capture: () => ({ levelName: 'keep.aiworld', projectName: 'Castle', brushCount }),
    settingsStore: () => store,
  };
}

/**
 * Creates a bridge that records updates.
 *
 * @param updates Destination array.
 * @returns Bridge.
 */
function recordingBridge(updates: DiscordRichPresenceEditorState[]): DiscordRichPresenceBridge {
  return { update: (state) => updates.push(state) };
}

afterEach(() => {
  desktopPresenceAttachRegister(null);
});

describe('discord_rich_presence_reporter', () => {
  it('builds editor state from the presence source and current Discord settings', () => {
    const store = new EditorSettingsStore(new MemorySettingsStorage());
    store.setDiscordHideProjectName(true);
    expect(discordRichPresenceEditorStateFrom(sourceWithStore(store, 4))).toEqual({
      enabled: true,
      hideProjectName: true,
      projectName: 'Castle',
      levelName: 'keep.aiworld',
      brushCount: 4,
    });
  });

  it('sends a snapshot when the source attaches and again when settings change', () => {
    const updates: DiscordRichPresenceEditorState[] = [];
    const store = new EditorSettingsStore(new MemorySettingsStorage());
    const reporter = new DiscordRichPresenceReporter(recordingBridge(updates), {
      setIntervalFn: () => 1,
      clearIntervalFn: () => undefined,
    });
    reporter.attach(sourceWithStore(store));
    expect(updates).toHaveLength(1);
    expect(updates[0]?.enabled).toBe(true);
    store.setDiscordRichPresenceEnabled(false);
    expect(updates).toHaveLength(2);
    expect(updates[1]?.enabled).toBe(false);
    store.setDiscordRichPresenceEnabled(false);
    expect(updates).toHaveLength(2);
    reporter.stop();
  });
});
