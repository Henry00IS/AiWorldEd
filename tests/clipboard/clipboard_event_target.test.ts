import { describe, it, expect, vi } from 'vitest';
import { clipboardEventForEditor, clipboardEventsListen } from '@/clipboard/clipboard_event_target.js';

/**
 * Dispatches a clipboard-like event on an element.
 *
 * @param target Element the event starts at.
 * @param type Copy or paste.
 * @returns The event.
 */
function dispatch(target: Element, type: 'copy' | 'paste'): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe('clipboard event target', () => {
  it('sends copy and paste from the canvas but not from text fields or dialogs', () => {
    document.body.innerHTML = '<canvas></canvas><input /><div role="dialog"><button></button></div>';
    const copy = vi.fn(() => true);
    const paste = vi.fn(() => true);
    const stop = clipboardEventsListen(document, { copy, paste });
    const canvas = document.querySelector('canvas');
    const input = document.querySelector('input');
    const button = document.querySelector('button');
    if (!canvas || !input || !button) throw new Error('fixture missing');
    expect(dispatch(canvas, 'paste').defaultPrevented).toBe(true);
    dispatch(canvas, 'copy');
    dispatch(input, 'copy');
    dispatch(button, 'paste');
    expect(copy).toHaveBeenCalledTimes(1);
    expect(paste).toHaveBeenCalledTimes(1);
    stop();
    dispatch(canvas, 'copy');
    expect(copy).toHaveBeenCalledTimes(1);
  });

  it('leaves copies of selected page text alone', () => {
    document.body.innerHTML = '<p>some text</p>';
    const paragraph = document.querySelector('p');
    if (!paragraph) throw new Error('fixture missing');
    document.getSelection()?.selectAllChildren(paragraph);
    const event = new Event('copy', { bubbles: true });
    Object.defineProperty(event, 'target', { value: paragraph });
    expect(clipboardEventForEditor(event as ClipboardEvent)).toBe(false);
    document.getSelection()?.removeAllRanges();
  });
});
