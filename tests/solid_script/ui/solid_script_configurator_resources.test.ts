import { describe, expect, it } from 'vitest';
import { solidScriptConfiguratorFieldBuild } from '@/solid_script/ui/solid_script_configurator_fields.js';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptDocumentNamesAt } from '@/solid_script/document/solid_script_document_names.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { curveFromPolyline } from '@/curve/model/curve_model.js';
import { solidScriptResourceCurve } from '@/solid_script/document/solid_script_resource.js';
import type { SolidScriptName } from '@/solid_script/document/solid_script_document_names.js';
import type { SolidScriptCommandParameter } from '@/solid_script/commands/solid_script_command.js';

/** Names of a script with one texture resource and two curve resources. */
const NAMES: SolidScriptName[] = [
  { name: '$Resources.Brick', category: 'Resources', line: 0, detail: 'texture resource', kinds: ['Texture'] },
  { name: '$Resources.Arch', category: 'Resources', line: 0, detail: 'curve resource', kinds: ['Curve'] },
  { name: '$Resources.Ramp', category: 'Resources', line: 0, detail: 'curve resource', kinds: ['Curve'] },
];

/**
 * Builds one field seeing the resources above.
 *
 * @param parameter Field.
 * @param value Stored text.
 * @returns Field.
 */
function build(parameter: SolidScriptCommandParameter, value: string) {
  const field = solidScriptConfiguratorFieldBuild(parameter, value, () => {}, { names: NAMES, extra: [] });
  document.body.replaceChildren(field.element);
  return field;
}

/**
 * Finds the first field of a command that has a curve.
 *
 * @returns Field.
 */
function curveParameter(): SolidScriptCommandParameter {
  return solidScriptCommandFind('column')!.parameters.find((parameter) => parameter.curve !== undefined)!;
}

describe('SolidScript fields picking resources', () => {
  it('lists texture resources in texture pickers and keeps picking them', () => {
    const field = build(solidScriptCommandFind('texture')!.parameters[0]!, '[$Resources.Brick]');
    const select = field.element.querySelector<HTMLSelectElement>('select')!;
    expect(select.hidden).toBe(false);
    expect([...select.options].map((option) => option.textContent)).toContain('[$Resources.Brick]');
    expect(select.value).toBe('[$Resources.Brick]');
    expect(field.read()).toBe('[$Resources.Brick]');
  });

  it('lists only curve resources in the curve resource picker and stores the picked one', () => {
    const field = build(curveParameter(), '');
    const select = field.element.querySelector<HTMLSelectElement>('select[aria-label$="resource"]')!;
    expect([...select.options].map((option) => option.value)).toEqual(['', '[$Resources.Arch]', '[$Resources.Ramp]']);
    select.value = '[$Resources.Ramp]';
    select.dispatchEvent(new Event('change'));
    expect(field.read()).toBe('[$Resources.Ramp]');
    select.value = '';
    select.dispatchEvent(new Event('change'));
    expect(field.read()).toBe('');
  });

  it('opens a stored curve resource in Pick mode with the resource selected', () => {
    const field = build(curveParameter(), '[$Resources.Arch]');
    const select = field.element.querySelector<HTMLSelectElement>('select[aria-label$="resource"]')!;
    expect(select.hidden).toBe(false);
    expect(select.value).toBe('[$Resources.Arch]');
  });

  it('gives the names of the script resources with their kinds', () => {
    const curve = curveFromPolyline([
      [0, 0],
      [1, 1],
    ]);
    const document = { ...solidScriptDocumentCreate([]), resources: [solidScriptResourceCurve('Arch', curve)] };
    const names = solidScriptDocumentNamesAt(document, 0).filter((name) => name.category === 'Resources');
    expect(names).toEqual([expect.objectContaining({ name: '$Resources.Arch', kinds: ['Curve'] })]);
  });
  it('shows the picked text at once after switching from Pick to Type, in curve and texture fields', () => {
    const drawn = (field: ReturnType<typeof build>) =>
      field.element.querySelector('.solid-script-editor-field-code-layer')?.textContent ?? '';
    const curve = build(curveParameter(), '');
    const select = curve.element.querySelector<HTMLSelectElement>('select[aria-label$="resource"]')!;
    select.value = '[$Resources.Ramp]';
    select.dispatchEvent(new Event('change'));
    curve.element.querySelector<HTMLButtonElement>('button[aria-pressed="false"]')!.click();
    expect(drawn(curve)).toBe('[$Resources.Ramp]');
    const texture = build(solidScriptCommandFind('texture')!.parameters[0]!, '[$Resources.Brick]');
    texture.element.querySelector<HTMLButtonElement>('button[aria-label="Type Texture"]')!.click();
    expect(drawn(texture)).toBe('[$Resources.Brick]');
  });
});
