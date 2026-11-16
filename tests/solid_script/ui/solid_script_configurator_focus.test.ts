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
    const field = solidScriptConfiguratorFieldBuild(parameterOf('translate', 'v'), '1, 2, 3', () => {});
    document.body.append(field.element);
    const [x, , z] = [...field.element.querySelectorAll<HTMLInputElement>('input:not([hidden])')];
    z!.focus();
    // Pressed in Z and let go over X: the browser clicks the row both share.
    field.element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.activeElement).toBe(z);
    expect(x).not.toBe(document.activeElement);
  });

  it('does nothing when a caption is clicked', () => {
    const field = solidScriptConfiguratorFieldBuild(parameterOf('curve_to_mesh', 'closed'), 'false', () => {});
    document.body.append(field.element);
    const box = field.element.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    field.element.querySelector<HTMLElement>('.solid-script-editor-field-label')!.click();
    expect(box.checked).toBe(false);
    expect(document.activeElement).not.toBe(box);
    expect(field.element.tagName).toBe('DIV');
  });

  it('uses the editor toggle button for one Vector, pressed while on', () => {
    const field = solidScriptConfiguratorFieldBuild(parameterOf('translate', 'v'), '[Edge.Middle]', () => {});
    const toggle = field.element.querySelector<HTMLButtonElement>('button[aria-label="Offset As One Vector"]')!;
    expect(toggle.className).toBe('solid-script-editor-tool');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });
});
