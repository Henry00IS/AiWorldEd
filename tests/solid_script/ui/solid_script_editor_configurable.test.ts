import { afterEach, describe, expect, it } from 'vitest';
import { caption, chip, doubleClick, editorFixture, press } from './solid_script_editor_fixture.js';
import {
  chip as block,
  formulaOpen,
  formulaWindow,
  selectFaces,
  status,
} from './solid_script_formula_window_fixture.js';

/** The hint a line with values to set shows. */
const HINT = 'Double-click or press Enter to configure.';

/**
 * Lists the configurators open, by command, beside the Select Faces one the
 * formula window opens from.
 *
 * @returns Command ids.
 */
function configurators(): string[] {
  return [...document.querySelectorAll<HTMLElement>('[data-solid-script-configurator]')]
    .map((element) => element.dataset['solidScriptConfigurator'] ?? '')
    .filter((id) => id !== 'select_faces');
}

/**
 * Opens the line menu on a line and reads whether Change… can be picked.
 *
 * @param element Line chip.
 * @returns True when Change… is enabled.
 */
function changeEnabled(element: HTMLElement): boolean {
  element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
  const items = [...document.querySelectorAll<HTMLElement>('.menu-context-item, [role="menuitem"]')];
  const change = items.find((item) => item.textContent?.includes('Change…'));
  if (!change) throw new Error('Expected Change… in the line menu');
  const enabled = !(
    change.getAttribute('aria-disabled') === 'true' ||
    change.classList.contains('disabled') ||
    (change as HTMLButtonElement).disabled === true
  );
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return enabled;
}

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

describe('SolidScript lines with nothing to configure', () => {
  it('formula editor: only a block with fields offers configuring; function groups and End lines do nothing', () => {
    selectFaces('[=Floor(1.5) + 1]');
    formulaOpen();
    const lines = [...formulaWindow().querySelectorAll<HTMLElement>('[data-line]')].map((row) =>
      row.querySelector<HTMLElement>('[data-command]'),
    );
    expect(lines.map((line) => line?.textContent)).toEqual([
      'Add',
      'Round Down',
      "Number '1.5'",
      'End Round Down',
      "Number '1'",
      'End Add',
    ]);
    expect(block(2).title).toContain(HINT);
    for (const line of [0, 1, 3, 5]) expect(block(line).title).not.toContain('configure');
    const before = status();
    for (const line of [1, 3]) {
      press(block(line), 'Enter');
      press(block(line), 'F2');
      expect(configurators()).toEqual([]);
    }
    doubleClick(block(1));
    expect(configurators()).toEqual([]);
    expect(status()).toBe(before);
    expect(changeEnabled(block(1))).toBe(false);
    expect(changeEnabled(block(3))).toBe(false);
    expect(changeEnabled(block(2))).toBe(true);
    press(block(2), 'Enter');
    expect(configurators()).toEqual(['formula_number']);
  });

  it('formula editor: double-clicking a field-less group configures nothing', () => {
    selectFaces('[=Floor(1.5)]');
    formulaOpen();
    doubleClick(block(0));
    expect(configurators()).toEqual([]);
    doubleClick(block(1));
    expect(configurators()).toEqual(['formula_number']);
  });

  it('script editor: Else, Stop Script and End do nothing on Enter or double-click; a block with fields configures', () => {
    editorFixture([
      { command: 'if', values: { condition: 'true' } },
      { command: 'stop_script' },
      { command: 'else' },
      { command: 'cube' },
      { command: 'end' },
    ]);
    expect(chip(0).title).toContain(HINT);
    expect(chip(3).title).toContain(HINT);
    for (const line of [1, 2, 4]) expect(chip(line).title).not.toContain('configure');
    const before = caption();
    for (const line of [1, 2, 4]) {
      press(chip(line), 'Enter');
      expect(configurators()).toEqual([]);
    }
    doubleClick(chip(1));
    doubleClick(chip(2));
    expect(configurators()).toEqual([]);
    expect(caption()).toBe(before);
    expect(changeEnabled(chip(1))).toBe(false);
    expect(changeEnabled(chip(4))).toBe(false);
    expect(changeEnabled(chip(3))).toBe(true);
    press(chip(3), 'Enter');
    expect(configurators()).toEqual(['cube']);
  });
});
