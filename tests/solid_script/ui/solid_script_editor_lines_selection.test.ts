import { afterEach, describe, expect, it } from 'vitest';
import { solidScriptEditorCurrentGet } from '@/solid_script/ui/solid_script_editor_open.js';
import type { SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { chip, editorFixture, find, press } from './solid_script_editor_fixture.js';

/** Height of one script row in pixels. */
const ROW_PX = 24;
/** Space above the first script row in pixels. */
const LINES_TOP_PX = 4;

/**
 * Creates a script of plain cube lines.
 *
 * @param count Number of lines.
 * @returns Script lines.
 */
function cubeLines(count: number): SolidScriptLine[] {
  return Array.from({ length: count }, () => ({ command: 'cube' }));
}

/**
 * Presses a line with the left button the way a browser does: the line takes
 * the focus unless the press is cancelled.
 *
 * @param line Line index.
 * @param init Modifier keys.
 */
function down(line: number, init: MouseEventInit = {}): void {
  const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, buttons: 1, ...init });
  if (chip(line).dispatchEvent(event)) chip(line).focus();
}

/**
 * Releases a plain press on a line without a drag.
 *
 * @param line Line index.
 */
function click(line: number): void {
  chip(line).dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
}

/**
 * Right-clicks a line the way a browser does: the press moves the focus to the
 * line unless cancelled, then the context menu event follows.
 *
 * @param line Line index.
 */
function rightClick(line: number): void {
  const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 2, buttons: 2 });
  if (chip(line).dispatchEvent(event)) chip(line).focus();
  chip(line).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
}

/**
 * Moves the pointer with the left button held over a line.
 *
 * @param line Line index.
 */
function dragOver(line: number): void {
  const clientY = LINES_TOP_PX + line * ROW_PX + ROW_PX / 2;
  document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, buttons: 1, clientY }));
}

/** Releases the left button anywhere. */
function release(): void {
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
}

/**
 * Returns the lines shown as selected, the current line included.
 *
 * @param count Number of lines in the script.
 * @returns Selected line indexes in order.
 */
function selection(count: number): number[] {
  const marks = ['solid-script-editor-selected', 'solid-script-editor-current'];
  return Array.from({ length: count }, (_, line) => line).filter((line) =>
    marks.some((mark) => find(`[data-line="${line}"]`).classList.contains(mark)),
  );
}

/**
 * Returns the line that has the keyboard focus.
 *
 * @returns Line index, or null.
 */
function focusedLine(): number | null {
  const line = document.activeElement?.closest<HTMLElement>('[data-line]')?.dataset['line'];
  return line === undefined ? null : Number(line);
}

/**
 * Clicks an entry of the open line menu.
 *
 * @param label Entry label.
 */
