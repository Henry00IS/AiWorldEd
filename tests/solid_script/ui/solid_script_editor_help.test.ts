import { describe, expect, it, vi } from 'vitest';
import { solidScriptEditorLinked } from '@/solid_script/ui/solid_script_editor_links.js';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { SolidScriptEditorHelp } from '@/solid_script/ui/solid_script_editor_help.js';
import { SOLID_SCRIPT_COMMAND_CATALOG } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptFormulaCatalog } from '@/solid_script/commands/solid_script_formula_commands.js';
import { solidScriptEditorStylesheetEnsure } from '@/solid_script/ui/solid_script_editor_css.js';

describe('SolidScript help panel', () => {
  it('shows a short summary first and keeps the manual under More Details, open for the next command', () => {
    const help = new SolidScriptEditorHelp();
    const cube = solidScriptCommandFind('cube')!;
    help.show(cube, null);
    const more = help.element.querySelector('details')!;
    expect(more.open).toBe(false);
    expect(more.querySelector('summary')?.textContent).toBe('More Details');
    expect(more.textContent).toContain(cube.manual);
    expect(help.element.textContent?.indexOf(cube.description)).toBeLessThan(
      help.element.textContent?.indexOf('More Details') ?? 0,
    );
    more.open = true;
    more.dispatchEvent(new Event('toggle'));
    help.show(solidScriptCommandFind('sphere')!, null);
    expect(help.element.querySelector('details')?.open).toBe(true);
  });

  it('links every mention of another command, but not the command itself or prose at the start of a sentence', () => {
    const open = vi.fn();
    const element = solidScriptEditorLinked(
      document.createElement('p'),
      'If the list is empty, Set [X] to 1. Put Input Brushes inside a Repeat. Cubes stay. Set [Y] to 2.',
      open,
      'repeat',
    );
    const links = [...element.querySelectorAll<HTMLAnchorElement>('a')];
    expect(links.map((link) => link.dataset['command'])).toEqual(['variable', 'input_brushes', 'variable']);
    expect(element.textContent).toBe(
      'If the list is empty, Set [X] to 1. Put Input Brushes inside a Repeat. Cubes stay. Set [Y] to 2.',
    );
    links[1]!.click();
    expect(open).toHaveBeenCalledWith('input_brushes');
  });

  it('turns the mentions in the manual, the value hints and the stops into links', () => {
    const open = vi.fn();
    const help = new SolidScriptEditorHelp(open);
    help.show(solidScriptCommandFind('repeat')!, null);
    const linked = [...help.element.querySelectorAll<HTMLAnchorElement>('a')].map((link) => link.dataset['command']);
    expect(linked).toContain('transform');
    expect(linked).toContain('cube');
    expect(linked).not.toContain('repeat');
    help.element.querySelector<HTMLAnchorElement>('a[data-command="transform"]')!.click();
    expect(open).toHaveBeenCalledWith('transform');
  });

  it('lines up the docs of every block on the left, a long Note too', () => {
    solidScriptEditorStylesheetEnsure();
    const help = new SolidScriptEditorHelp();
    document.body.append(help.element);
    const text = 'A long note about what the next lines build, long enough to wrap in the panel.';
    for (const command of [...SOLID_SCRIPT_COMMAND_CATALOG.commands, ...solidScriptFormulaCatalog().commands]) {
      const values = command.id === 'note' ? { text } : command.valuesDefault();
      help.show(command, { id: '1', command: command.id, values });
      const aligned = [...help.element.querySelectorAll<HTMLElement>('*')].map(
        (element) => getComputedStyle(element).textAlign,
      );
      expect(
        aligned.filter((align) => !['', 'start', 'left', 'match-parent'].includes(align)),
        command.id,
      ).toEqual([]);
    }
    help.element.remove();
  });
});
