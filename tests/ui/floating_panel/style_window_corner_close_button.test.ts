import { describe, it, expect } from 'vitest';
import {
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
    expect(button.style.position).toBe('absolute');
    expect(button.style.top).toBe('0px');
    expect(button.style.right).toBe('0px');
    expect(button.style.width).toBe(`${WINDOW_CLOSE_BUTTON_SIZE_PX}px`);
    expect(button.style.height).toBe(`${WINDOW_CLOSE_BUTTON_SIZE_PX}px`);
    expect(button.style.borderStyle).toBe('none');
    expect(button.style.background).toBe('transparent');
    expect(button.style.display).toBe('inline-flex');
    expect(button.style.alignItems).toBe('center');
    expect(button.style.justifyContent).toBe('center');
    expect((button.querySelector('svg') as SVGElement).style.transform).toBe('');
    button.click();
    expect(closed).toBe(1);
  });

  it('turns the background red instantly on hover', () => {
    const button = createWindowCornerCloseButton(document, () => {});
    button.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(button.style.background).toBe('rgb(196, 43, 28)');
    expect(button.style.transition).toBe('none');
  });

  it('fades the background back to transparent on leave', () => {
    const button = createWindowCornerCloseButton(document, () => {});
    button.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    button.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    expect(button.style.background).toBe('transparent');
    expect(button.style.transition).toContain('background-color');
  });

  it('styles an existing button in place', () => {
    const button = document.createElement('button');
    styleWindowCornerCloseButton(button);
    expect(button.style.position).toBe('absolute');
    expect(button.style.width).toBe(`${WINDOW_CLOSE_BUTTON_SIZE_PX}px`);
    expect(button.style.height).toBe(`${WINDOW_CLOSE_BUTTON_SIZE_PX}px`);
    expect(button.style.borderStyle).toBe('none');
  });
});
