import { afterEach, describe, expect, it } from 'vitest';
import type { SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptEditorCurrentGet } from '@/solid_script/ui/solid_script_editor_open.js';
import { SOLID_SCRIPT_EDITOR_DRAG_COMMAND } from '@/solid_script/ui/solid_script_editor_palette.js';
import { SOLID_SCRIPT_EDITOR_DRAG_LINE } from '@/solid_script/ui/solid_script_editor_row.js';
import { SOLID_SCRIPT_EDITOR_ROW_PX } from '@/solid_script/ui/solid_script_editor_lines.js';
import {
  DRAG_EDGE_SCROLL_TUNING,
  type DragEdgeAutoScroll,
  dragEdgeScrollDeltaResolve,
} from '@/ui/drag/drag_edge_scroll.js';
import { chip, editorFixture, find } from './solid_script_editor_fixture.js';

const MANY: SolidScriptLine[] = Array.from({ length: 80 }, () => ({ command: 'cube' }));

/**
 * Sends a drag event carrying the given data.
 *
 * @param element Target.
 * @param type Event type.
 * @param data Dragged data by type.
 * @param clientY Pointer Y.
 * @param relatedTarget Element the pointer moves to, for enter and leave.
 */
function drag(
  element: Element,
  type: string,
  data: Record<string, string>,
  clientY = 200,
  relatedTarget: EventTarget | null = null,
): void {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 50, clientY, relatedTarget });
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      types: Object.keys(data),
      files: [],
      getData: (kind: string) => data[kind] ?? '',
      setData: (kind: string, value: string) => void (data[kind] = value),
      dropEffect: 'none',
      effectAllowed: 'all',
    },
  });
  element.dispatchEvent(event);
}

/**
 * Gives an element a 400 pixel tall box at the top of the page and a scroll
 * offset that can be set.
 *
 * @param element Scrolling list.
 */
function scroller(element: HTMLElement): void {
  element.getBoundingClientRect = () => new DOMRect(0, 0, 300, 400);
  Object.defineProperty(element, 'scrollTop', { value: 0, configurable: true, writable: true });
}

/**
 * Pretends the pointer has lingered in the edge band long enough for full
 * speed.
 *
 * @param scroll Edge scroll.
 */
function heldLong(scroll: DragEdgeAutoScroll): void {
  (scroll as unknown as { holdStartedAtMs: number }).holdStartedAtMs = performance.now() - 2500;
}

/** The line list's edge scroll. */
function linesScroll(): DragEdgeAutoScroll {
  const editor = solidScriptEditorCurrentGet() as unknown as { lines: { drop: { edgeScroll: DragEdgeAutoScroll } } };
  return editor.lines.drop.edgeScroll;
}

/** The palette's edge scroll. */
function paletteScroll(): DragEdgeAutoScroll {
  const editor = solidScriptEditorCurrentGet() as unknown as { palette: { edgeScroll: DragEdgeAutoScroll } };
  return editor.palette.edgeScroll;
}

/**
 * Whether an edge scroll's animation-frame loop runs.
 *
 * @param scroll Edge scroll.
 * @returns True while it loops.
 */
function looping(scroll: DragEdgeAutoScroll): boolean {
  return (scroll as unknown as { frameId: number | null }).frameId !== null;
}

afterEach(() => {
  solidScriptEditorCurrentGet()?.close();
  document.body.replaceChildren();
});

describe('SolidScript editor drag scrolling', () => {
  it('scrolls the script while a line or command drag lingers near its bottom, in script rows', () => {
    editorFixture(MANY);
    const list = find('.solid-script-editor-lines');
    scroller(list);
    const drags: Record<string, string>[] = [
      { [SOLID_SCRIPT_EDITOR_DRAG_LINE]: '0' },
      { [SOLID_SCRIPT_EDITOR_DRAG_COMMAND]: 'sphere' },
    ];
    for (const data of drags) {
      list.scrollTop = 0;
      drag(list, 'dragenter', data, 398, document.body);
      drag(chip(1), 'dragover', data, 398);
      expect(list.scrollTop).toBe(0);
      expect(looping(linesScroll())).toBe(true);
      heldLong(linesScroll());
      drag(chip(1), 'dragover', data, 398);
      const tuning = { ...DRAG_EDGE_SCROLL_TUNING, rowHeightPx: SOLID_SCRIPT_EDITOR_ROW_PX };
      expect(list.scrollTop).toBe(dragEdgeScrollDeltaResolve(398, 0, 400, 2500, tuning));
      drag(chip(1), 'dragleave', data, 398, document.body);
      expect(looping(linesScroll())).toBe(false);
    }
  });

  it('does not scroll the script in the middle, and stops when the drag ends', () => {
    editorFixture(MANY);
    const list = find('.solid-script-editor-lines');
    scroller(list);
    const data = { [SOLID_SCRIPT_EDITOR_DRAG_LINE]: '0' };
    drag(list, 'dragenter', data, 200, document.body);
    heldLong(linesScroll());
    drag(chip(1), 'dragover', data, 200);
    expect(list.scrollTop).toBe(0);
    drag(chip(1), 'dragover', data, 398);
    expect(looping(linesScroll())).toBe(true);
    drag(chip(0), 'dragend', data, 398);
    expect(looping(linesScroll())).toBe(false);
  });

  it('scrolls the palette while a command dragged out of it lingers near its bottom', () => {
    editorFixture([{ command: 'cube' }]);
    const list = find('.solid-script-editor-palette-list');
    scroller(list);
    const item = find('.solid-script-editor-palette-item');
    const data: Record<string, string> = {};
    drag(item, 'dragstart', data, 100);
    expect(data[SOLID_SCRIPT_EDITOR_DRAG_COMMAND]).toBeTruthy();
    drag(document.body, 'dragover', data, 398);
    expect(looping(paletteScroll())).toBe(true);
    heldLong(paletteScroll());
    drag(document.body, 'dragover', data, 398);
    expect(list.scrollTop).toBe(dragEdgeScrollDeltaResolve(398, 0, 400, 2500));
    drag(document.body, 'dragover', data, 600);
    expect(looping(paletteScroll())).toBe(false);
    drag(item, 'dragend', data, 600);
    const after = list.scrollTop;
    drag(document.body, 'dragover', data, 398);
    expect(list.scrollTop).toBe(after);
    expect(looping(paletteScroll())).toBe(false);
  });
});
