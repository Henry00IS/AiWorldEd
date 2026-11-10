import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NATIVE_SELECT_ALL_SCOPE_ATTRIBUTE, nativeBrowserDefaultsInstall } from '@/ui/input/native_browser_defaults.js';

/**
 * Right-clicks an element.
 *
 * @param target Element.
 * @returns True when the browser menu would show.
 */
function rightClick(target: Element): boolean {
  return target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
}

/**
 * Presses a key with Ctrl on the focused element (or body).
 *
 * @param key Key.
 * @param init Extra modifiers.
 * @returns True when the browser default would run.
 */
function pressCtrl(key: string, init: KeyboardEventInit = {}): boolean {
  const target = document.activeElement ?? document.body;
  return target.dispatchEvent(
    new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true, ...init }),
  );
}

describe('nativeBrowserDefaultsInstall', () => {
  let uninstall: () => void;

  beforeEach(() => {
    uninstall = nativeBrowserDefaultsInstall(window);
  });

  afterEach(() => {
    uninstall();
    document.body.replaceChildren();
    window.getSelection()?.removeAllRanges();
  });

  it('stops the browser menu on panel labels such as the inspector', () => {
    const label = document.createElement('span');
    label.textContent = 'Position';
    document.body.append(label);
    expect(rightClick(label)).toBe(false);
  });

  it('keeps the browser menu in text, numeric and password fields and text areas', () => {
    for (const type of ['text', 'number', 'password']) {
      const input = document.createElement('input');
      input.type = type;
      document.body.append(input);
      expect(rightClick(input)).toBe(true);
    }
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    document.body.append(checkbox);
    expect(rightClick(checkbox)).toBe(false);
    const area = document.createElement('textarea');
    document.body.append(area);
    expect(rightClick(area)).toBe(true);
  });

  it('keeps the browser menu on text marked selectable, like chat messages', () => {
    const message = document.createElement('span');
    message.style.userSelect = 'text';
    message.textContent = 'hello';
    document.body.append(message);
    expect(rightClick(message)).toBe(true);
  });

  it('leaves an editor menu that already handled the click alone', () => {
    const canvas = document.createElement('canvas');
    const own = vi.fn((event: Event) => event.preventDefault());
    canvas.addEventListener('contextmenu', own);
    document.body.append(canvas);
    expect(rightClick(canvas)).toBe(false);
    expect(own).toHaveBeenCalledOnce();
  });

  it('stops page-wide select-all outside text fields, for Ctrl and Cmd', () => {
    document.body.append(Object.assign(document.createElement('div'), { textContent: 'Object Mode' }));
    expect(pressCtrl('a')).toBe(false);
    expect(pressCtrl('A')).toBe(false);
    expect(pressCtrl('a', { ctrlKey: false, metaKey: true })).toBe(false);
    expect(pressCtrl('c')).toBe(true);
  });

  it('runs the editor’s own Ctrl+A handlers first', () => {
    const own = vi.fn();
    window.addEventListener('keydown', own, true);
    expect(pressCtrl('a')).toBe(false);
    window.removeEventListener('keydown', own, true);
    expect(own).toHaveBeenCalledOnce();
  });

  it('keeps select-all inside a focused text field', () => {
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    expect(pressCtrl('a')).toBe(true);
  });

  it('selects only the chat messages when the selection is inside them', () => {
    const outside = Object.assign(document.createElement('div'), { textContent: 'Object Mode' });
    const log = document.createElement('div');
    log.setAttribute(NATIVE_SELECT_ALL_SCOPE_ATTRIBUTE, '');
    const first = Object.assign(document.createElement('p'), { textContent: 'first' });
    const second = Object.assign(document.createElement('p'), { textContent: 'second' });
    log.append(first, second);
    document.body.append(outside, log);
    window.getSelection()?.collapse(first.firstChild as Text, 1);
    expect(pressCtrl('a')).toBe(false);
    expect(window.getSelection()?.toString()).toBe('firstsecond');
  });
});
