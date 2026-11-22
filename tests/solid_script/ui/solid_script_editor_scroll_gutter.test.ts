import { afterEach, describe, expect, it, vi } from 'vitest';
import { VIRTUAL_LIST_SCROLLBAR_BIND_GUTTER_PX } from '@/ui/virtual_list/virtual_list_scrollbar_bind.js';
import { solidScriptScrollerWrap } from '@/solid_script/ui/solid_script_editor_scroll.js';

/** Callbacks of the resize observers created during a test. */
const observers: Array<() => void> = [];

/**
 * Sets the scroll metrics jsdom does not lay out.
 *
 * @param element Scroller.
 * @param content Content height.
 * @param viewport Viewport height.
 */
function metricsSet(element: HTMLElement, content: number, viewport: number): void {
  Object.defineProperty(element, 'scrollHeight', { configurable: true, get: () => content });
  Object.defineProperty(element, 'clientHeight', { configurable: true, get: () => viewport });
}

afterEach(() => {
  vi.unstubAllGlobals();
  observers.length = 0;
  document.body.replaceChildren();
});

describe('solidScriptScrollerWrap', () => {
  it('reserves the scrollbar gutter once a window lays out a list that was built before it was shown', () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          observers.push(callback);
        }
        observe(): void {}
        disconnect(): void {}
      },
    );
    const list = document.createElement('div');
    list.append(document.createElement('input'));
    metricsSet(list, 0, 0);
    const host = solidScriptScrollerWrap(list, '0 1 auto', 0);
    expect(list.style.paddingRight).toBe('0px');
    document.body.append(host);
    metricsSet(list, 900, 400);
    observers.forEach((callback) => callback());
    expect(list.style.paddingRight).toBe(`${VIRTUAL_LIST_SCROLLBAR_BIND_GUTTER_PX + 4}px`);
    metricsSet(list, 300, 400);
    observers.forEach((callback) => callback());
    expect(list.style.paddingRight).toBe('0px');
  });
});
