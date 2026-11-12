import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLIPBOARD_COLLABORATION_FEEDBACK_MS,
  clipboardCollaborationButton,
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

/** Copy button with feedback. */
describe('clipboard_collaboration_copy', () => {
  afterEach(() => {
    clipboardStub(undefined);
    vi.useRealTimers();
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
