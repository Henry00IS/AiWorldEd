import { describe, expect, it } from 'vitest';
import {
  buildFloatingPanelTitleBar,
  floatingPanelTitleBarButtonAdd,
  styleFloatingPanelChromeButton,
} from '@/ui/floating_panel/panel_floating_title_bar.js';
import {
  WINDOW_CLOSE_BUTTON_SIZE_PX,
  WINDOW_TITLE_BAR_HEIGHT_PX,
} from '@/ui/floating_panel/style_window_corner_close_button.js';
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
    expect(parts.closeButton.querySelector('svg')).not.toBeNull();
    expect(parts.closeButton.title).toBe('Close');
    expect(parts.closeButton.style.position).toBe('absolute');
    expect(parts.closeButton.style.right).toBe('0px');
    expect(parts.closeButton.style.top).toBe('0px');
    expect(parts.closeButton.style.width).toBe(`${WINDOW_CLOSE_BUTTON_SIZE_PX}px`);
    expect(parts.closeButton.style.height).toBe(`${WINDOW_CLOSE_BUTTON_SIZE_PX}px`);
    expect(parts.bar.style.height).toBe(`${WINDOW_TITLE_BAR_HEIGHT_PX}px`);
    expect(parts.bar.style.overflow).toBe('hidden');
    expect(parts.bar.style.paddingRight).toBe(`${WINDOW_CLOSE_BUTTON_SIZE_PX}px`);
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

  it('lays out extra title-bar buttons in the flow left of the close X, never on top of it', () => {
    const parts = buildFloatingPanelTitleBar({ titleText: 'Title', onClose: () => {} });
    let pressed = 0;
    const browse = floatingPanelTitleBarButtonAdd(parts, 'V', 'Browse Values', () => void pressed++);
    const manual = floatingPanelTitleBarButtonAdd(parts, '?', 'Manual', () => {});
    const controls = [...parts.bar.children];
    expect(controls).toEqual([parts.title, browse, manual, parts.closeButton]);
    // Only the X sits in the corner; the bar keeps its width free for it.
    expect(controls.filter((element) => (element as HTMLElement).style.position === 'absolute')).toEqual([
      parts.closeButton,
    ]);
    expect(parseFloat(parts.bar.style.paddingRight)).toBeGreaterThan(WINDOW_CLOSE_BUTTON_SIZE_PX);
    expect(browse.classList.contains('aiworlded-window-close')).toBe(false);
    expect(browse.getAttribute('aria-label')).toBe('Browse Values');
    expect(browse.title).toBe('Browse Values');
    expect(browse.style.flexShrink).toBe('0');
    browse.click();
    expect(pressed).toBe(1);
  });

  it('shows the move cursor on the title bar only when the window can be dragged', () => {
    class FixedPanel extends PanelFloating {
      bar: HTMLElement;
      constructor(host: HTMLElement, draggable: boolean) {
        super(host, { corner: 'top-left', draggable });
        this.bar = this.createStandardTitleBar({ titleText: 'Fixed' }).bar;
      }
    }
    expect(new FixedPanel(document.body, true).bar.style.cursor).toBe('move');
    expect(new FixedPanel(document.body, false).bar.style.cursor).toBe('');
  });
});
