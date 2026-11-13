import { describe, it, expect, beforeEach } from 'vitest';
import { FloatingPanelStack } from '@/ui/floating_panel/panel_floating_stack.js';
import { getMenuPanelZIndex, UiStackLayers } from '@/ui/stack/ui_stack_layers.js';

describe('UiStackLayers', () => {
  beforeEach(() => {
    FloatingPanelStack.resetForTests();
  });

  it('should keep floating panels below the menu band', () => {
    expect(UiStackLayers.floatingPanelBase).toBeLessThan(UiStackLayers.menu);
    expect(UiStackLayers.floatingPanelCeiling).toBeLessThan(UiStackLayers.menu);
    expect(UiStackLayers.menu).toBeLessThan(UiStackLayers.menuSubmenu);
    expect(UiStackLayers.menuSubmenu).toBeLessThan(UiStackLayers.contextMenu);
    expect(UiStackLayers.contextMenu).toBeLessThan(UiStackLayers.modal);
    expect(UiStackLayers.modal).toBeLessThan(UiStackLayers.confirm);
    expect(UiStackLayers.confirm).toBeLessThan(UiStackLayers.exclusiveShield);
    expect(UiStackLayers.exclusiveShield).toBeLessThan(UiStackLayers.aboveExclusiveShield);
  });

  it('should never let floating bring-to-front reach the menu layer', () => {
    const panel = document.createElement('div');
    for (let i = 0; i < 5000; i += 1) {
      FloatingPanelStack.bringToFront(panel);
    }
    expect(Number(panel.style.zIndex)).toBeLessThanOrEqual(UiStackLayers.floatingPanelCeiling);
    expect(Number(panel.style.zIndex)).toBeLessThan(UiStackLayers.menu);
  });

  it('should assign root and submenu menu z-indices above floating ceiling', () => {
    expect(getMenuPanelZIndex(false)).toBe(UiStackLayers.menu);
    expect(getMenuPanelZIndex(true)).toBe(UiStackLayers.menuSubmenu);
    expect(getMenuPanelZIndex(false)).toBeGreaterThan(UiStackLayers.floatingPanelCeiling);
  });
});
