import { describe, expect, it } from 'vitest';
import { solidScriptConfiguratorFieldBuild } from '@/solid_script/ui/solid_script_configurator_fields.js';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';

/**
 * Builds the Texture field of the Texture command.
 *
 * @param value Stored text.
 * @returns Field and its parts.
 */
function textureField(value: string) {
  const parameter = solidScriptCommandFind('texture')!.parameters[0]!;
  const field = solidScriptConfiguratorFieldBuild(parameter, value, () => {});
  document.body.replaceChildren(field.element);
  const select = field.element.querySelector<HTMLSelectElement>('select')!;
  const text = field.element.querySelector<HTMLInputElement>('input[type="text"]')!;
  const mode = (label: string) => field.element.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  return { field, select, text, mode };
}

describe('SolidScript texture fields', () => {
  it('pick a library texture with the shared texture picker, storing its full path', () => {
    const { field, select, text, mode } = textureField('stone/wall_01');
    expect(mode('Pick Texture').getAttribute('aria-pressed')).toBe('true');
    expect(select.hidden).toBe(false);
    expect(text.hidden).toBe(true);
    expect(select.value).toBe('stone/wall_01');
    expect(field.read()).toBe('stone/wall_01');
    select.value = 'default';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(field.read()).toBe('');
  });

  it('switch to typing for variables and formulas, and open typed when the text uses one', () => {
    const picked = textureField('stone/wall_01');
    picked.mode('Type Texture').click();
    expect(picked.text.hidden).toBe(false);
    expect(picked.select.hidden).toBe(true);
    expect(picked.text.value).toBe('stone/wall_01');
    picked.text.value = '[Wall]';
    expect(picked.field.read()).toBe('[Wall]');
    const typed = textureField('[Wall]');
    expect(typed.mode('Type Texture').getAttribute('aria-pressed')).toBe('true');
    expect(typed.field.read()).toBe('[Wall]');
  });
});
