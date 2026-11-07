import { describe, expect, it } from 'vitest';
import { PanelPropertiesScroll } from '@/ui/properties/panel_properties_scroll.js';
import { VIRTUAL_LIST_SCROLLBAR_BIND_SCROLLER_CLASS } from '@/ui/virtual_list/virtual_list_scrollbar_bind.js';

/**
 * Gives a scroller fixed viewport and content heights.
 *
 * @param scroller Scroller element.
 * @param metrics Mutable heights.
 * @param metrics.content Content height.
 * @param metrics.viewport Viewport height.
 */
function fakeMetrics(scroller: HTMLElement, metrics: { content: number; viewport: number }): void {
  Object.defineProperty(scroller, 'scrollHeight', { get: () => metrics.content });
  Object.defineProperty(scroller, 'clientHeight', { get: () => metrics.viewport });
  let top = 0;
  Object.defineProperty(scroller, 'scrollTop', {
    get: () => top,
    set: (value: number) => {
      top = Math.max(0, Math.min(value, metrics.content - metrics.viewport));
      scroller.dispatchEvent(new Event('scroll'));
    },
  });
}

describe('properties panel scroll', () => {
  it('uses the outliner scrollbar and reserves its gutter only while overflowing', () => {
    const container = document.createElement('div');
    const scroll = new PanelPropertiesScroll(container);
    const metrics = { content: 300, viewport: 400 };
    fakeMetrics(scroll.getScroller(), metrics);
    scroll.layout();
    expect(scroll.getScroller().classList.contains(VIRTUAL_LIST_SCROLLBAR_BIND_SCROLLER_CLASS)).toBe(true);
    expect(scroll.getScroller().style.paddingRight).toBe('0px');
    const bar = container.lastElementChild as HTMLElement;
    expect(bar.style.display).toBe('none');
    metrics.content = 1200;
    scroll.layout();
    expect(scroll.getScroller().style.paddingRight).toBe('12px');
    expect(bar.style.display).toBe('flex');
    expect(bar.style.width).toBe('12px');
  });

  it('keeps the scroll offset when a repaint briefly shortens the content', () => {
    const container = document.createElement('div');
    const scroll = new PanelPropertiesScroll(container);
    const metrics = { content: 1200, viewport: 400 };
    const scroller = scroll.getScroller();
    fakeMetrics(scroller, metrics);
    scroller.scrollTop = 500;
    metrics.content = 600;
    scroller.scrollTop = 500;
    expect(scroller.scrollTop).toBe(200);
    metrics.content = 1200;
    scroll.layout();
    expect(scroller.scrollTop).toBe(500);
  });
});
