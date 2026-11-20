import { afterEach, describe, expect, it } from 'vitest';
import { button, chip, configuratorOpen, formulaWindow, rows } from './solid_script_formula_window_fixture.js';

/** Blocks of the Size formula [W] + 1. */
const SUM = ['Add', 'Variable [W]', "Number '1'", 'End Add'];

/**
 * Opens the formula window of a Cube's Size over its options.
 *
 * @returns The Size input of the options window.
 */
function sizeFormula(): HTMLInputElement {
  const { input } = configuratorOpen('cube', { size: '[=[W] + 1]' }, 'Size');
  button('Build Size from blocks').click();
  return input;
}

/**
 * Sends a clipboard event to an element, as Ctrl+C, Ctrl+X or Ctrl+V do.
 *
 * @param element Element with the focus.
 * @param type Event type.
 * @returns The event.
 */
function clipboard(element: Element, type: 'copy' | 'cut' | 'paste'): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  return event;
}

/**
 * Tells whether the focus is in the formula window.
 *
 * @returns True when it is.
 */
function focusInFormula(): boolean {
  return formulaWindow().contains(document.activeElement);
}

afterEach(() => document.body.replaceChildren());

describe('SolidScript formula window keys', () => {
  it('takes the focus on its current block when it opens', () => {
    sizeFormula();
    expect(document.activeElement).toBe(chip(0));
  });

  it('copies, pastes and cuts only its own blocks, the options window untouched', () => {
    const size = sizeFormula();
    chip(1).focus();
    clipboard(document.activeElement!, 'copy');
    clipboard(document.activeElement!, 'paste');
    expect(rows()).toEqual(['Add', 'Variable [W]', 'Variable [W]', "Number '1'", 'End Add']);
    clipboard(document.activeElement!, 'cut');
    expect(rows()).toEqual(SUM);
    expect(size.value).toBe('[=[W] + 1]');
    expect(focusInFormula()).toBe(true);
  });

  it.each(['copy', 'cut', 'paste'] as const)('keeps %s away from the options window below', (type) => {
    const size = sizeFormula();
    expect(clipboard(size, type).defaultPrevented).toBe(true);
    expect(rows()).toEqual(SUM);
    expect(size.value).toBe('[=[W] + 1]');
    expect(focusInFormula()).toBe(true);
  });

  it('keeps keys away from the options window below and from the page', () => {
    const size = sizeFormula();
    for (const target of [size, document.body]) {
      const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      target.dispatchEvent(enter);
      expect(enter.defaultPrevented).toBe(true);
      expect(document.querySelector('[data-solid-script-formula]')).not.toBeNull();
      expect(document.querySelector('[data-solid-script-configurator="cube"]')).not.toBeNull();
      expect(focusInFormula()).toBe(true);
    }
  });

  it('hands the focus back and the keys to the options window when it closes', () => {
    const { input: size } = configuratorOpen('cube', { size: '[=[W] + 1]' }, 'Size');
    const build = button('Build Size from blocks');
    build.focus();
    build.click();
    expect(focusInFormula()).toBe(true);
    button('Cancel', formulaWindow()).click();
    expect(document.activeElement).toBe(build);
    expect(clipboard(size, 'paste').defaultPrevented).toBe(false);
  });
});
