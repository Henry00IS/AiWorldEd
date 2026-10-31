import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MenuKeyboardCapture } from '@/ui/menu/menu_keyboard_capture.js';
import { PanelMenu } from '@/ui/menu/panel_menu.js';
import { PanelMenuDropdown } from '@/ui/menu/panel_menu_dropdown.js';
import { FloatingPanelStack } from '@/ui/floating_panel/panel_floating_stack.js';

/** Minimal dropdown subclass that exposes the shared open/close lifecycle. */
class CaptureTestMenuDropdown extends PanelMenuDropdown {
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

/** Key press description used to build test events. */
interface TestKey {
  key: string;
  code: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
}

/** Escape key press. */
const ESCAPE: TestKey = { key: 'Escape', code: 'Escape' };

/**
 * Builds a cancelable keyboard event that bubbles like a real key press.
 *
 * @param key Key description.
 * @param type Event type.
 * @param view Window whose KeyboardEvent constructor is used.
 * @returns Keyboard event.
 */
function createKey(key: TestKey, type = 'keydown', view: Window & typeof globalThis = window): KeyboardEvent {
  return new view.KeyboardEvent(type, { ...key, bubbles: true, cancelable: true });
}

/** Activation log and the root menu built by {@link createRootMenu}. */
interface TestMenu {
  panel: PanelMenu;
  log: string[];
}

/**
 * Builds a root menu with two actions, a disabled action, and a submenu. Its
 * close callback closes the menu; actions and closes are logged in order.
 *
 * @param ownerDocument Document that owns the menu DOM.
 * @returns Root menu panel and its log.
 */
function createRootMenu(ownerDocument: Document): TestMenu {
  const log: string[] = [];
  const panel: PanelMenu = new PanelMenu(
    [
      { kind: 'action', label: 'First', onClick: () => log.push('first') },
      { kind: 'action', label: 'Off', onClick: () => log.push('off'), isEnabled: () => false },
      {
        kind: 'submenu',
        label: 'More',
        children: [{ kind: 'action', label: 'Nested', onClick: () => log.push('nested') }],
      },
      { kind: 'action', label: 'Last', onClick: () => log.push('last') },
    ],
    () => {
      log.push('close');
      panel.close();
    },
    false,
    ownerDocument,
  );
  return { panel, log };
}

/**
 * Records every key that reaches bubble-phase listeners on a window, the same
 * phase editor shortcuts, tools, and held-key tracking listen in.
 *
 * @param targetWindow Window to observe.
 * @returns Seen "type:code" entries and a detach function.
 */
function observeBubbleKeys(targetWindow: Window): { seen: string[]; detach: () => void } {
  const seen: string[] = [];
  const listener = (event: KeyboardEvent): void => {
    seen.push(`${event.type}:${event.code}`);
  };
  targetWindow.addEventListener('keydown', listener);
  targetWindow.addEventListener('keyup', listener);
  const detach = (): void => {
    targetWindow.removeEventListener('keydown', listener);
    targetWindow.removeEventListener('keyup', listener);
  };
  return { seen, detach };
}

/**
 * Returns the label of the highlighted row in a panel, read from the hover
 * background the menu applies to its active row.
 *
 * @param panelElement Menu panel element.
 * @returns Active row label, or null when none is highlighted.
 */
function readActiveLabel(panelElement: HTMLElement): string | null {
  const rows = Array.from(panelElement.querySelectorAll<HTMLButtonElement>(':scope > button, :scope > div > button'));
  const active = rows.find((row) => row.style.background !== '' && row.style.background !== 'transparent');
  return active?.querySelector('.editor-toolbar-dropdown-label')?.textContent ?? null;
}

describe('open menus capture the keyboard', () => {
  let host: HTMLElement;
  let bubble: { seen: string[]; detach: () => void };

  beforeEach(() => {
    FloatingPanelStack.resetForTests();
    host = document.createElement('div');
    document.body.appendChild(host);
    bubble = observeBubbleKeys(window);
  });

  afterEach(() => {
    bubble.detach();
    document.body.replaceChildren();
    FloatingPanelStack.resetForTests();
  });

  /**
   * Mounts and opens a fresh root menu under the host.
   *
   * @returns Opened test menu.
   */
  function openMenu(): TestMenu {
    const menu = createRootMenu(document);
    host.appendChild(menu.panel.getElement());
    menu.panel.open(host);
    return menu;
  }

  it('closes an anchored root menu and consumes the Escape press', () => {
    const { panel, log } = openMenu();
    const event = createKey(ESCAPE);
    host.dispatchEvent(event);
    expect(panel.isOpen()).toBe(false);
    expect(log).toEqual(['close']);
    expect(event.defaultPrevented).toBe(true);
    expect(bubble.seen).toEqual([]);
    panel.dispose();
  });

  it('swallows editor shortcuts while open without closing the menu', () => {
    const { panel, log } = openMenu();
    const keys: TestKey[] = [
      { key: 'g', code: 'KeyG' },
      { key: 'r', code: 'KeyR' },
      { key: 'Delete', code: 'Delete' },
      { key: 'z', code: 'KeyZ', ctrlKey: true },
      { key: 's', code: 'KeyS', ctrlKey: true },
      { key: 'Tab', code: 'Tab' },
      { key: 'Tab', code: 'Tab', shiftKey: true },
      { key: '1', code: 'Digit1' },
      { key: ' ', code: 'Space' },
    ];
    const events = keys.map((key) => createKey(key));
    events.forEach((event) => host.dispatchEvent(event));
    expect(bubble.seen).toEqual([]);
    expect(events.every((event) => event.defaultPrevented)).toBe(true);
    expect(panel.isOpen()).toBe(true);
    expect(log).toEqual([]);
    panel.dispose();
  });

  it('keeps browser shortcuts working but hidden from the editor', () => {
    const { panel } = openMenu();
    const keys: TestKey[] = [
      { key: 'F5', code: 'F5' },
      { key: 'F12', code: 'F12' },
      { key: 'r', code: 'KeyR', ctrlKey: true },
      { key: 'I', code: 'KeyI', ctrlKey: true, shiftKey: true },
      { key: '=', code: 'Equal', ctrlKey: true },
    ];
    const events = keys.map((key) => createKey(key));
    events.forEach((event) => host.dispatchEvent(event));
    expect(bubble.seen).toEqual([]);
    expect(events.some((event) => event.defaultPrevented)).toBe(false);
    expect(panel.isOpen()).toBe(true);
    panel.dispose();
  });

  it('never stops keyup so held-key tracking cannot get stuck', () => {
    const { panel } = openMenu();
    host.dispatchEvent(createKey({ key: 'w', code: 'KeyW' }, 'keyup'));
    host.dispatchEvent(createKey({ key: 'Shift', code: 'ShiftLeft' }, 'keyup'));
    expect(bubble.seen).toEqual(['keyup:KeyW', 'keyup:ShiftLeft']);
    panel.dispose();
  });

  it('cancels Space keyup so a focused trigger cannot toggle the menu', () => {
    const { panel } = openMenu();
    const event = createKey({ key: ' ', code: 'Space' }, 'keyup');
    host.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(bubble.seen).toEqual(['keyup:Space']);
    panel.dispose();
  });

  it('lets keys reach editor listeners again once the menu is closed', () => {
    const { panel, log } = openMenu();
    host.dispatchEvent(createKey(ESCAPE));
    const g = createKey({ key: 'g', code: 'KeyG' });
    host.dispatchEvent(g);
    host.dispatchEvent(createKey(ESCAPE));
    expect(log).toEqual(['close']);
    expect(g.defaultPrevented).toBe(false);
    expect(bubble.seen).toEqual(['keydown:KeyG', 'keydown:Escape']);
    panel.dispose();
  });

  it('never intercepts keys while no menu has been opened', () => {
    const { panel, log } = createRootMenu(document);
    host.appendChild(panel.getElement());
    host.dispatchEvent(createKey(ESCAPE));
    host.dispatchEvent(createKey({ key: 'g', code: 'KeyG' }));
    expect(log).toEqual([]);
    expect(bubble.seen).toEqual(['keydown:Escape', 'keydown:KeyG']);
    panel.dispose();
  });

  it('captures for a floating root menu opened at a point', () => {
    const { panel } = createRootMenu(document);
    panel.openAt(30, 40, document);
    document.body.dispatchEvent(createKey({ key: 'g', code: 'KeyG' }));
    expect(panel.isOpen()).toBe(true);
    document.body.dispatchEvent(createKey(ESCAPE));
    expect(panel.isOpen()).toBe(false);
    expect(document.body.contains(panel.getElement())).toBe(false);
    expect(bubble.seen).toEqual([]);
  });

  it('releases the keyboard once an open menu element is discarded without closing', () => {
    const { panel, log } = openMenu();
    panel.getElement().remove();
    const escape = createKey(ESCAPE);
    host.dispatchEvent(escape);
    host.dispatchEvent(createKey({ key: 'g', code: 'KeyG' }));
    expect(log).toEqual([]);
    expect(escape.defaultPrevented).toBe(false);
    expect(bubble.seen).toEqual(['keydown:Escape', 'keydown:KeyG']);
  });

  it('lets an editable field inside the menu receive keys', () => {
    const { panel } = openMenu();
    const input = document.createElement('input');
    panel.getElement().appendChild(input);
    const event = createKey({ key: 'g', code: 'KeyG' });
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(bubble.seen).toEqual(['keydown:KeyG']);
    panel.dispose();
  });

  it('swallows typing aimed at an editable field outside the menu', () => {
    const { panel } = openMenu();
    const input = document.createElement('input');
    host.appendChild(input);
    input.dispatchEvent(createKey({ key: 'g', code: 'KeyG' }));
    expect(bubble.seen).toEqual([]);
    panel.dispose();
  });

  it('closes when its window loses focus', () => {
    const { panel, log } = openMenu();
    window.dispatchEvent(new Event('blur'));
    expect(panel.isOpen()).toBe(false);
    expect(log).toEqual(['close']);
    panel.dispose();
  });

  it('closes a dropdown and resets its trigger expanded state', () => {
    const dropdown = new CaptureTestMenuDropdown(host);
    dropdown.openForTest();
    expect(dropdown.getMenuPanel()?.isOpen()).toBe(true);
    expect(dropdown.getTriggerButton().getAttribute('aria-expanded')).toBe('true');
    dropdown.getTriggerButton().dispatchEvent(createKey(ESCAPE));
    expect(dropdown.getMenuPanel()?.isOpen()).toBe(false);
    expect(dropdown.getTriggerButton().getAttribute('aria-expanded')).toBe('false');
    expect(bubble.seen).toEqual([]);
    dropdown.dispose();
  });

  it('captures a menu hosted in another window without touching the main window', () => {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const frameWindow = frame.contentWindow as (Window & typeof globalThis) | null;
    if (!frameWindow) throw new Error('missing frame window');
    const frameHost = frameWindow.document.createElement('div');
    frameWindow.document.body.appendChild(frameHost);
    const frameBubble = observeBubbleKeys(frameWindow);
    const dropdown = new CaptureTestMenuDropdown(frameHost);
    dropdown.openForTest();
    host.dispatchEvent(createKey({ key: 'g', code: 'KeyG' }));
    frameHost.dispatchEvent(createKey({ key: 'g', code: 'KeyG' }, 'keydown', frameWindow));
    expect(dropdown.getMenuPanel()?.isOpen()).toBe(true);
    frameHost.dispatchEvent(createKey(ESCAPE, 'keydown', frameWindow));
    expect(dropdown.getMenuPanel()?.isOpen()).toBe(false);
    expect(frameBubble.seen).toEqual([]);
    frameHost.dispatchEvent(createKey(ESCAPE, 'keydown', frameWindow));
    expect(frameBubble.seen).toEqual(['keydown:Escape']);
    expect(bubble.seen).toEqual(['keydown:KeyG']);
    frameBubble.detach();
    dropdown.dispose();
  });
});

describe('open menus navigate with the keyboard', () => {
  let menu: TestMenu;

  beforeEach(() => {
    FloatingPanelStack.resetForTests();
    menu = createRootMenu(document);
    menu.panel.openAt(10, 10, document);
  });

  afterEach(() => {
    menu.panel.dispose();
    document.body.replaceChildren();
    FloatingPanelStack.resetForTests();
  });

  /**
   * Presses keys in order on the document body.
   *
   * @param keys Key values to press (key and code are the same).
   */
  function press(...keys: string[]): void {
    keys.forEach((key) => document.body.dispatchEvent(createKey({ key, code: key })));
  }

  /**
   * Returns the open submenu panel element, if any.
   *
   * @returns Visible flyout element or null.
   */
  function openFlyout(): HTMLElement | null {
    const flyout = menu.panel.getElement().querySelector<HTMLElement>('.editor-toolbar-dropdown-submenu');
    return flyout && flyout.style.display !== 'none' ? flyout : null;
  }

  it('moves down and up over enabled rows, wrapping and skipping disabled rows', () => {
    const root = menu.panel.getElement();
    press('ArrowDown');
    expect(readActiveLabel(root)).toBe('First');
    press('ArrowDown');
    expect(readActiveLabel(root)).toBe('More');
    press('ArrowDown', 'ArrowDown');
    expect(readActiveLabel(root)).toBe('First');
    press('ArrowUp');
    expect(readActiveLabel(root)).toBe('Last');
    press('Home');
    expect(readActiveLabel(root)).toBe('First');
    press('End');
    expect(readActiveLabel(root)).toBe('Last');
  });

  it('activates the highlighted action with Enter and closes the menu', () => {
    press('End', 'Enter');
    expect(menu.log).toEqual(['last', 'close']);
    expect(menu.panel.isOpen()).toBe(false);
  });

  it('does nothing on Enter when no row is highlighted', () => {
    press('Enter');
    expect(menu.log).toEqual([]);
    expect(menu.panel.isOpen()).toBe(true);
  });

  it('opens a flyout with ArrowRight, navigates it, and leaves it with ArrowLeft', () => {
    press('ArrowDown', 'ArrowDown', 'ArrowRight');
    const flyout = openFlyout();
    expect(flyout).not.toBeNull();
    expect(flyout ? readActiveLabel(flyout) : null).toBe('Nested');
    press('ArrowLeft');
    expect(openFlyout()).toBeNull();
    expect(readActiveLabel(menu.panel.getElement())).toBe('More');
    expect(menu.panel.isOpen()).toBe(true);
  });

  it('runs a flyout action with Enter', () => {
    press('ArrowDown', 'ArrowDown', 'Enter', 'Enter');
    expect(menu.log).toEqual(['nested', 'close']);
  });
});

describe('MenuKeyboardCapture', () => {
  /**
   * Builds a capture owner around a connected element that logs calls.
   *
   * @param log Receives "close" and "nav:<key>" entries.
   * @returns Owner for {@link MenuKeyboardCapture.begin}.
   */
  function createOwner(log: string[]): {
    getElement: () => HTMLElement;
    requestClose: () => void;
    navigate: (event: KeyboardEvent) => void;
  } {
    const element = document.createElement('div');
    document.body.appendChild(element);
    return {
      getElement: () => element,
      requestClose: () => log.push('close'),
      navigate: (event) => log.push(`nav:${event.key}`),
    };
  }

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('stops listening after end', () => {
    const log: string[] = [];
    const capture = new MenuKeyboardCapture();
    capture.begin(window, createOwner(log));
    expect(capture.isActive()).toBe(true);
    document.body.dispatchEvent(createKey(ESCAPE));
    capture.end();
    document.body.dispatchEvent(createKey(ESCAPE));
    expect(log).toEqual(['close']);
    expect(capture.isActive()).toBe(false);
  });

  it('forwards consumed non-Escape keys as navigation', () => {
    const log: string[] = [];
    const capture = new MenuKeyboardCapture();
    capture.begin(window, createOwner(log));
    document.body.dispatchEvent(createKey({ key: 'ArrowDown', code: 'ArrowDown' }));
    document.body.dispatchEvent(createKey({ key: 'F5', code: 'F5' }));
    expect(log).toEqual(['nav:ArrowDown']);
    capture.end();
  });

  it('recognizes Escape by key or by code', () => {
    expect(MenuKeyboardCapture.isEscapeKeyEvent(new KeyboardEvent('keydown', { key: 'Escape' }))).toBe(true);
    expect(MenuKeyboardCapture.isEscapeKeyEvent(new KeyboardEvent('keydown', { code: 'Escape' }))).toBe(true);
    expect(MenuKeyboardCapture.isEscapeKeyEvent(new KeyboardEvent('keydown', { key: 'Enter' }))).toBe(false);
  });

  it('classifies browser shortcuts', () => {
    const isBrowser = (init: KeyboardEventInit): boolean =>
      MenuKeyboardCapture.isBrowserShortcut(new KeyboardEvent('keydown', init));
    expect(isBrowser({ key: 'F1', code: 'F1' })).toBe(true);
    expect(isBrowser({ key: 'F24', code: 'F24' })).toBe(true);
    expect(isBrowser({ key: 'r', code: 'KeyR', metaKey: true })).toBe(true);
    expect(isBrowser({ key: 'J', code: 'KeyJ', ctrlKey: true, shiftKey: true })).toBe(true);
    expect(isBrowser({ key: '0', code: 'Digit0', ctrlKey: true })).toBe(true);
    expect(isBrowser({ key: 'f', code: 'KeyF' })).toBe(false);
    expect(isBrowser({ key: 'r', code: 'KeyR' })).toBe(false);
    expect(isBrowser({ key: 'i', code: 'KeyI', ctrlKey: true })).toBe(false);
    expect(isBrowser({ key: 's', code: 'KeyS', ctrlKey: true })).toBe(false);
    expect(isBrowser({ key: 'o', code: 'KeyO', ctrlKey: true })).toBe(false);
    expect(isBrowser({ key: '1', code: 'Digit1' })).toBe(false);
  });
});
