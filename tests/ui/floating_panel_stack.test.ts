import { describe, it, expect, beforeEach } from 'vitest';
import { FloatingPanelStack } from '../../src/ui/floating_panel_stack.js';

describe('FloatingPanelStack', () => {
  beforeEach(() => {
    FloatingPanelStack.resetForTests();
  });

  it('should raise the second panel above the first when brought to front', () => {
    const first = document.createElement('div');
    const second = document.createElement('div');
    FloatingPanelStack.bringToFront(first);
    FloatingPanelStack.bringToFront(second);
    const firstZ = Number(first.style.zIndex);
    const secondZ = Number(second.style.zIndex);
    expect(secondZ).toBeGreaterThan(firstZ);
  });

  it('should raise a previously lower panel above peers after another bringToFront', () => {
    const tools = document.createElement('div');
    const texture = document.createElement('div');
    FloatingPanelStack.bringToFront(tools);
    FloatingPanelStack.bringToFront(texture);
    FloatingPanelStack.bringToFront(tools);
    expect(Number(tools.style.zIndex)).toBeGreaterThan(
      Number(texture.style.zIndex)
    );
  });

  it('should advance the shared top z-index on each bringToFront', () => {
    const panel = document.createElement('div');
    const before = FloatingPanelStack.getCurrentTopZIndex();
    FloatingPanelStack.bringToFront(panel);
    expect(FloatingPanelStack.getCurrentTopZIndex()).toBe(before + 1);
    expect(Number(panel.style.zIndex)).toBe(before + 1);
  });
});
