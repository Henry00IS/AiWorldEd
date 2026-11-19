import { afterEach, describe, expect, it } from 'vitest';
import type { SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptEditorCurrentGet } from '@/solid_script/ui/solid_script_editor_open.js';
import { SOLID_SCRIPT_EDITOR_DRAG_COMMAND } from '@/solid_script/ui/solid_script_editor_palette.js';
import { SOLID_SCRIPT_EDITOR_DRAG_LINE } from '@/solid_script/ui/solid_script_editor_row.js';
import { chip, editorFixture, find, press, tool } from './solid_script_editor_fixture.js';

const LINES: SolidScriptLine[] = [{ command: 'cube' }, { command: 'sphere' }, { command: 'cylinder' }];

/**
 * Sends a drag event carrying the given data.
 *
 * @param element Target.
 * @param type Event type.
 * @param data Dragged data by type.
 * @param relatedTarget Element the pointer moves to, for enter and leave.
 */
function drag(
  element: Element,
  type: string,
  data: Record<string, string>,
  relatedTarget: EventTarget | null = null,
): void {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientY: -1, relatedTarget });
  Object.defineProperty(event, 'dataTransfer', {
    value: { types: Object.keys(data), files: [], getData: (kind: string) => data[kind] ?? '', dropEffect: 'none' },
  });
  element.dispatchEvent(event);
}

/**
 * Lines that show a drop marker.
 *
 * @returns Marked line indexes.
 */
function marked(): string[] {
  return [
    ...document.querySelectorAll<HTMLElement>(
      '.solid-script-editor-drop-before, .solid-script-editor-drop-after, .solid-script-editor-drop-into',
    ),
  ].map((row) => row.dataset['line'] ?? '');
}

/** Line list the drags go over. */
function list(): HTMLElement {
  return find('.solid-script-editor-lines');
}

/** A palette command, the source of command drags. */
function paletteItem(): HTMLElement {
  return find('.solid-script-editor-palette-item');
}

const COMMAND = { [SOLID_SCRIPT_EDITOR_DRAG_COMMAND]: 'sphere' };
const LINE = { [SOLID_SCRIPT_EDITOR_DRAG_LINE]: '0' };

/**
 * Drags over the list from the outside and onto a line.
 *
 * @param line Line index.
 * @param data Dragged data.
 */
function overLine(line: number, data: Record<string, string>): void {
  drag(list(), 'dragenter', data, document.body);
  drag(chip(line), 'dragenter', data, list());
  drag(chip(line), 'dragover', data);
}

afterEach(() => {
  solidScriptEditorCurrentGet()?.close();
  document.body.replaceChildren();
});

describe('SolidScript editor drop marker', () => {
  it('shows only while a command or line drag is over the script', () => {
    editorFixture(LINES);
    drag(chip(1), 'dragover', { 'text/plain': 'hello' });
    expect(marked()).toEqual([]);
    overLine(1, COMMAND);
    expect(marked()).toEqual(['1']);
  });

  it('stays while moving between lines and goes when the drag leaves the script', () => {
    editorFixture(LINES);
    overLine(0, COMMAND);
    drag(chip(1), 'dragenter', COMMAND, chip(0));
    drag(chip(0), 'dragleave', COMMAND, chip(1));
    drag(chip(1), 'dragover', COMMAND);
    expect(marked()).toEqual(['1']);
    drag(chip(1), 'dragleave', COMMAND, document.body);
    expect(marked()).toEqual([]);
  });

  it('goes when the drag leaves without telling where to, once every entered element is left', () => {
    editorFixture(LINES);
    overLine(2, COMMAND);
    drag(chip(2), 'dragleave', COMMAND);
    expect(marked()).toEqual(['2']);
    drag(list(), 'dragleave', COMMAND);
    expect(marked()).toEqual([]);
  });

  it('goes when the drag is cancelled: Escape, or released outside the script', () => {
    editorFixture(LINES);
    overLine(1, COMMAND);
    press(document.body, 'Escape');
    expect(marked()).toEqual([]);
    overLine(1, COMMAND);
    drag(paletteItem(), 'dragend', COMMAND);
    expect(marked()).toEqual([]);
  });

  it('goes after a drop on a place that does not take it', () => {
    const { commands } = editorFixture(LINES);
    overLine(1, COMMAND);
    drag(document.body, 'drop', COMMAND);
    expect(marked()).toEqual([]);
    expect(commands()).toEqual(['cube', 'sphere', 'cylinder']);
  });

  it('goes after a valid drop of a command', () => {
    editorFixture(LINES);
    overLine(1, COMMAND);
    drag(chip(1), 'drop', COMMAND);
    expect(marked()).toEqual([]);
    tool('Cancel').click();
    expect(marked()).toEqual([]);
  });

  it('uses the same marker for a dragged line: shown over the script, gone on leave, cancel and drop', () => {
    const { commands } = editorFixture(LINES);
    overLine(2, LINE);
    expect(marked()).toEqual(['2']);
    drag(chip(2), 'dragleave', LINE, document.body);
    expect(marked()).toEqual([]);
    overLine(2, LINE);
    drag(chip(0), 'dragend', LINE);
    expect(marked()).toEqual([]);
    overLine(2, LINE);
    drag(chip(2), 'drop', LINE);
    expect(marked()).toEqual([]);
    expect(commands()).toEqual(['sphere', 'cube', 'cylinder']);
  });
});
