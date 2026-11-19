import { afterEach, describe, expect, it } from 'vitest';
import type { SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptEditorCurrentGet } from '@/solid_script/ui/solid_script_editor_open.js';
import { chip, editorFixture, find, press } from './solid_script_editor_fixture.js';

const END: SolidScriptLine = { command: 'end' };

/**
 * A Variable line, named so the order reads at a glance.
 *
 * @param name Name.
 * @returns Line.
 */
function variable(name: string): SolidScriptLine {
  return { command: 'variable', values: { name, value: '1' } };
}

/**
 * Drags a line and drops it before another line.
 *
 * @param from Dragged line.
 * @param before Line it lands before.
 */
function dragLine(from: number, before: number): void {
  const data: Record<string, string> = {};
  const start = new MouseEvent('dragstart', { bubbles: true, cancelable: true });
  Object.defineProperty(start, 'dataTransfer', {
    value: { setData: (kind: string, value: string) => void (data[kind] = value), effectAllowed: 'all' },
  });
  find(`[data-line="${from}"]`).dispatchEvent(start);
  const drop = new MouseEvent('drop', { bubbles: true, cancelable: true, clientY: -1 });
  Object.defineProperty(drop, 'dataTransfer', {
    value: { types: Object.keys(data), files: [], getData: (kind: string) => data[kind] ?? '' },
  });
  chip(before).dispatchEvent(drop);
}

/**
 * Presses a line.
 *
 * @param line Line index.
 * @param init Modifier keys.
 */
function down(line: number, init: MouseEventInit = {}): void {
  chip(line).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, ...init }));
}

/**
 * Lines that are selected or current.
 *
 * @param count Line count.
 * @returns Marked line indexes.
 */
function marked(count: number): number[] {
  return Array.from({ length: count }, (_, line) => line).filter((line) =>
    ['solid-script-editor-selected', 'solid-script-editor-current'].some((name) =>
      find(`[data-line="${line}"]`).classList.contains(name),
    ),
  );
}

/** Presses Ctrl+Z in the script. */
function undo(): void {
  press(find('[data-solid-script-editor] .solid-script-editor-lines'), 'z', { ctrlKey: true });
}

afterEach(() => {
  solidScriptEditorCurrentGet()?.close();
  document.body.replaceChildren();
});

describe('SolidScript editor row drag', () => {
  it('moves only the opener when it is dragged, leaving its End, and undoes in one step', () => {
    const { commands } = editorFixture([
      { command: 'transform' },
      { command: 'cube' },
      END,
      { command: 'sphere' },
      { command: 'cylinder' },
    ]);
    down(0);
    dragLine(0, 4);
    expect(commands()).toEqual(['cube', 'end', 'sphere', 'transform', 'cylinder']);
    expect(marked(5)).toEqual([3]);
    undo();
    expect(commands()).toEqual(['transform', 'cube', 'end', 'sphere', 'cylinder']);
  });

  it('moves an End or Else line on its own', () => {
    const { commands } = editorFixture([
      { command: 'sphere' },
      { command: 'if', values: { condition: 'yes' } },
      { command: 'cube' },
      { command: 'else' },
      { command: 'cylinder' },
      END,
    ]);
    down(5);
    dragLine(5, 0);
    expect(commands()).toEqual(['end', 'sphere', 'if', 'cube', 'else', 'cylinder']);
    down(4);
    dragLine(4, 2);
    expect(commands()).toEqual(['end', 'sphere', 'else', 'if', 'cube', 'cylinder']);
  });

  it('moves several picked lines together, closing their gaps, and keeps them selected', () => {
    const { script } = editorFixture(['a', 'b', 'c', 'd', 'e'].map(variable));
    const order = (): string =>
      script()
        .blocks.map((block) => block.values['name'])
        .join('');
    down(0);
    down(2, { ctrlKey: true });
    down(2);
    dragLine(2, 4);
    expect(order()).toBe('bdace');
    expect(marked(5)).toEqual([2, 3]);
    undo();
    expect(order()).toBe('abcde');
  });

  it('moves only the selected lines when a picked opener is dragged with another line', () => {
    const { commands } = editorFixture([
      { command: 'sphere' },
      { command: 'transform' },
      { command: 'cube' },
      END,
      { command: 'cylinder' },
    ]);
    down(4);
    down(1, { ctrlKey: true });
    down(1);
    dragLine(1, 0);
    expect(commands()).toEqual(['transform', 'cylinder', 'sphere', 'cube', 'end']);
    expect(marked(5)).toEqual([0, 1]);
  });

  it('moves an opener or End alone with the keyboard', () => {
    const { commands } = editorFixture([{ command: 'transform' }, { command: 'cube' }, END, { command: 'sphere' }]);
    press(chip(0), 'ArrowDown', { ctrlKey: true, shiftKey: true });
    expect(commands()).toEqual(['cube', 'transform', 'end', 'sphere']);
    press(chip(2), 'ArrowDown', { ctrlKey: true, shiftKey: true });
    expect(commands()).toEqual(['cube', 'transform', 'sphere', 'end']);
  });
});
