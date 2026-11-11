import { describe, it, expect, vi, afterEach } from 'vitest';
import { ClipboardStore } from '@/clipboard/clipboard_store.js';

/**
 * Builds a fake copy or paste event backed by a text map.
 *
 * @param text Text the clipboard holds.
 * @returns Event-like object and its data map.
 */
function fakeEvent(text = ''): { event: ClipboardEvent; data: Map<string, string> } {
  const data = new Map([['text/plain', text]]);
  const clipboardData = {
    setData: (kind: string, value: string) => data.set(kind, value),
    getData: (kind: string) => data.get(kind) ?? '',
  };
  return { event: { clipboardData, preventDefault: vi.fn() } as unknown as ClipboardEvent, data };
}

describe('ClipboardStore', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('writes events as payload text and reads them back', () => {
    const store = new ClipboardStore();
    const copy = fakeEvent();
    store.writeEvent(copy.event, 'modifiers', { a: 1 });
    expect(copy.event.preventDefault).toHaveBeenCalled();
    const paste = fakeEvent(copy.data.get('text/plain'));
    expect(store.readEvent(paste.event, 'modifiers')).toEqual({ a: 1 });
    expect(store.readEvent(paste.event, 'scene-objects')).toBeNull();
  });

  it('does not paste a stale in-app copy once the system clipboard took newer text', () => {
    const store = new ClipboardStore();
    store.writeEvent(fakeEvent().event, 'modifiers', { a: 1 });
    expect(store.readEvent(fakeEvent('other text').event, 'modifiers')).toBeNull();
  });

  it('falls back to the in-app copy when the system clipboard is unavailable', async () => {
    vi.stubGlobal('navigator', { clipboard: { readText: () => Promise.reject(new Error('denied')) } });
    const store = new ClipboardStore();
    await store.write('generator-settings', { kind: 'column' });
    expect(store.holds('generator-settings')).toBe(true);
    expect(await store.read('generator-settings')).toEqual({ kind: 'column' });
    expect(store.readEvent(fakeEvent('').event, 'generator-settings')).toEqual({ kind: 'column' });
    store.clear();
    expect(store.holds('generator-settings')).toBe(false);
  });
});