function menuChoose(label: string): void {
  const entry = [...document.querySelectorAll<HTMLElement>('[role="menuitem"], button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!entry) throw new Error(`Expected the ${label} menu entry`);
  entry.click();
}

afterEach(() => {
  release();
  solidScriptEditorCurrentGet()?.close();
  document.body.replaceChildren();
});

describe('SolidScript editor line selection follows the shared row rules', () => {
  it('selects a line alone with a plain click and adds lines with Shift+click', () => {
    editorFixture(cubeLines(6));
    down(1);
    down(3, { shiftKey: true });
    down(4, { shiftKey: true });
    expect(selection(6)).toEqual([1, 3, 4]);
    down(2);
    expect(selection(6)).toEqual([2]);
  });

  it('keeps a drag-painted selection on a right-click inside it and the menu acts on every line', () => {
    const { script } = editorFixture(cubeLines(8));
    down(0, { shiftKey: true });
    dragOver(5);
    release();
    expect(selection(8)).toEqual([0, 1, 2, 3, 4, 5]);
    rightClick(2);
    expect(selection(8)).toEqual([0, 1, 2, 3, 4, 5]);
    menuChoose('Turn Off');
    expect(script().blocks.map((block) => block.off === true)).toEqual([...Array(6).fill(true), false, false]);
  });

  it('keeps a keyboard Shift range on a right-click inside it', () => {
    editorFixture(cubeLines(8));
    chip(0).focus();
    for (let line = 0; line < 5; line++) press(chip(line), 'ArrowDown', { shiftKey: true });
    rightClick(2);
    expect(selection(8)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('keeps Ctrl-picked lines on a right-click inside them', () => {
    editorFixture(cubeLines(6));
    down(0);
    down(2, { ctrlKey: true });
    down(4, { ctrlKey: true });
    rightClick(2);
    expect(selection(6)).toEqual([0, 2, 4]);
  });

  it('selects only the right-clicked line when it is outside the selection', () => {
    const { script } = editorFixture(cubeLines(8));
    down(0, { shiftKey: true });
    dragOver(3);
    release();
    rightClick(6);
    expect(selection(8)).toEqual([6]);
    menuChoose('Turn Off');
    expect(script().blocks.map((block) => block.off === true)).toEqual([...Array(6).fill(false), true, false]);
  });

  it('removes only the Ctrl+clicked line from the selection', () => {
    editorFixture(cubeLines(6));
    down(0);
    down(2, { ctrlKey: true });
    down(4, { ctrlKey: true });
    down(2, { ctrlKey: true });
    expect(selection(6)).toEqual([0, 4]);
  });

  it('removes the first picked line with Ctrl+click and moves the focus to a line still selected', () => {
    const { commands } = editorFixture(cubeLines(6));
    down(1);
    down(3, { ctrlKey: true });
    down(4, { ctrlKey: true });
    down(1, { ctrlKey: true });
    expect(selection(6)).toEqual([3, 4]);
    expect(focusedLine()).toBe(3);
    press(chip(3), 'Delete');
    expect(commands()).toHaveLength(4);
  });

  it('keeps the last line selected when Ctrl+click would leave nothing selected', () => {
    editorFixture(cubeLines(4));
    down(2);
    down(2, { ctrlKey: true });
    expect(selection(4)).toEqual([2]);
  });

  it('adds and removes lines with Ctrl+click after a Shift range', () => {
    editorFixture(cubeLines(6));
    chip(0).focus();
    press(chip(0), 'ArrowDown', { shiftKey: true });
    press(chip(1), 'ArrowDown', { shiftKey: true });
    down(4, { ctrlKey: true });
    expect(selection(6)).toEqual([0, 1, 2, 4]);
    down(1, { ctrlKey: true });
    expect(selection(6)).toEqual([0, 2, 4]);
  });

  it('adds and removes lines with Ctrl+click after Shift+clicks', () => {
    editorFixture(cubeLines(6));
    down(0);
    down(1, { shiftKey: true });
    down(2, { shiftKey: true });
    down(5, { ctrlKey: true });
    expect(selection(6)).toEqual([0, 1, 2, 5]);
    down(0, { ctrlKey: true });
    expect(selection(6)).toEqual([1, 2, 5]);
  });

  it('toggles with Shift+Ctrl+click, Ctrl winning over Shift', () => {
    editorFixture(cubeLines(5));
    down(0);
    down(2, { shiftKey: true, ctrlKey: true });
    expect(selection(5)).toEqual([0, 2]);
    down(2, { shiftKey: true, ctrlKey: true });
    expect(selection(5)).toEqual([0]);
  });

  it('extends with Shift after a Ctrl toggle, keeping the picked lines', () => {
    editorFixture(cubeLines(7));
    down(0);
    down(3, { ctrlKey: true });
    press(chip(3), 'ArrowDown', { shiftKey: true });
    expect(selection(7)).toEqual([0, 3, 4]);
    down(6, { shiftKey: true });
    expect(selection(7)).toEqual([0, 3, 4, 6]);
  });

  it('paints lines out with a Ctrl drag from the pressed line', () => {
    editorFixture(cubeLines(8));
    down(0, { shiftKey: true });
    dragOver(6);
    release();
    down(2, { ctrlKey: true });
    dragOver(4);
    release();
    expect(selection(8)).toEqual([0, 1, 5, 6]);
  });

  it('picks a line alone after a plain click without a drag on a line of a larger selection', () => {
    editorFixture(cubeLines(5));
    down(0);
    down(2, { ctrlKey: true });
    down(2);
    expect(selection(5)).toEqual([0, 2]);
    click(2);
    expect(selection(5)).toEqual([2]);
  });

  it('selects a line alone when the keyboard focus arrives on it', () => {
    editorFixture(cubeLines(5));
    down(0);
    down(2, { ctrlKey: true });
    chip(4).focus();
    expect(selection(5)).toEqual([4]);
  });
});
