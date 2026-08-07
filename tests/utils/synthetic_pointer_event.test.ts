import { describe, expect, it } from 'vitest';
import { createSyntheticPointerDown, createSyntheticPointerMove } from '@/utils/synthetic_pointer_event.js';
import { resolveViewportOwnerWindow } from '@/utils/viewport_owner_window.js';

describe('synthetic_pointer_event', () => {
  it('builds pointerdown with modifiers and button state', () => {
    const event = createSyntheticPointerDown(12, 34, {
      shiftKey: true,
      ctrlKey: false,
      altKey: true,
      metaKey: false,
    });
    expect(event.type).toBe('pointerdown');
    expect(event.clientX).toBe(12);
    expect(event.clientY).toBe(34);
    expect(event.button).toBe(0);
    expect(event.buttons).toBe(1);
    expect(event.shiftKey).toBe(true);
    expect(event.altKey).toBe(true);
  });

  it('builds pointermove with no buttons held by default', () => {
    const event = createSyntheticPointerMove(1, 2);
    expect(event.type).toBe('pointermove');
    expect(event.button).toBe(-1);
    expect(event.buttons).toBe(0);
    expect(event.shiftKey).toBe(false);
  });
});

describe('resolveViewportOwnerWindow', () => {
  it('returns the content element owner window when present', () => {
    const content = document.createElement('div');
    document.body.appendChild(content);
    const viewport = {
      getContentElement: () => content,
    };
    expect(resolveViewportOwnerWindow(viewport)).toBe(window);
    content.remove();
  });

  it('falls back to the main window when content is missing', () => {
    expect(resolveViewportOwnerWindow(null)).toBe(window);
    expect(resolveViewportOwnerWindow({})).toBe(window);
  });
});
