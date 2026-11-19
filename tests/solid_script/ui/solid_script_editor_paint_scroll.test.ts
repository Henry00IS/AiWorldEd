import { afterEach, describe, expect, it } from 'vitest';
import type { SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptEditorCurrentGet } from '@/solid_script/ui/solid_script_editor_open.js';
import { SOLID_SCRIPT_EDITOR_ROW_PX } from '@/solid_script/ui/solid_script_editor_lines.js';
import type { DragEdgeAutoScroll } from '@/ui/drag/drag_edge_scroll.js';
import { chip, editorFixture, find } from './solid_script_editor_fixture.js';

const MANY: SolidScriptLine[] = Array.from({ length: 80 }, () => ({ command: 'cube' }));

/** Space above the first line inside the list. */
const TOP_PX = 4;

/** The parts of the line list the test reads. */
interface LinesInside {
  selected(): number[];
  selectionApply(lines: ReadonlySet<number>, line: number): void;
  paint: { drag: { edgeScroll: DragEdgeAutoScroll } };
}

/**
 * Reads the line list of the open editor.
 *
 * @returns Line list.
 */
function lines(): LinesInside {
  return (solidScriptEditorCurrentGet() as unknown as { lines: LinesInside }).lines;
}

/**
 * Gives the line list a 400 pixel tall box at the top of the page and a scroll
 * offset that can be set.
 *
 * @returns Line list element.
 */
function scroller(): HTMLElement {
  const element = find('.solid-script-editor-lines');
  element.getBoundingClientRect = () => new DOMRect(0, 0, 300, 400);
  Object.defineProperty(element, 'scrollTop', { value: 0, configurable: true, writable: true });
  return element;
}

/**
 * Presses a line with a modifier.
 *
 * @param line Line index.
 * @param modifiers Shift or Ctrl.
 */
function pressWith(line: number, modifiers: MouseEventInit): void {
  const clientY = TOP_PX + line * SOLID_SCRIPT_EDITOR_ROW_PX + 5;
  chip(line).dispatchEvent(
    new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, buttons: 1, clientY, ...modifiers }),
  );
}

/**
 * Moves the pointer with the button held.
 *
 * @param clientY Pointer height.
 * @param modifiers Modifier keys still held.
 */
function moveTo(clientY: number, modifiers: MouseEventInit = {}): void {
  document.dispatchEvent(
    new MouseEvent('mousemove', { bubbles: true, cancelable: true, buttons: 1, clientY, ...modifiers }),
  );
}

/**
 * Runs one animation frame of the edge scroll after the pointer lingered long
 * enough for full speed.
 */
function frameHeldLong(): void {
  const scroll = lines().paint.drag.edgeScroll as unknown as { holdStartedAtMs: number; frameHandle: () => void };
  scroll.holdStartedAtMs = performance.now() - 2500;
  scroll.frameHandle();
}

/**
 * Whether the edge scroll's frame loop runs.
 *
 * @returns True while it loops.
 */
function looping(): boolean {
  return (lines().paint.drag.edgeScroll as unknown as { frameId: number | null }).frameId !== null;
}

/**
 * Line under a pointer height of the 400 pixel list.
 *
 * @param list Line list.
 * @param clientY Pointer height.
 * @returns Line index.
 */
function lineAt(list: HTMLElement, clientY: number): number {
  return Math.floor((clientY + list.scrollTop - TOP_PX) / SOLID_SCRIPT_EDITOR_ROW_PX);
}

/**
 * Lists the lines from first to last.
 *
 * @param first First line.
 * @param last Last line.
 * @returns Line indexes.
 */
function range(first: number, last: number): number[] {
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

afterEach(() => {
  solidScriptEditorCurrentGet()?.close();
  document.body.replaceChildren();
});

describe('SolidScript editor: Shift and Ctrl drag selection scrolls at the edges like the outliner', () => {
  it('Shift-drag to the bottom edge scrolls down and selects the lines that scroll under the pointer', () => {
    editorFixture(MANY);
    const list = scroller();
    lines().selectionApply(new Set([2]), 2);
    pressWith(2, { shiftKey: true });
    moveTo(395, { shiftKey: true });
    expect(lines().selected()).toEqual(range(2, lineAt(list, 395)));
    expect(looping()).toBe(true);
    frameHeldLong();
    frameHeldLong();
    expect(list.scrollTop).toBeGreaterThan(SOLID_SCRIPT_EDITOR_ROW_PX);
    const reached = lineAt(list, 395);
    expect(reached).toBeGreaterThan(16);
    expect(lines().selected()).toEqual(range(2, reached));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(looping()).toBe(false);
  });

  it('Shift-drag to the top edge scrolls up and selects the lines above', () => {
    editorFixture(MANY);
    const list = scroller();
    list.scrollTop = 40 * SOLID_SCRIPT_EDITOR_ROW_PX;
    const pressed = lineAt(list, 300);
    lines().selectionApply(new Set([pressed]), pressed);
    chip(pressed).dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientY: 300,
        shiftKey: true,
      }),
    );
    moveTo(3, { shiftKey: true });
    frameHeldLong();
    expect(list.scrollTop).toBeLessThan(40 * SOLID_SCRIPT_EDITOR_ROW_PX);
    expect(lines().selected()).toEqual(range(lineAt(list, 3), pressed));
  });

  it('Ctrl-drag removes the lines it passes while scrolling, keeping the rest of the selection', () => {
    editorFixture(MANY);
    const list = scroller();
    lines().selectionApply(new Set(range(0, 30)), 0);
    expect(lines().selected()).toEqual(range(0, 30));
    pressWith(5, { ctrlKey: true });
    moveTo(395, { ctrlKey: true });
    frameHeldLong();
    const reached = lineAt(list, 395);
    expect(reached).toBeGreaterThan(16);
    const kept = range(0, 30).filter((line) => line < 5 || line > reached);
    expect(lines().selected()).toEqual(kept);
  });

  it('does not scroll when the pointer stays away from the edges', () => {
    editorFixture(MANY);
    const list = scroller();
    lines().selectionApply(new Set([2]), 2);
    pressWith(2, { shiftKey: true });
    moveTo(200, { shiftKey: true });
    frameHeldLong();
    expect(looping()).toBe(false);
    expect(list.scrollTop).toBe(0);
    expect(lines().selected()).toEqual(range(2, lineAt(list, 200)));
  });
});
