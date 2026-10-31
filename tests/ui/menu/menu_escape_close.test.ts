import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MenuEscapeClose } from '@/ui/menu/menu_escape_close.js';
import { PanelMenu } from '@/ui/menu/panel_menu.js';
import { PanelMenuDropdown } from '@/ui/menu/panel_menu_dropdown.js';
import { FloatingPanelStack } from '@/ui/floating_panel/panel_floating_stack.js';

/** Minimal dropdown subclass that exposes the shared open/close lifecycle. */
class EscapeTestMenuDropdown extends PanelMenuDropdown {
  /**
   * Creates the dropdown under a host element.
   *
   * @param parentElement Host element.
   */
  constructor(parentElement: HTMLElement) {
    super(parentElement);
    this.styleTriggerButton();
    this.wrapper.appendChild(this.button);
    parentElement.appendChild(this.wrapper);
  }

  /** Marks the trigger for lookup. */
  protected styleTriggerButton(): void {
    this.button.textContent = 'Align';
  }

  /** Builds a single action menu owned by the host document. */
  protected rebuildMenuPanel(): void {
    this.menuPanel?.dispose();
    this.menuPanel = new PanelMenu(
      [{ kind: 'action', label: 'Center', onClick: () => this.closeMenu() }],
      () => this.closeMenu(),
      false,
      this.ownerDocument,
    );
    this.wrapper.appendChild(this.menuPanel.getElement());
  }

  /** Opens the menu as if the trigger was clicked. */
  openForTest(): void {
    this.openMenu();
  }

  /**
   * Returns the trigger button.
   *
   * @returns Trigger button element.
   */
  getTriggerButton(): HTMLButtonElement {
    return this.button;
  }
}

/**
 * Builds a cancelable Escape keydown event that bubbles like a real key press.
 *
 * @param view Window whose KeyboardEvent constructor is used.
 * @returns Escape keydown event.
 */
function createEscapeKeydown(view: Window & typeof globalThis = window): KeyboardEvent {
  return new view.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true });
}

/**
 * Builds a root menu with one action and a close callback that closes it.
 *
 * @param ownerDocument Document that owns the menu DOM.
 * @param closeRequests Array receiving one entry per close request.
 * @returns Root menu panel.
 */
function createRootMenu(ownerDocument: Document, closeRequests: string[]): PanelMenu {
  const panel: PanelMenu = new PanelMenu(
    [
      { kind: 'action', label: 'First', onClick: () => undefined },
      { kind: 'submenu', label: 'More', children: [{ kind: 'action', label: 'Nested', onClick: () => undefined }] },
    ],
    () => {
      closeRequests.push('close');
      panel.close();
    },
    false,
    ownerDocument,
  );
  return panel;
}

/**
 * Counts Escape presses that reach bubble-phase listeners on a window, the same
 * phase editor shortcuts and tools listen in.
 *
 * @param targetWindow Window to observe.
 * @returns Counter object and a detach function.
 */
function observeBubbleEscape(targetWindow: Window): { count: () => number; detach: () => void } {
  let escapeCount = 0;
  const listener = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') escapeCount += 1;
  };
  targetWindow.addEventListener('keydown', listener);
  return { count: () => escapeCount, detach: () => targetWindow.removeEventListener('keydown', listener) };
}

