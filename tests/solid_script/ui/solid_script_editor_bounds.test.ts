import { afterEach, describe, expect, it } from 'vitest';
import { solidScriptEditorCurrentGet } from '@/solid_script/ui/solid_script_editor_open.js';
import { SOLID_SCRIPT_EDITOR_BOUNDS_KEY } from '@/solid_script/ui/solid_script_editor_splitters.js';
import { editorFixture } from './solid_script_editor_fixture.js';

/**
 * Makes an element report a laid-out rectangle, as jsdom lays nothing out.
 *
 * @param element Element.
 * @param rect Rectangle in CSS pixels.
 */
function layoutFake(element: HTMLElement, rect: { left: number; top: number; width: number; height: number }): void {
  element.getBoundingClientRect = () =>
    ({ ...rect, x: rect.left, y: rect.top, right: rect.left + rect.width, bottom: rect.top + rect.height }) as DOMRect;
}

/**
 * Presses and releases the pointer on an element.
 *
 * @param element Element pressed.
 */
function pointerPressRelease(element: Element): void {
  element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 1, clientY: 1 }));
  window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
}

/**
 * Reads the remembered window rectangle.
 *
 * @returns Rectangle, or null.
 */
function remembered(): unknown {
  return JSON.parse(window.localStorage.getItem(SOLID_SCRIPT_EDITOR_BOUNDS_KEY) ?? 'null');
}

afterEach(() => {
  solidScriptEditorCurrentGet()?.close();
  document.body.replaceChildren();
  window.localStorage.removeItem(SOLID_SCRIPT_EDITOR_BOUNDS_KEY);
});

describe('SolidScript editor window remembers its position and size', () => {
  it('opens at the remembered position and size', () => {
    window.localStorage.setItem(
      SOLID_SCRIPT_EDITOR_BOUNDS_KEY,
      JSON.stringify({ left: 120, top: 90, width: 777, height: 555 }),
    );
    const { root } = editorFixture([{ command: 'cube' }]);
    expect(root.style.width).toBe('777px');
    expect(root.style.height).toBe('555px');
    expect(root.style.left).toBe('120px');
    expect(root.style.top).toBe('90px');
  });

  it('opens at its default size when nothing is remembered', () => {
    const { root } = editorFixture([{ command: 'cube' }]);
    expect(root.style.width).toBe('940px');
    expect(remembered()).toBeNull();
  });

  it('remembers the window after a resize and after a title-bar drag', () => {
    const { root } = editorFixture([{ command: 'cube' }]);
    layoutFake(root, { left: 40, top: 60, width: 800, height: 500 });
    const grip = root.querySelector('[aria-label="Resize panel"]');
    if (!grip) throw new Error('Expected the resize grip');
    pointerPressRelease(grip);
    expect(remembered()).toEqual({ left: 40, top: 60, width: 800, height: 500 });
    layoutFake(root, { left: 70, top: 80, width: 800, height: 500 });
    const bar = root.firstElementChild;
    if (!bar) throw new Error('Expected the title bar');
    pointerPressRelease(bar);
    expect(remembered()).toEqual({ left: 70, top: 80, width: 800, height: 500 });
  });
});
