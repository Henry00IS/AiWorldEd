import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLIPBOARD_COLLABORATION_FEEDBACK_MS,
  clipboardCollaborationButton,
  clipboardCollaborationCopy,
} from '@/collaboration/ui/clipboard_collaboration_copy.js';

/**
 * Replaces navigator.clipboard for one test.
 *
 * @param clipboard Replacement, or undefined to remove it.
 */
function clipboardStub(clipboard: Partial<Clipboard> | undefined): void {
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
}

/**
 * Lets pending promise callbacks run.
 *
 * @returns Promise that settles after the microtask queue drained.
 */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Copy to clipboard with feedback and fallback. */
describe('clipboard_collaboration_copy', () => {
  afterEach(() => {
    clipboardStub(undefined);
    vi.useRealTimers();
  });

  it('writes through the async clipboard API', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    clipboardStub({ writeText });
    expect(await clipboardCollaborationCopy('Secret-Pass-9')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('Secret-Pass-9');
  });

  it('falls back to execCommand when the clipboard API is missing or refuses', async () => {
    const exec = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true });
    clipboardStub(undefined);
    expect(await clipboardCollaborationCopy('a')).toBe(true);
    clipboardStub({ writeText: () => Promise.reject(new Error('denied')) });
    expect(await clipboardCollaborationCopy('b')).toBe(true);
    expect(exec).toHaveBeenCalledTimes(2);
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('shows Copied on the button, then reverts', async () => {
    clipboardStub({ writeText: () => Promise.resolve() });
    const button = clipboardCollaborationButton(() => 'x', 'Copy it');
    button.click();
    await flush();
    expect(button.textContent).toBe('Copied');
    await new Promise((resolve) => setTimeout(resolve, CLIPBOARD_COLLABORATION_FEEDBACK_MS + 50));
    expect(button.textContent).toBe('Copy');
  });
});
