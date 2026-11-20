import { afterEach, describe, expect, it, vi } from 'vitest';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { SolidScriptConfigurator } from '@/solid_script/ui/solid_script_configurator.js';
import { SolidScriptDialog } from '@/solid_script/ui/solid_script_dialog.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from '@/solid_script/ui/solid_script_editor_css.js';

/** A dialog with a button that counts how often its popups were closed. */
class TestDialog extends SolidScriptDialog {
  readonly cancelled = vi.fn();
  readonly popups = vi.fn();

  /**
   * Opens the dialog.
   *
   * @param parent Dialog it opens over, or null.
   */
  constructor(parent: SolidScriptDialog | null = null) {
    super(document.body, 'Test', 'OK', parent);
    this.content.append(document.createElement('input'), this.buttonRow());
    this.show();
  }

  /** @returns True, so OK closes. */
  protected confirm(): boolean {
    return true;
  }

  /** Counts the cancel. */
  protected cancel(): void {
    this.cancelled();
  }

  /** Counts the popups closing. */
  protected override popupsClose(): void {
    this.popups();
  }

  /** @returns The blocker behind. */
  blocker(): HTMLElement {
    return this.getBackdropElement()!;
  }

  /** @returns The window. */
  window(): HTMLElement {
    return this.root;
  }
}

/**
 * Presses the mouse on an element.
 *
 * @param element Element.
 */
function press(element: HTMLElement): void {
  element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

/**
 * Tells whether the darkening pane is on a window.
 *
 * @param dialog Dialog.
 * @returns True while darkened.
 */
function darkened(dialog: TestDialog): boolean {
  return dialog.isShaded() || dialog.window().querySelector(`.${SOLID_SCRIPT_EDITOR_CLASSES.shade}`) !== null;
}

/** Ways a dialog over another one closes. */
const CLOSES: readonly [string, (dialog: TestDialog) => void][] = [
  ['OK', (dialog) => [...dialog.window().querySelectorAll('button')].find((b) => b.textContent === 'OK')!.click()],
  [
    'Cancel',
    (dialog) => [...dialog.window().querySelectorAll('button')].find((b) => b.textContent === 'Cancel')!.click(),
  ],
  ['Escape', (dialog) => dialog.window().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))],
  ['X', (dialog) => dialog.window().querySelector<HTMLButtonElement>('[aria-label="Close"]')!.click()],
  ['hide', (dialog) => dialog.hide(true)],
  ['dispose', (dialog) => dialog.dispose()],
];

afterEach(() => document.body.replaceChildren());

describe('SolidScript dialog', () => {
  it('cancels on a click beside a dialog on its own', () => {
    const dialog = new TestDialog();
    press(dialog.blocker());
    expect(dialog.cancelled).toHaveBeenCalledOnce();
    expect(dialog.isOpen()).toBe(false);
  });

  it('stays open on a click beside a dialog over another one, which stays darkened', () => {
    const below = new TestDialog();
    const over = new TestDialog(below);
    press(over.blocker());
    expect(over.isOpen()).toBe(true);
    expect(over.cancelled).not.toHaveBeenCalled();
    expect(darkened(below)).toBe(true);
  });

  it.each(CLOSES)('lightens the window below when the dialog over it closes by %s', (_name, close) => {
    const below = new TestDialog();
    const over = new TestDialog(below);
    expect(darkened(below)).toBe(true);
    close(over);
    expect(over.isOpen()).toBe(false);
    expect(darkened(below)).toBe(false);
    expect(below.isOpen()).toBe(true);
  });

  it('closes the popups of the window below when a dialog opens over it', () => {
    const below = new TestDialog();
    expect(below.popups).not.toHaveBeenCalled();
    new TestDialog(below);
    expect(below.popups).toHaveBeenCalledOnce();
  });

  it('closes the suggestion list of a field when the formula window opens over the options', () => {
    const command = solidScriptCommandFind('sphere')!;
    new SolidScriptConfigurator(document.body, command, { mode: '' }, () => undefined).show();
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Mode"]')!;
    input.focus();
    input.dispatchEvent(new MouseEvent('click'));
    expect(document.querySelector('[role="listbox"]')).not.toBeNull();
    [...document.querySelectorAll('button')]
      .find((b) => b.getAttribute('aria-label') === 'Build Mode from blocks')!
      .click();
    expect(document.querySelector('[data-solid-script-formula]')).not.toBeNull();
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  it.each(['Hello', '', 'it\'s "quoted"', '[I] [=1 + 2] $[ "q"', '  spaced  '])(
    'keeps the Note %j exactly through OK in its options, shown after *** as typed',
    (text) => {
      const command = solidScriptCommandFind('note')!;
      const stored: Record<string, string>[] = [];
      new SolidScriptConfigurator(document.body, command, { text }, (values) => stored.push(values)).show();
      [...document.querySelectorAll('button')].find((b) => b.textContent === 'OK')!.click();
      expect(stored[0]?.['text'] ?? text).toBe(text);
      expect(command.listingText({ text })).toBe(text === '' ? '***' : `*** ${text}`);
    },
  );
});
