import { describe, expect, it, vi } from 'vitest';
import { solidScriptEditorLinked } from '@/solid_script/ui/solid_script_editor_links.js';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { SolidScriptEditorHelp } from '@/solid_script/ui/solid_script_editor_help.js';

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
    expect(linked).toContain('translate');
    expect(linked).toContain('cube');
    expect(linked).not.toContain('repeat');
    help.element.querySelector<HTMLAnchorElement>('a[data-command="translate"]')!.click();
    expect(open).toHaveBeenCalledWith('translate');
  });
});
