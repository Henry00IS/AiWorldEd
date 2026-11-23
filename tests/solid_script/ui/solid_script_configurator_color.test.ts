import { afterEach, describe, expect, it } from 'vitest';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptConfiguratorFieldBuild } from '@/solid_script/ui/solid_script_configurator_fields.js';

/**
 * Builds the Color field of a Widget Slider on the page.
 *
 * @param value Stored field text.
 * @returns Field, its colour swatch and its text input.
 */
function colorField(value: string) {
  const parameter = solidScriptCommandFind('widget_slider')!.parameters.find((each) => each.key === 'color')!;
  const field = solidScriptConfiguratorFieldBuild(parameter, value, () => {});
  document.body.append(field.element);
  const swatch = field.element.querySelector<HTMLInputElement>('input[type="color"]');
  const text = field.element.querySelector<HTMLInputElement>('input[type="text"]');
  return { field, swatch, text };
}

afterEach(() => document.body.replaceChildren());

describe('SolidScript Color field', () => {
  it('shows a colour picker beside the text, set to the colour a name or hex gives', () => {
    expect(colorField('Orange').swatch?.value).toBe('#ff8c1a');
    expect(colorField('#3a8').swatch?.value).toBe('#33aa88');
    expect(colorField('Orange').swatch?.getAttribute('aria-label')).toBe('Pick Color');
  });

  it('writes the picked colour as hex, and follows typed text', () => {
    const { field, swatch, text } = colorField('');
    if (!swatch || !text) throw new Error('no color field');
    swatch.value = '#123456';
    swatch.dispatchEvent(new Event('input', { bubbles: true }));
    expect(field.read()).toBe('#123456');
    text.value = 'Blue';
    text.dispatchEvent(new Event('input', { bubbles: true }));
    expect(swatch.value).toBe('#3d8fd6');
    expect(field.problem()).toBe('');
    expect(field.warning()).toBe('');
  });

  it('marks a value that is not a colour, and leaves variables to the run', () => {
    expect(colorField('sparkly').field.warning()).toContain('Color');
    expect(colorField('[Tint]').field.problem()).toBe('');
  });
});
