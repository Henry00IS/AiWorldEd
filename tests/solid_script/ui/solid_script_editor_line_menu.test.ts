import { afterEach, describe, expect, it } from 'vitest';
import type { SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptEditorCurrentGet } from '@/solid_script/ui/solid_script_editor_open.js';
import {
  SOLID_SCRIPT_EDITOR_VIEW_DEFAULT,
  solidScriptEditorViewWrite,
} from '@/solid_script/ui/solid_script_editor_view.js';
import { UiStackLayers } from '@/ui/stack/ui_stack_layers.js';
import { chip, editorFixture, find, press } from './solid_script_editor_fixture.js';
import { button, chip as block, configuratorOpen } from './solid_script_formula_window_fixture.js';

/** A Transform holding an If with two shapes and a blank line between them. */
const NESTED: SolidScriptLine[] = [
  { command: 'transform' },
  { command: 'if' },
  { command: 'cube' },
  { command: 'blank' },
  { command: 'sphere' },
  { command: 'end' },
  { command: 'end' },
];

/**
 * Opens the line menu on a line.
 *
 * @param line Line.
 */
function menuOpen(line: number): void {
  chip(line).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
}

/**
 * Lists the open line menu: each item with its shortcut, and --- for a line.
 *
 * @returns Entries.
 */
function menuEntries(): string[] {
  return [...find('[role="menu"]').children].map((entry) =>
    entry.getAttribute('role') === 'menuitem'
      ? `${entry.textContent}${(entry as HTMLButtonElement).disabled ? ' (off)' : ''}`
      : '---',
  );
}

/**
 * Clicks an item of the open line menu.
 *
 * @param label Item label.
 */
function menuClick(label: string): void {
  const item = [...document.querySelectorAll<HTMLButtonElement>('[role="menu"] [role="menuitem"]')].find((entry) =>
    entry.textContent?.startsWith(label),
  );
  if (!item) throw new Error(`Expected the ${label} item`);
  item.click();
}

/**
 * Runs an action with a clipboard that keeps what a copy event writes, as the
 * browser does for a copy from a menu.
 *
 * @param run Action.
 * @returns Written data by type.
 */
function copied(run: () => void): Map<string, string> {
  const data = new Map<string, string>();
  const copy = (): boolean => {
    const event = new Event('copy', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: { setData: (type: string, text: string) => data.set(type, text) },
    });
    document.dispatchEvent(event);
    return true;
  };
  Object.defineProperty(document, 'execCommand', { value: copy, configurable: true });
  run();
  return data;
}

/**
 * Selects a run of lines.
 *
 * @param first First line.
 * @param last Last line.
 */
function selectRun(first: number, last: number): void {
  chip(first).focus();
  for (let line = first; line < last; line++) press(chip(line), 'ArrowDown', { shiftKey: true });
}

/**
 * Copies the selected lines from the line menu.
 *
 * @param label Menu item.
 * @param line Line the menu opens on.
 * @returns Written data by type.
 */
function menuCopy(label: string, line: number): Map<string, string> {
  menuOpen(line);
  return copied(() => menuClick(label));
}

afterEach(() => {
  solidScriptEditorCurrentGet()?.close();
  document.body.replaceChildren();
  localStorage.clear();
});

describe('SolidScript line menu', () => {
  it('groups the clipboard, copying as shown and changing lines, with Paste off until lines are copied', () => {
    editorFixture([{ command: 'cube' }, { command: 'sphere' }]);
    menuOpen(0);
    expect(menuEntries()).toEqual([
      'CutCtrl+X',
      'CopyCtrl+C',
      'PasteCtrl+V (off)',
      '---',
      'Copy as Plain Text',
      'Copy with Markup',
      '---',
      'Change…',
      'Turn Off',
      'Duplicate',
      'Delete',
      '---',
      'Toggle Breakpoint',
    ]);
  });

  it('copies, pastes and cuts lines from the menu like Ctrl+C, Ctrl+V and Ctrl+X', () => {
    const { script } = editorFixture([{ command: 'cube' }, { command: 'sphere' }]);
    const data = menuCopy('Copy', 0);
    const lines = JSON.parse(data.get('text/plain') ?? '{}').lines as SolidScriptLine[];
    expect(lines.map((line) => line.command)).toEqual(['cube']);
    menuOpen(1);
    expect(menuEntries()).toContain('PasteCtrl+V');
    menuClick('Paste');
    expect(script().blocks.map((block) => block.command)).toEqual(['cube', 'cube', 'sphere']);
    menuCopy('Cut', 2);
    expect(script().blocks.map((block) => block.command)).toEqual(['cube', 'cube']);
  });

  it('copies lines as shown, without the indent they share and keeping the indent inside', () => {
    editorFixture(NESTED);
    const shown = (line: number) => chip(line).textContent ?? '';
    selectRun(2, 5);
    const text = menuCopy('Copy as Plain Text', 2).get('text/plain');
    expect(text).toBe([`    ${shown(2)}`, '', `    ${shown(4)}`, shown(5)].join('\n'));
    expect(shown(5)).toBe('End If');
    selectRun(0, 6);
    const all = menuCopy('Copy as Plain Text', 0).get('text/plain')?.split('\n');
    expect(all?.map((line) => line.length - line.trimStart().length)).toEqual([0, 4, 8, 0, 8, 4, 0]);
  });

  it('copies one line without any indent', () => {
    editorFixture(NESTED);
    chip(2).focus();
    expect(menuCopy('Copy as Plain Text', 2).get('text/plain')).toBe(chip(2).textContent);
  });

  it('copies End lines as shown with Block Names On End off', () => {
    solidScriptEditorViewWrite({ ...SOLID_SCRIPT_EDITOR_VIEW_DEFAULT, endNames: false });
    editorFixture(NESTED);
    selectRun(4, 6);
    expect(menuCopy('Copy as Plain Text', 4).get('text/plain')).toBe(`        ${chip(4).textContent}\n    End\nEnd`);
  });

  it('copies with markup: the same text in the colours of the code view as HTML, with plain text too', () => {
    editorFixture(NESTED);
    selectRun(1, 3);
    const plain = menuCopy('Copy as Plain Text', 1).get('text/plain');
    const data = menuCopy('Copy with Markup', 1);
    expect(data.get('text/plain')).toBe(plain);
    const html = new DOMParser().parseFromString(data.get('text/html') ?? '', 'text/html');
    const pre = html.querySelector('pre');
    expect(pre?.textContent).toBe(plain);
    const spans = [...(pre?.querySelectorAll('span') ?? [])];
    expect(spans.length).toBeGreaterThan(3);
    for (const span of spans) expect(span.getAttribute('style')).toMatch(/^color:[^;]+;font-weight:/);
    expect(document.querySelectorAll('[data-line]').length).toBe(NESTED.length);
  });

  it('gives the formula window the same menu, above the window, without turning off and breakpoints', () => {
    editorFixture([{ command: 'cube' }, { command: 'sphere' }]);
    menuOpen(0);
    const script = menuEntries();
    solidScriptEditorCurrentGet()?.close();
    document.body.replaceChildren();
    configuratorOpen('cube', { size: '[=[W] + 1]' }, 'Size');
    button('Build Size from blocks').click();
    block(1).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    expect(menuEntries()).toEqual(script.filter((entry) => entry !== 'Turn Off').slice(0, -2));
    expect(Number(find('[role="menu"]').style.zIndex)).toBeGreaterThan(UiStackLayers.modal);
  });
});
