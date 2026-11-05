import { describe, it, expect } from 'vitest';
import {
  WINDOW_CLOSE_BUTTON_CLASS,
  WINDOW_CLOSE_BUTTON_SIZE_PX,
  createWindowCornerCloseButton,
  styleWindowCornerCloseButton,
} from '@/ui/floating_panel/style_window_corner_close_button.js';

describe('style_window_corner_close_button', () => {
  it('creates a bare centered X flush in the top-right corner', () => {
    let closed = 0;
    const button = createWindowCornerCloseButton(document, () => {
      closed += 1;
    });
    expect(button.querySelector('svg[data-aiworlded-close-glyph="1"]')).not.toBeNull();
    expect(button.title).toBe('Close');
    expect(button.getAttribute('aria-label')).toBe('Close');
    expect(button.classList.contains(WINDOW_CLOSE_BUTTON_CLASS)).toBe(true);
    expect(button.style.position).toBe('absolute');
    expect(button.style.top).toBe('0px');
    expect(button.style.right).toBe('0px');
    expect(button.style.width).toBe(`${WINDOW_CLOSE_BUTTON_SIZE_PX}px`);
    expect(button.style.height).toBe(`${WINDOW_CLOSE_BUTTON_SIZE_PX}px`);
    expect(button.style.borderStyle).toBe('none');
    expect(button.style.background).toBe('');
    expect(button.style.backgroundColor).toBe('');
    expect(button.style.display).toBe('inline-flex');
    expect(button.style.alignItems).toBe('center');
    expect(button.style.justifyContent).toBe('center');
    expect((button.querySelector('svg') as SVGElement).style.transform).toBe('');
    expect(document.head.querySelector('style[data-aiworlded-close-style="1"]')).not.toBeNull();
    button.click();
    expect(closed).toBe(1);
  });

  it('uses CSS :hover for red and leaves no inline background that could block it', () => {
    const button = createWindowCornerCloseButton(document, () => {});
    expect(button.style.background).toBe('');
    expect(button.style.backgroundColor).toBe('');
    button.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    // JS must not paint hover; the stylesheet owns :hover background-color.
    expect(button.style.background).toBe('');
    expect(button.style.backgroundColor).toBe('');
    const sheet = document.head.querySelector('style[data-aiworlded-close-style="1"]')?.textContent ?? '';
    expect(sheet).toContain(`.${WINDOW_CLOSE_BUTTON_CLASS}:hover`);
    expect(sheet).toMatch(/background-color:\s*var\(--aiworlded-close-hover/i);
    expect(sheet).toMatch(/transition:\s*background-color/i);
  });

  it('styles an existing button in place', () => {
    const button = document.createElement('button');
    styleWindowCornerCloseButton(button);
    expect(button.style.position).toBe('absolute');
    expect(button.style.width).toBe(`${WINDOW_CLOSE_BUTTON_SIZE_PX}px`);
    expect(button.style.height).toBe(`${WINDOW_CLOSE_BUTTON_SIZE_PX}px`);
    expect(button.style.borderStyle).toBe('none');
    expect(button.style.background).toBe('');
  });
});
