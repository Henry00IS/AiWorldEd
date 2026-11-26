import { afterEach, describe, expect, it, vi } from 'vitest';
import { SOLID_SCRIPT_EDITOR_CHECK_DELAY_MS } from '@/solid_script/ui/solid_script_editor_output.js';
import { solidScriptDebugStepLimit } from '@/solid_script/debug/solid_script_debug_steps.js';
import {
  chip,
  doubleClick,
  editorFixture,
  explorerRows,
  find,
  press,
  tool,
  type,
  editorCleanup,
  CUBE_SPHERE,
} from './solid_script_editor_fixture.js';

afterEach(editorCleanup);

describe('SolidScript editor runs and debugging', () => {
  it('shows how often each line ran beside it', () => {
    editorFixture([
      { command: 'repeat', values: { variable: 'i', from: '1', to: '6' } },
      { command: 'cube', values: { size: '0.2, 0.2, 0.2' } },
      { command: 'end' },
      { command: 'sphere' },
    ]);
    const runs = (line: number) => find(`[data-line="${line}"] .solid-script-editor-runs`);
    expect(runs(1).textContent).toBe('×5');
    expect(runs(1).title).toMatch(/^Ran 5 times/);
    expect(runs(0).textContent).toBe('');
    expect(runs(3).textContent).toBe('');
    expect(runs(3).title).toMatch(/^Ran once/);
  });

  it('shows errors with their line', () => {
    const { root } = editorFixture([{ command: 'cube' }, { command: 'sphere', values: { r: '1 +' } }]);
    expect(root.querySelector('.solid-script-editor-output-text')?.textContent).toMatch(/^Line 2/);
    expect(root.querySelector('[data-line="1"]')?.classList.contains('solid-script-editor-failed')).toBe(true);
  });

  it('runs an empty block and shows a warning in the output that leads to its line', () => {
    const { root } = editorFixture([{ command: 'cube' }, { command: 'texture' }, { command: 'end' }]);
    const output = find('.solid-script-editor-output-text');
    expect(output.classList.contains('solid-script-editor-output-error')).toBe(false);
    expect(output.textContent).toMatch(/^1 solid/);
    const warning = find('.solid-script-editor-output-warning');
    expect(warning.textContent).toBe('⚠️ Line 2: Texture has nothing inside, so it does nothing.');
    expect(root.querySelector('[data-line="1"]')?.classList.contains('solid-script-editor-failed')).toBe(false);
    warning.querySelector<HTMLButtonElement>('button')!.click();
    expect(document.activeElement).toBe(chip(1));
  });

  it('steps through the solids, shows the variables of the step, traces passed lines and stops', () => {
    const { root, node, stepId } = editorFixture([
      { command: 'variable', values: { name: 'width', value: '2' } },
      { command: 'repeat', values: { variable: 'i', from: '0', to: '2', step: '1' } },
      { command: 'cube', values: { size: '[width]' } },
      { command: 'end' },
    ]);
    tool('Trace').click();
    tool('Step').click();
    expect(solidScriptDebugStepLimit(node, stepId)).toBe(1);
    tool('Step').click();
    expect(root.querySelector('.solid-script-editor-stepped')?.getAttribute('data-line')).toBe('2');
    expect(
      [...root.querySelectorAll('.solid-script-editor-traced')].map((row) => row.getAttribute('data-line')),
    ).toEqual(['0', '1', '2']);
    expect(root.querySelector('.solid-script-editor-stepped')?.getAttribute('title')).toMatch(/^Debugger step/);
    expect(root.querySelector('.solid-script-editor-stepped')?.classList.contains('solid-script-editor-current')).toBe(
      false,
    );
    expect(root.textContent).toContain('Step 2 of 2');
    find<HTMLButtonElement>('[data-tab="variables"]').click();
    find<HTMLButtonElement>('[data-category="Current"]').click();
    expect(explorerRows()).toEqual(['width|2|Whole Number|1', 'i|1|Whole Number|2']);
    tool('Stop').click();
    expect(solidScriptDebugStepLimit(node, stepId)).toBeUndefined();
    expect(root.querySelector('.solid-script-editor-stepped')).toBeNull();
  });

  it('runs to the line at the cursor with Ctrl+F10, inside blocks too', () => {
    const { root, node, stepId } = editorFixture([
      { command: 'cube' },
      { command: 'repeat', values: { variable: 'i', from: '0', to: '3', step: '1' } },
      { command: 'sphere' },
      { command: 'end' },
      { command: 'cylinder' },
      { command: 'note', values: { text: 'done' } },
    ]);
    chip(4).focus();
    press(chip(4), 'F10', { ctrlKey: true });
    expect(solidScriptDebugStepLimit(node, stepId)).toBe(5);
    expect(root.querySelector('.solid-script-editor-stepped')?.getAttribute('data-line')).toBe('4');
    chip(1).focus();
    press(chip(1), 'F10', { ctrlKey: true });
    expect(solidScriptDebugStepLimit(node, stepId)).toBe(2);
    chip(5).focus();
    press(chip(5), 'F10', { ctrlKey: true });
    expect(root.textContent).toContain('Line 6 builds no solid');
    expect(solidScriptDebugStepLimit(node, stepId)).toBe(2);
  });

  it('clears the step mark when Debug finishes, and Start builds the whole script at once', () => {
    vi.useFakeTimers();
    try {
      const { root, node, stepId } = editorFixture([{ command: 'cube' }, { command: 'sphere' }]);
      tool('Debug').click();
      expect(tool('Pause')).toBeTruthy();
      vi.advanceTimersByTime(400);
      expect(root.querySelector('.solid-script-editor-stepped')?.getAttribute('data-line')).toBe('0');
      vi.advanceTimersByTime(2000);
      expect(root.querySelector('.solid-script-editor-stepped')).toBeNull();
      expect(root.querySelector('.solid-script-editor-traced')).toBeNull();
      expect(solidScriptDebugStepLimit(node, stepId)).toBeUndefined();
      tool('Step').click();
      expect(solidScriptDebugStepLimit(node, stepId)).toBe(1);
      tool('Start').click();
      expect(solidScriptDebugStepLimit(node, stepId)).toBeUndefined();
      expect(root.querySelector('.solid-script-editor-stepped')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses breakpoints set or cleared while paused right away', () => {
    const { root, node, stepId } = editorFixture([
      { command: 'sphere' },
      { command: 'repeat', values: { variable: 'i', from: '0', to: '3' } },
      { command: 'cube', values: { size: '[=[i] + 1], 1, 1' } },
      { command: 'end' },
      { command: 'sphere' },
    ]);
    const gutter = (line: number) => find(`[data-line="${line}"] .solid-script-editor-gutter`).click();
    gutter(2);
    tool('Start').click();
    expect(root.textContent).toContain('Stopped at the breakpoint on line 3, before it runs');
    gutter(2);
    tool('Start').click();
    expect(solidScriptDebugStepLimit(node, stepId)).toBeUndefined();
    gutter(2);
    tool('Start').click();
    expect(solidScriptDebugStepLimit(node, stepId)).toBe(1);
    gutter(4);
    gutter(2);
    tool('Start').click();
    expect(root.textContent).toContain('Stopped at the breakpoint on line 5, before it runs');
    expect(solidScriptDebugStepLimit(node, stepId)).toBe(4);
  });

  it('sets a breakpoint from the gutter or F9; Start pauses before that line with its variables, then continues', () => {
    const { root, node, stepId } = editorFixture([
      { command: 'sphere' },
      { command: 'repeat', values: { variable: 'i', from: '0', to: '2' } },
      { command: 'cube', values: { size: '[=[i] + 1], 1, 1' } },
      { command: 'end' },
      { command: 'note', values: { text: 'Done' } },
    ]);
    find('[data-line="2"] .solid-script-editor-gutter').click();
    expect(find('[data-line="2"]').classList.contains('solid-script-editor-breakpoint')).toBe(true);
    press(chip(4), 'F9');
    expect(find('[data-line="4"]').classList.contains('solid-script-editor-breakpoint')).toBe(false);
    expect(root.textContent).toContain('cannot hold a breakpoint');
    tool('Start').click();
    expect(solidScriptDebugStepLimit(node, stepId)).toBe(1);
    const paused = find('[data-line="2"]');
    expect(paused.classList.contains('solid-script-editor-stepped')).toBe(true);
    expect(paused.title).toMatch(/^Paused at this breakpoint/);
    expect(root.textContent).toContain('Stopped at the breakpoint on line 3, before it runs');
    find<HTMLButtonElement>('[data-category="Current"]').click();
    const variables = () => explorerRows().map((row) => row.split('|').slice(0, 2).join('='));
    expect(variables()).toEqual(['i=0']);
    expect(tool('Continue')).toBeTruthy();
    tool('Start').click();
    expect(solidScriptDebugStepLimit(node, stepId)).toBe(2);
    expect(variables()).toEqual(['i=1']);
    tool('Step').click();
    expect(solidScriptDebugStepLimit(node, stepId)).toBe(3);
    expect(tool('Debug')).toBeTruthy();
    tool('Start').click();
    expect(solidScriptDebugStepLimit(node, stepId)).toBeUndefined();
    expect(root.querySelector('.solid-script-editor-stepped')).toBeNull();
  });

  it('does not warn after a pause when a modifier reads Box values, because the volume is the box', async () => {
    const { root } = editorFixture(CUBE_SPHERE);
    const output = () => root.querySelector('.solid-script-editor-output-text')?.textContent ?? '';
    find<HTMLButtonElement>('[role="tab"][data-tab="settings"]').click();
    const modifier = find<HTMLInputElement>('[data-solid-script-settings] [data-solid-script-use="modifier"]');
    modifier.checked = true;
    modifier.dispatchEvent(new Event('change'));
    doubleClick(chip(0));
    const size = find<HTMLInputElement>('[data-solid-script-configurator="cube"] input[type="text"]');
    type(size, '[$Box.Width], 1, 1');
    tool('OK').click();
    expect(output()).not.toContain('If Used As Generator');
    await new Promise((resolve) => setTimeout(resolve, SOLID_SCRIPT_EDITOR_CHECK_DELAY_MS + 50));
    expect(output()).not.toContain('If Used As Generator');
    expect(output()).not.toContain('only a generator');
  });

  it('pauses at a breakpoint inside a Function and shows the call stack with its locals', () => {
    const { root } = editorFixture([
      { command: 'function', values: { name: 'post', parameters: 'H' } },
      { command: 'cube', values: { size: '1, 1, [$Local.H]' } },
      { command: 'end' },
      { command: 'call', values: { name: 'post', values: '3' } },
    ]);
    find('[data-line="1"] .solid-script-editor-gutter').click();
    tool('Start').click();
    expect(root.textContent).toContain('Stopped at the breakpoint on line 2, before it runs');
    find<HTMLButtonElement>('[data-category="Call Stack"]').click();
    expect(find('.solid-script-editor-stack-frame').textContent).toBe('post()called on line 4');
    expect(explorerRows()).toEqual(['$Local.H|3|Whole Number|1']);
  });

  it('keeps a breakpoint on its line when the line moves', () => {
    const { commands } = editorFixture([{ command: 'cube' }, { command: 'sphere' }, { command: 'cylinder' }]);
    press(chip(2), 'F9');
    expect(find('[data-line="2"]').classList.contains('solid-script-editor-breakpoint')).toBe(true);
    press(chip(2), 'ArrowUp', { ctrlKey: true, shiftKey: true });
    expect(commands()).toEqual(['cube', 'cylinder', 'sphere']);
    expect(find('[data-line="1"]').classList.contains('solid-script-editor-breakpoint')).toBe(true);
    expect(find('[data-line="2"]').classList.contains('solid-script-editor-breakpoint')).toBe(false);
  });

  it('pauses Debug at a breakpoint and continues playing from it', () => {
    vi.useFakeTimers();
    try {
      const { root, node, stepId } = editorFixture([
        { command: 'cube' },
        { command: 'sphere' },
        { command: 'cylinder' },
      ]);
      press(chip(1), 'F9');
      tool('Debug').click();
      vi.advanceTimersByTime(400 * 3);
      expect(solidScriptDebugStepLimit(node, stepId)).toBe(1);
      expect(root.querySelector('.solid-script-editor-stepped')?.getAttribute('data-line')).toBe('1');
      vi.advanceTimersByTime(400 * 3);
      expect(solidScriptDebugStepLimit(node, stepId)).toBe(1);
      tool('Continue').click();
      vi.advanceTimersByTime(400 * 10);
      expect(solidScriptDebugStepLimit(node, stepId)).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
