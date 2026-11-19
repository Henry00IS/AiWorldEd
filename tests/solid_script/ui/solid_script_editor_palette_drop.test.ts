import { afterEach, describe, expect, it } from 'vitest';
import type { SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptEditorCurrentGet } from '@/solid_script/ui/solid_script_editor_open.js';
import { chip, editorFixture, find, tool } from './solid_script_editor_fixture.js';

const LINES: SolidScriptLine[] = [{ command: 'cube' }, { command: 'sphere' }];

/**
 * Sends a drag event with a data transfer shared by the whole drag, as a
 * browser does: the palette writes it on drag start, the script reads it.
 *
 * @param element Target.
 * @param type Event type.
 * @param data Shared drag data.
 * @param init Pointer position and the element the pointer moves to or from.
 * @returns The event, to read whether it was taken.
 */
function drag(element: Element, type: string, data: Record<string, string>, init: MouseEventInit = {}): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientY: -1, ...init });
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      get types() {
        return Object.keys(data);
      },
      files: [],
      getData: (kind: string) => data[kind] ?? '',
      setData: (kind: string, value: string) => void (data[kind] = value),
      dropEffect: 'none',
      effectAllowed: 'all',
    },
  });
  element.dispatchEvent(event);
  return event;
}

/**
 * A palette entry outside Favorites.
 *
 * @param id Command id.
 * @returns Entry.
 */
function paletteEntry(id: string): HTMLElement {
  const favorites = find('.solid-script-editor-palette-favorites');
  const entry = [
    ...document.querySelectorAll<HTMLElement>(`.solid-script-editor-palette-item[data-command="${id}"]`),
  ].find((candidate) => !favorites.contains(candidate));
  if (!entry) throw new Error(`Expected ${id}`);
  return entry;
}

/** Line list the drags go over. */
function list(): HTMLElement {
  return find('.solid-script-editor-lines');
}

/**
 * Lines that show the drop marker, with the marker kind.
 *
 * @returns Line and kind, such as "1:before".
 */
function marked(): string[] {
  return [...document.querySelectorAll<HTMLElement>('[class*="solid-script-editor-drop-"]')].map(
    (row) => `${row.dataset['line']}:${/drop-(\w+)/.exec(row.className)?.[1]}`,
  );
}

/**
 * Drags a palette command into the script as a browser does: drag start, into
 * the list and across its first row onto a line, with the enter and leave of
 * each element in between, then the drop and the drag end.
 *
 * @param id Command id.
 * @param line Line it is dropped on.
 * @param clientY Pointer height: -1 for the top half of the line, 5 for the
 *   bottom half.
 * @returns Whether the enter, over and drop on the line were taken, and the
 *   marker before the drop.
 */
function paletteDrop(id: string, line: number, clientY: number) {
  const data: Record<string, string> = {};
  const source = paletteEntry(id);
  drag(source, 'dragstart', data);
  drag(list(), 'dragenter', data, { relatedTarget: source });
  drag(chip(0), 'dragenter', data, { relatedTarget: list() });
  drag(list(), 'dragleave', data, { relatedTarget: chip(0) });
  drag(chip(0), 'dragover', data);
  let entered = true;
  if (line !== 0) {
    entered = drag(chip(line), 'dragenter', data, { relatedTarget: chip(0) }).defaultPrevented;
    drag(chip(0), 'dragleave', data, { relatedTarget: chip(line) });
  }
  const over = drag(chip(line), 'dragover', data, { clientY }).defaultPrevented;
  const marker = marked();
  const dropped = drag(chip(line), 'drop', data, { clientY }).defaultPrevented;
  drag(source, 'dragend', data);
  return { entered, over, dropped, marker };
}

afterEach(() => {
  solidScriptEditorCurrentGet()?.close();
  document.body.replaceChildren();
  localStorage.clear();
});

describe('SolidScript editor: dragging a command from the palette into the script', () => {
  it('inserts the command before the line the marker shows', () => {
    const { commands } = editorFixture(LINES);
    const result = paletteDrop('cylinder', 1, -1);
    expect(result).toEqual({ entered: true, over: true, dropped: true, marker: ['1:before'] });
    tool('OK').click();
    expect(commands()).toEqual(['cube', 'cylinder', 'sphere']);
    expect(marked()).toEqual([]);
  });

  it('inserts the command after the line when the marker shows below it', () => {
    const { commands } = editorFixture(LINES);
    expect(paletteDrop('cylinder', 1, 5).marker).toEqual(['1:after']);
    tool('OK').click();
    expect(commands()).toEqual(['cube', 'sphere', 'cylinder']);
  });

  it('lands in the script, not in Favorites, after crossing the shown Favorites group', () => {
    const { commands } = editorFixture(LINES);
    const favorites = find('.solid-script-editor-palette-favorites');
    expect(favorites.hidden).toBe(false);
    const before = favorites.textContent;
    const data: Record<string, string> = {};
    const source = paletteEntry('cylinder');
    drag(source, 'dragstart', data);
    drag(favorites, 'dragenter', data, { relatedTarget: source });
    drag(favorites, 'dragover', data);
    drag(favorites, 'dragleave', data, { relatedTarget: list() });
    drag(list(), 'dragenter', data, { relatedTarget: favorites });
    drag(chip(0), 'dragenter', data, { relatedTarget: list() });
    drag(list(), 'dragleave', data, { relatedTarget: chip(0) });
    expect(drag(chip(0), 'dragover', data).defaultPrevented).toBe(true);
    expect(drag(chip(0), 'drop', data).defaultPrevented).toBe(true);
    drag(source, 'dragend', data);
    expect(favorites.style.outline).toBe('');
    tool('OK').click();
    expect(commands()).toEqual(['cylinder', 'cube', 'sphere']);
    expect(favorites.textContent).toBe(before);
  });

  it('inserts a palette drop instead of moving a line, and leaves a line drag moving lines', () => {
    const { commands } = editorFixture([{ command: 'cube' }, { command: 'sphere' }, { command: 'cylinder' }]);
    paletteDrop('cube', 2, -1);
    tool('OK').click();
    expect(commands()).toEqual(['cube', 'sphere', 'cube', 'cylinder']);
    const data: Record<string, string> = {};
    const row = find('[data-line="0"]');
    drag(row, 'dragstart', data);
    drag(chip(3), 'dragenter', data, { relatedTarget: row });
    expect(drag(chip(3), 'dragover', data, { clientY: 5 }).defaultPrevented).toBe(true);
    drag(chip(3), 'drop', data, { clientY: 5 });
    drag(row, 'dragend', data);
    expect(commands()).toEqual(['sphere', 'cube', 'cylinder', 'cube']);
  });
});
