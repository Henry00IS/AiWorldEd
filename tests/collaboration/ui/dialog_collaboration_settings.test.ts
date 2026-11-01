import { afterEach, describe, expect, it } from 'vitest';
import { CONFIG_COLLABORATION_URL_DEVELOPMENT } from '@/collaboration/config/config_collaboration_server.js';
import { DialogCollaborationSettings } from '@/collaboration/ui/dialog_collaboration_settings.js';

const FALLBACK = CONFIG_COLLABORATION_URL_DEVELOPMENT;

/**
 * Opens the settings dialog and returns its inputs.
 *
 * @param name Stored display name.
 * @param roomName Name used in the current room, or null outside a room.
 * @returns Pending result and the URL and name inputs.
 */
function dialogOpen(
  name: string,
  roomName: string | null = null,
): {
  result: Promise<unknown>;
  url: HTMLInputElement;
  input: HTMLInputElement;
} {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const result = new DialogCollaborationSettings(host, { url: '', name }, FALLBACK, roomName).open();
  const [url, input] = Array.from(document.querySelectorAll<HTMLInputElement>('[role=dialog] input'));
  if (url === undefined || input === undefined) throw new Error('settings inputs missing');
  return { result, url, input };
}

/**
 * Presses Enter in an input.
 *
 * @param input Target input.
 */
function enter(input: HTMLInputElement): void {
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
}

afterEach(() => {
  document.body.innerHTML = '';
});

/** Collaboration settings dialog: saving the relay URL and the display name. */
describe('dialog_collaboration_settings', () => {
  it('saves the full display name on Enter', async () => {
    const { result, input } = dialogOpen('A');
    input.value = 'Alice';
    enter(input);
    await expect(result).resolves.toEqual({ url: '', name: 'Alice' });
  });

  it('keeps the dialog open on Enter with an invalid URL', () => {
    const { url } = dialogOpen('Alice');
    url.value = 'http://example.test';
    enter(url);
    expect(document.querySelector('[role=dialog]')?.textContent).toContain('Use a ws:// or wss:// URL.');
  });

  it('locks the name while in a room and keeps the stored name on save', async () => {
    const { result, url, input } = dialogOpen('Henry', 'Henry2');
    expect(input.disabled).toBe(true);
    expect(input.value).toBe('Henry2');
    expect(document.querySelector('[role=dialog]')?.textContent).toContain('fixed while you are in this room');
    input.value = 'Mallory';
    enter(url);
    await expect(result).resolves.toEqual({ url: '', name: 'Henry' });
  });
});
