import { afterEach, describe, expect, it, vi } from 'vitest';
import { modifierStackParametersCommit } from '@/modifier/stack/modifier_stack_parameters_commit.js';
import { type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import {
  chip,
  doubleClick,
  editorFixture,
  find,
  press,
  tool,
  scriptKey,
  type,
  drop,
  editorCleanup,
} from './solid_script_editor_fixture.js';
import { SOLID_SCRIPT_EDITOR_DRAG_LINE } from '@/solid_script/ui/solid_script_editor_row.js';

afterEach(editorCleanup);

describe('SolidScript editor undo history', () => {
  const VARIABLES: SolidScriptLine[] = ['a', 'b', 'c', 'd', 'e', 'f'].map((name) => ({
    command: 'variable',
    values: { name, value: '1' },
  }));
  const down = (line: number, init: MouseEventInit = {}) =>
    chip(line).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, ...init }));

  it('takes a drag of several lines back and forth in one step each', () => {
    const { script } = editorFixture(VARIABLES);
    const order = (): string =>
      script()
        .blocks.map((block) => block.values['name'])
        .join('');
    down(0);
    down(1, { shiftKey: true });
    down(1);
    drop(chip(5), { [SOLID_SCRIPT_EDITOR_DRAG_LINE]: '1' });
    expect(order()).toBe('cdeabf');
    // The dragged lines stay selected; a click without a drag picks one alone.
    down(3);
    chip(3).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    down(5, { ctrlKey: true });
    down(3);
    drop(chip(0), { [SOLID_SCRIPT_EDITOR_DRAG_LINE]: '3' });
    expect(order()).toBe('afcdeb');
    scriptKey('z');
    expect(order()).toBe('cdeabf');
    scriptKey('z');
    expect(order()).toBe('abcdef');
    scriptKey('y');
    expect(order()).toBe('cdeabf');
    scriptKey('y');
    expect(order()).toBe('afcdeb');
    scriptKey('z');
    scriptKey('z');
    expect(order()).toBe('abcdef');
  });

  it('undoes a configurator edit from the editor, while the configurator keeps undo to itself, never the level', () => {
    const { script, commandStack } = editorFixture(VARIABLES.slice(0, 2));
    const levelUndo = vi.spyOn(commandStack, 'undo');
    const reachedLevel = vi.fn();
    window.addEventListener('keydown', reachedLevel);
    const configure = (value: string): void => {
      doubleClick(chip(1));
      const inputs = [...find('[data-solid-script-configurator]').querySelectorAll<HTMLInputElement>('input')];
      type(inputs[1]!, value);
      tool('OK').click();
    };
    configure('7');
    expect(script().blocks[1]!.values['value']).toBe('7');
    scriptKey('z');
    expect(script().blocks[1]!.values['value']).toBe('1');
    scriptKey('y');
    expect(script().blocks[1]!.values['value']).toBe('7');
    doubleClick(chip(1));
    const window_ = find('[data-solid-script-configurator]');
    press(window_.querySelector('button')!, 'z', { ctrlKey: true });
    expect(script().blocks[1]!.values['value']).toBe('7');
    window.removeEventListener('keydown', reachedLevel);
    expect(reachedLevel).not.toHaveBeenCalled();
    expect(levelUndo).not.toHaveBeenCalled();
  });

  it('keeps the script history whole through a level undo between script edits', () => {
    const { script, node, stepId, commandStack } = editorFixture(VARIABLES.slice(0, 3));
    const names = (): string =>
      script()
        .blocks.map((block) => block.values['name'] ?? '_')
        .join('');
    press(chip(0), ' ');
    expect(names()).toBe('_abc');
    modifierStackParametersCommit(node, stepId, { inputs: { width: '3' } }, commandStack);
    press(chip(3), 'Delete');
    expect(names()).toBe('_ab');
    commandStack.undo();
    expect(names()).toBe('_ab');
    commandStack.redo();
    commandStack.undo();
    expect(names()).toBe('_ab');
    scriptKey('z');
    expect(names()).toBe('_abc');
    scriptKey('z');
    expect(names()).toBe('abc');
    scriptKey('y');
    scriptKey('y');
    expect(names()).toBe('_ab');
  });
});
