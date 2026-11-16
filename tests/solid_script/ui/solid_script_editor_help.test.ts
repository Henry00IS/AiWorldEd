import { describe, expect, it } from 'vitest';
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
});