describe('Escape closes open menus', () => {
  let host: HTMLElement;
  let bubbleEscape: { count: () => number; detach: () => void };

  beforeEach(() => {
    FloatingPanelStack.resetForTests();
    host = document.createElement('div');
    document.body.appendChild(host);
    bubbleEscape = observeBubbleEscape(window);
  });

  afterEach(() => {
    bubbleEscape.detach();
    document.body.replaceChildren();
    FloatingPanelStack.resetForTests();
  });

  it('closes an anchored root menu and consumes the Escape press', () => {
    const closeRequests: string[] = [];
    const panel = createRootMenu(document, closeRequests);
    host.appendChild(panel.getElement());
    panel.open(host);
    const event = createEscapeKeydown();
    host.dispatchEvent(event);
    expect(panel.isOpen()).toBe(false);
    expect(closeRequests).toEqual(['close']);
    expect(event.defaultPrevented).toBe(true);
    expect(bubbleEscape.count()).toBe(0);
    panel.dispose();
  });

  it('lets Escape reach editor listeners again once the menu is closed', () => {
    const closeRequests: string[] = [];
    const panel = createRootMenu(document, closeRequests);
    host.appendChild(panel.getElement());
    panel.open(host);
    host.dispatchEvent(createEscapeKeydown());
    const secondPress = createEscapeKeydown();
    host.dispatchEvent(secondPress);
    expect(closeRequests).toEqual(['close']);
    expect(secondPress.defaultPrevented).toBe(false);
    expect(bubbleEscape.count()).toBe(1);
    panel.dispose();
  });

  it('never intercepts Escape while no menu has been opened', () => {
    const closeRequests: string[] = [];
    const panel = createRootMenu(document, closeRequests);
    host.appendChild(panel.getElement());
    host.dispatchEvent(createEscapeKeydown());
    expect(closeRequests).toEqual([]);
    expect(bubbleEscape.count()).toBe(1);
    panel.dispose();
  });

  it('closes a floating root menu opened at a point', () => {
    const closeRequests: string[] = [];
    const panel = createRootMenu(document, closeRequests);
    panel.openAt(30, 40, document);
    document.body.dispatchEvent(createEscapeKeydown());
    expect(panel.isOpen()).toBe(false);
    expect(document.body.contains(panel.getElement())).toBe(false);
    expect(bubbleEscape.count()).toBe(0);
  });

  it('lets Escape through once an open menu element is discarded without closing', () => {
    const closeRequests: string[] = [];
    const panel = createRootMenu(document, closeRequests);
    host.appendChild(panel.getElement());
    panel.open(host);
    panel.getElement().remove();
    const event = createEscapeKeydown();
    host.dispatchEvent(event);
    expect(closeRequests).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
    expect(bubbleEscape.count()).toBe(1);
  });

  it('ignores keys other than Escape while a menu is open', () => {
    const closeRequests: string[] = [];
    const panel = createRootMenu(document, closeRequests);
    host.appendChild(panel.getElement());
    panel.open(host);
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', bubbles: true }));
    expect(panel.isOpen()).toBe(true);
    expect(closeRequests).toEqual([]);
    panel.dispose();
  });

  it('closes a dropdown and resets its trigger expanded state', () => {
    const dropdown = new EscapeTestMenuDropdown(host);
    dropdown.openForTest();
    expect(dropdown.getMenuPanel()?.isOpen()).toBe(true);
    expect(dropdown.getTriggerButton().getAttribute('aria-expanded')).toBe('true');
    dropdown.getTriggerButton().dispatchEvent(createEscapeKeydown());
    expect(dropdown.getMenuPanel()?.isOpen()).toBe(false);
    expect(dropdown.getTriggerButton().getAttribute('aria-expanded')).toBe('false');
    expect(bubbleEscape.count()).toBe(0);
    dropdown.dispose();
  });

  it('closes a menu hosted in another window without touching the main window', () => {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const frameWindow = frame.contentWindow as (Window & typeof globalThis) | null;
    if (!frameWindow) throw new Error('missing frame window');
    const frameHost = frameWindow.document.createElement('div');
    frameWindow.document.body.appendChild(frameHost);
    const frameBubbleEscape = observeBubbleEscape(frameWindow);
    const dropdown = new EscapeTestMenuDropdown(frameHost);
    dropdown.openForTest();
    frameHost.dispatchEvent(createEscapeKeydown(frameWindow));
    expect(dropdown.getMenuPanel()?.isOpen()).toBe(false);
    expect(frameBubbleEscape.count()).toBe(0);
    frameHost.dispatchEvent(createEscapeKeydown(frameWindow));
    expect(frameBubbleEscape.count()).toBe(1);
    expect(bubbleEscape.count()).toBe(0);
    frameBubbleEscape.detach();
    dropdown.dispose();
  });
});

describe('MenuEscapeClose', () => {
  it('stops listening after end', () => {
    let escapeCount = 0;
    const closer = new MenuEscapeClose();
    closer.begin(window, () => {
      escapeCount += 1;
      return true;
    });
    expect(closer.isActive()).toBe(true);
    document.body.dispatchEvent(createEscapeKeydown());
    closer.end();
    document.body.dispatchEvent(createEscapeKeydown());
    expect(escapeCount).toBe(1);
    expect(closer.isActive()).toBe(false);
  });

  it('consumes Escape only when the callback handled it', () => {
    const closer = new MenuEscapeClose();
    closer.begin(window, () => false);
    const event = createEscapeKeydown();
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    closer.end();
  });

  it('recognizes Escape by key or by code', () => {
    expect(MenuEscapeClose.isEscapeKeyEvent(new KeyboardEvent('keydown', { key: 'Escape' }))).toBe(true);
    expect(MenuEscapeClose.isEscapeKeyEvent(new KeyboardEvent('keydown', { code: 'Escape' }))).toBe(true);
    expect(MenuEscapeClose.isEscapeKeyEvent(new KeyboardEvent('keydown', { key: 'Enter' }))).toBe(false);
  });
});
