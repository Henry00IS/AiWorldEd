import { afterEach, describe, expect, it } from 'vitest';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptConfiguratorFieldBuild } from '@/solid_script/ui/solid_script_configurator_fields.js';

/**
 * Finds a parameter of a command.
 *
 * @param command Command key.
 * @param key Parameter key.
 * @returns Parameter.
 */
function parameterOf(command: string, key: string) {
  return solidScriptCommandFind(command)!.parameters.find((parameter) => parameter.key === key)!;
}

afterEach(() => document.body.replaceChildren());

describe('SolidScript configurator focus', () => {
  it('keeps the focus where a drag started when it ends over another input', () => {
    const left = solidScriptConfiguratorFieldBuild(parameterOf('sweep_along_path', 'radius'), '1', () => {});
    const right = solidScriptConfiguratorFieldBuild(parameterOf('sweep_along_path', 'sides'), '8', () => {});
    document.body.append(left.element, right.element);
    const typed = right.element.querySelector<HTMLInputElement>('input')!;
    typed.focus();
    // Pressed in one input and let go over the other: the browser clicks what both share.
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.activeElement).toBe(typed);
  });

  it('does nothing when a caption is clicked', () => {
    const field = solidScriptConfiguratorFieldBuild(parameterOf('sweep_along_path', 'radius'), '1', () => {});
    document.body.append(field.element);
    const input = field.element.querySelector<HTMLInputElement>('input')!;
    field.element.querySelector<HTMLElement>('.solid-script-editor-field-label')!.click();
    expect(document.activeElement).not.toBe(input);
    expect(field.element.tagName).toBe('DIV');
  });
});
