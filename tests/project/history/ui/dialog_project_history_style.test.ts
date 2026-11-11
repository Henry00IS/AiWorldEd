import { afterEach, describe, expect, it, vi } from 'vitest';
import { VIRTUAL_LIST_SCROLLBAR_BIND_GUTTER_PX } from '@/ui/virtual_list/virtual_list_scrollbar_bind.js';
import { dialogProjectHistoryPane } from '@/project/history/ui/dialog_project_history_style.js';

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

describe('dialogProjectHistoryPane', () => {
  it('reserves the scrollbar gutter again when its content grows after the last sync', () => {
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
    const pane = dialogProjectHistoryPane('0');
    document.body.append(pane.host);
    metricsSet(pane.scroller, 200, 300);
    pane.sync();
    expect(pane.scroller.style.paddingRight).toBe('0px');
    metricsSet(pane.scroller, 500, 300);
    observers.forEach((callback) => callback());
    expect(pane.scroller.style.paddingRight).toBe(`${VIRTUAL_LIST_SCROLLBAR_BIND_GUTTER_PX + 4}px`);
    pane.dispose();
  });
});
