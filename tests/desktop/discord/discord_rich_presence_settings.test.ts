import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorSettingsStore } from '@/settings/store/editor_settings_store.js';
import { MemorySettingsStorage } from '@/settings/storage/settings_storage.js';
import { DialogSettings } from '@/ui/settings/dialog_settings.js';

describe('discord_rich_presence_settings', () => {
  let host: HTMLElement;
  let store: EditorSettingsStore;
  let dialog: DialogSettings;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    store = new EditorSettingsStore(new MemorySettingsStorage());
  });

  afterEach(() => {
    dialog?.dispose();
    host.remove();
    delete window.aiworldedDiscordPresence;
  });

  it('hides the Discord category in the web build when no desktop bridge is present', () => {
    dialog = new DialogSettings(host, store);
    dialog.show();
    expect(dialog.getContentElement().querySelector('[data-settings-field="discord-rich-presence"]')).toBeNull();
  });

  it('shows Discord Rich Presence and Hide Project Name controls on desktop, both defaulting correctly', () => {
    window.aiworldedDiscordPresence = { update: () => undefined };
    dialog = new DialogSettings(host, store);
    dialog.show();
    const presence = queryField(dialog, 'discord-rich-presence');
    const hideName = queryField(dialog, 'discord-hide-project-name');
    expect(presence.checked).toBe(true);
    expect(hideName.checked).toBe(false);
    expect(hideName.disabled).toBe(false);
    presence.click();
    expect(store.getDiscordSettings()).toEqual({ richPresenceEnabled: false, hideProjectName: false });
  });

  it('disables Hide Project Name when Rich Presence is turned off', () => {
    window.aiworldedDiscordPresence = { update: () => undefined };
    store.setDiscordRichPresenceEnabled(false);
    dialog = new DialogSettings(host, store);
    dialog.show();
    expect(queryField(dialog, 'discord-hide-project-name').disabled).toBe(true);
  });
});

/**
 * Returns a settings field input from the open dialog.
 *
 * @param dialog Settings dialog.
 * @param field Field dataset value.
 * @returns Input element.
 */
function queryField(dialog: DialogSettings, field: string): HTMLInputElement {
  const input = dialog.getContentElement().querySelector(`[data-settings-field="${field}"]`);
  if (!(input instanceof HTMLInputElement)) throw new Error(`missing field ${field}`);
  return input;
}
