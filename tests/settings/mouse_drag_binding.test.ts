import { describe, expect, it } from 'vitest';
import {
  formatMouseDragBinding,
  isMouseDragBinding,
  matchesMouseDragBinding,
} from '../../src/settings/mouse_drag_binding.js';

describe('mouse drag bindings', () => {
  it('matches the configured modifier and mouse button exactly', () => {
    const matching = new MouseEvent('pointerdown', { button: 0, altKey: true });
    const extraModifier = new MouseEvent('pointerdown', { button: 0, altKey: true, shiftKey: true });

    expect(matchesMouseDragBinding(matching, 'alt+left')).toBe(true);
    expect(matchesMouseDragBinding(extraModifier, 'alt+left')).toBe(false);
    expect(matchesMouseDragBinding(matching, 'shift+left')).toBe(false);
  });

  it('validates persisted values and formats settings labels', () => {
    expect(isMouseDragBinding('control+right')).toBe(true);
    expect(isMouseDragBinding('control-alt+left')).toBe(true);
    expect(isMouseDragBinding('hyper+side')).toBe(false);
    expect(formatMouseDragBinding('alt+left')).toBe('Alt + Left mouse');
    expect(formatMouseDragBinding('control-alt+left')).toBe('Ctrl + Alt + Left mouse');
    expect(formatMouseDragBinding('none+middle')).toBe('Middle mouse');
  });

  it('requires both Ctrl and Alt for a combined binding', () => {
    const combined = new MouseEvent('pointerdown', { button: 0, ctrlKey: true, altKey: true });
    const altOnly = new MouseEvent('pointerdown', { button: 0, altKey: true });

    expect(matchesMouseDragBinding(combined, 'control-alt+left')).toBe(true);
    expect(matchesMouseDragBinding(altOnly, 'control-alt+left')).toBe(false);
  });
});
