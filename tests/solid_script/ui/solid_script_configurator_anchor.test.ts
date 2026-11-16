import { afterEach, describe, expect, it } from 'vitest';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptConfiguratorFieldBuild } from '@/solid_script/ui/solid_script_configurator_fields.js';

/**
 * Finds the Anchor parameter of a command.
 *
 * @param command Command key.
 * @returns Parameter.
 */
function anchorOf(command: string) {
  return solidScriptCommandFind(command)!.parameters.find((parameter) => parameter.key === 'anchor')!;
}

afterEach(() => document.body.replaceChildren());

describe('SolidScript anchor fields', () => {
  it('shows one choice per axis with Title Case words and stores them as one text', () => {
    const field = solidScriptConfiguratorFieldBuild(anchorOf('cube'), 'center, bottom, center', () => {});
    document.body.append(field.element);
    const selects = [...field.element.querySelectorAll('select')];
    expect(selects.map((select) => select.getAttribute('aria-label'))).toEqual(['Anchor X', 'Anchor Y', 'Anchor Z']);
    expect(selects.map((select) => [...select.options].map((option) => option.text))).toEqual([
      ['Left', 'Center', 'Right'],
      ['Bottom', 'Center', 'Top'],
      ['Back', 'Center', 'Front'],
    ]);
    expect(field.read()).toBe('Center, Bottom, Center');
    selects[2]!.value = 'Back';
    expect(field.read()).toBe('Center, Bottom, Back');
    expect(solidScriptConfiguratorFieldBuild(anchorOf('square'), 'Left, Front', () => {}).read()).toBe('Left, Front');
  });

  it('types a variable or a wrong value as text and points out the wrong one', () => {
    const typed = solidScriptConfiguratorFieldBuild(anchorOf('cube'), '[Where]', () => {});
    expect(typed.element.querySelector('select')).toBeNull();
    expect(typed.problem()).toBe('');
    expect(solidScriptConfiguratorFieldBuild(anchorOf('cube'), 'Up, Center', () => {}).problem()).toContain(
      'needs 3 words',
    );
  });
});
