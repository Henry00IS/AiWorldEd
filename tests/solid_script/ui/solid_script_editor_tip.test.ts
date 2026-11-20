import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SOLID_SCRIPT_EDITOR_CLASSES } from '@/solid_script/ui/solid_script_editor_css.js';
import { SOLID_SCRIPT_EDITOR_TIP_DELAY_MS, SolidScriptEditorTip } from '@/solid_script/ui/solid_script_editor_tip.js';

/**
 * Makes a list with rows holding a titled chip each.
 *
 * @param count Rows.
 * @returns List.
 */
function listCreate(count: number): HTMLElement {
  const host = document.createElement('div');
  for (let line = 0; line < count; line++) {
    const row = document.createElement('div');
    row.dataset['line'] = String(line);
    const chip = document.createElement('span');
    chip.title = `Block ${line}`;
    row.append(chip);
    host.append(row);
  }
  document.body.append(host);
  return host;
}

/**
 * Moves the pointer onto an element.
 *
 * @param element Element.
 */
function hover(element: Element): void {
  element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 20, clientY: 20 }));
}

/** The tip on the page, if any. */
function tip(): HTMLElement | null {
  return document.querySelector<HTMLElement>(`.${SOLID_SCRIPT_EDITOR_CLASSES.codeTip}`);
}

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('SolidScript editor code tip', () => {
  it('shows the code of a resting row highlighted, under the tooltip of what is hovered', () => {
    const host = listCreate(2);
    new SolidScriptEditorTip(host, (line) => (line === 0 ? 'Abs([$NY]) > 0.5' : null));
    const chip = host.querySelector('[data-line="0"] span')!;
    hover(chip);
    expect(tip()).toBeNull();
    vi.advanceTimersByTime(SOLID_SCRIPT_EDITOR_TIP_DELAY_MS);
    expect(tip()?.hidden).toBe(false);
    expect(tip()?.querySelector(`.${SOLID_SCRIPT_EDITOR_CLASSES.codeTipHeading}`)?.textContent).toBe('Block 0');
    const code = tip()!.querySelector(`.${SOLID_SCRIPT_EDITOR_CLASSES.codeTipText}`)!;
    expect(code.textContent).toBe('Abs([$NY]) > 0.5');
    expect(code.querySelector(`.${SOLID_SCRIPT_EDITOR_CLASSES.tokenFunction}`)?.textContent).toBe('Abs');
    expect(code.querySelector(`.${SOLID_SCRIPT_EDITOR_CLASSES.tokenNumber}`)?.textContent).toBe('0.5');
    expect(chip.hasAttribute('title')).toBe(false);
    host.dispatchEvent(new MouseEvent('mouseleave'));
    expect(tip()?.hidden).toBe(true);
    expect(chip.getAttribute('title')).toBe('Block 0');
  });

  it('shows nothing for a row without code, and hides on a click', () => {
    const host = listCreate(2);
    const shown = new SolidScriptEditorTip(host, (line) => (line === 0 ? '[a]' : null));
    hover(host.querySelector('[data-line="1"] span')!);
    vi.advanceTimersByTime(SOLID_SCRIPT_EDITOR_TIP_DELAY_MS);
    expect(tip()).toBeNull();
    hover(host.querySelector('[data-line="0"] span')!);
    vi.advanceTimersByTime(SOLID_SCRIPT_EDITOR_TIP_DELAY_MS);
    expect(tip()?.hidden).toBe(false);
    host.dispatchEvent(new MouseEvent('mousedown'));
    expect(tip()?.hidden).toBe(true);
    shown.dispose();
    expect(tip()).toBeNull();
  });
});
