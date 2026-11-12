import { afterEach, describe, expect, it, vi } from 'vitest';
import { clipboardTextCopy } from '@/clipboard/clipboard_text_copy.js';

/**
 * Replaces navigator.clipboard for one test.
 *
 * @param clipboard Replacement, or undefined to remove it.
 */
function clipboardStub(clipboard: Partial<Clipboard> | undefined): void {
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
}

/** Copy text with the async clipboard API and its fallback. */
describe('clipboard text copy', () => {
  afterEach(() => clipboardStub(undefined));

  it('writes through the async clipboard API', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    clipboardStub({ writeText });
    expect(await clipboardTextCopy('Secret-Pass-9')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('Secret-Pass-9');
  });

  it('falls back to execCommand when the clipboard API is missing or refuses', async () => {
    const exec = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true });
    clipboardStub(undefined);
    expect(await clipboardTextCopy('a')).toBe(true);
    clipboardStub({ writeText: () => Promise.reject(new Error('denied')) });
    expect(await clipboardTextCopy('b')).toBe(true);
    expect(exec).toHaveBeenCalledTimes(2);
    expect(document.querySelector('textarea')).toBeNull();
  });
});
