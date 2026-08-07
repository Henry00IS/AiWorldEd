import { describe, expect, it } from 'vitest';
import {
  buildFloatingPanelTitleBar,
  styleFloatingPanelChromeButton,
} from '@/ui/floating_panel/panel_floating_title_bar.js';
import { PanelFloating } from '@/ui/floating_panel/panel_floating.js';
import { FloatingPanelStack } from '@/ui/floating_panel/panel_floating_stack.js';
import { applyFloatingPanelToolChrome } from '@/ui/floating_panel/panel_floating_tool_chrome.js';

/** Concrete floating panel used to exercise the shared title-bar helper. */
class TitleBarTestPanel extends PanelFloating {
  /**
   * Creates a panel that builds a standard title bar on construct.
   *
   * @param host Host element.
   */
  constructor(host: HTMLElement) {
    super(host, { corner: 'top-left', paddingPx: 8 });
    const parts = this.createStandardTitleBar({ titleText: 'Shared Title' });
    this.root.appendChild(parts.bar);
  }
}

describe('panel_floating_title_bar', () => {
  it('builds a title bar with close control that invokes onClose', () => {
    let closed = 0;
    const parts = buildFloatingPanelTitleBar({
      titleText: 'Tools',
      onClose: () => {
        closed += 1;
      },
    });
    expect(parts.title.textContent).toBe('Tools');
    expect(parts.closeButton.textContent).toBe('×');
    expect(parts.closeButton.title).toBe('Close');
    parts.closeButton.click();
    expect(closed).toBe(1);
  });

  it('applies shared chrome button styles', () => {
    const button = document.createElement('button');
    styleFloatingPanelChromeButton(button);
    expect(button.style.cursor).toBe('pointer');
    expect(button.style.fontSize).toBe('11px');
    expect(button.style.borderRadius).toBe('3px');
  });

  it('createStandardTitleBar hides the panel when close is clicked', () => {
    FloatingPanelStack.resetForTests();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const panel = new TitleBarTestPanel(host);
    panel.show();
    expect(panel.isOpen()).toBe(true);
    const close = panel.getRootElement().querySelector('button') as HTMLButtonElement;
    close.click();
    expect(panel.isOpen()).toBe(false);
    panel.dispose();
    host.remove();
    FloatingPanelStack.resetForTests();
  });
});

describe('panel_floating_tool_chrome', () => {
  it('applies shared tool-window background and border chrome', () => {
    const root = document.createElement('div');
    applyFloatingPanelToolChrome(root, { width: '200px', borderBox: true });
    expect(root.style.width).toBe('200px');
    expect(root.style.boxSizing).toBe('border-box');
    expect(root.style.borderRadius).toBe('6px');
    expect(root.style.fontFamily.length).toBeGreaterThan(0);
  });
});
