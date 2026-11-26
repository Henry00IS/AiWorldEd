import { describe, expect, it, vi } from 'vitest';
import {
  SOLID_SCRIPT_FORMULA_CHECK,
  solidScriptFormulaCatalog,
} from '@/solid_script/commands/solid_script_formula_commands.js';
import { solidScriptFormulaRead } from '@/solid_script/document/solid_script_formula_read.js';
import { solidScriptFormulaWrite } from '@/solid_script/document/solid_script_formula_write.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptFormulaStore } from '@/solid_script/language/solid_script_formula_field.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptConfiguratorFieldBuild } from '@/solid_script/ui/solid_script_configurator_fields.js';
import { SolidScriptConfiguratorCurves } from '@/solid_script/ui/solid_script_configurator_curves.js';
import { solidScriptDocumentResourcesWith } from '@/solid_script/document/solid_script_resource.js';
import { solidScriptSuggestionContext, solidScriptSuggestions } from '@/solid_script/ui/solid_script_suggestions.js';

describe('CurveProfile in Formula Editor and autocomplete', () => {
  it('registers formula_check_curve_profile with a Curve picker and Side enum words', () => {
    const command = solidScriptFormulaCatalog().find(`${SOLID_SCRIPT_FORMULA_CHECK}curve_profile`);
    expect(command).toBeDefined();
    expect(command?.category).toBe('Curve');
    const curve = command?.parameters.find((entry) => entry.key === 'curve');
    expect(curve?.curve?.presets.length).toBeGreaterThan(0);
    const side = command?.parameters.find((entry) => entry.key === 'side');
    expect(side?.words?.map((entry) => entry.word)).toEqual(['Normal', 'Flipped', 'Mirrored']);
  });

  it('renders a Curve picker inside the formula editor field and keeps a new curve as a resource', () => {
    const command = solidScriptFormulaCatalog().find(`${SOLID_SCRIPT_FORMULA_CHECK}curve_profile`)!;
    const curveParam = command.parameters.find((entry) => entry.key === 'curve')!;
    const onChange = vi.fn();
    const curves = new SolidScriptConfiguratorCurves([]);
    const field = solidScriptConfiguratorFieldBuild(curveParam, '', onChange, { names: [], extra: [], curves });
    expect(field.element.querySelector('canvas')).not.toBeNull();
    expect(field.element.querySelector('button[aria-label="Pick Curve"]')?.getAttribute('aria-pressed')).toBe('true');

    const select = field.element.querySelector<HTMLSelectElement>('select[aria-label="Curve resource"]')!;
    select.value = '+';
    select.dispatchEvent(new Event('change'));
    expect(field.read()).toBe('[$Resources.Curve]');
    const resources = curves.changed()!;
    expect(resources.map((resource) => resource.name)).toEqual(['Curve']);
    expect(select.value).toBe('[$Resources.Curve]');

    const parsed = solidScriptFormulaRead('CurveProfile([$Resources.Curve], 0.15, 0.03, "Flipped", 12)');
    expect(parsed.document.blocks[0]?.command).toBe(`${SOLID_SCRIPT_FORMULA_CHECK}curve_profile`);
    expect(parsed.document.blocks[0]?.values['curve']).toBe('[$Resources.Curve]');
    expect(parsed.document.blocks[0]?.values['side']).toBe('Flipped');

    const written = solidScriptFormulaWrite(parsed.document, parsed);
    expect('text' in written && written.text).toContain('CurveProfile(');
    expect('text' in written && written.text).toContain('"Flipped"');
    if ('text' in written) {
      const stored = solidScriptFormulaStore('points2', written.text, '');
      const swept = solidScriptProgramRun(
        solidScriptDocumentResourcesWith(
          solidScriptDocumentCreate([
            { command: 'line_path', values: { from: '0, 0, 0', to: '2, 0, 0', count: '2', into: 'Rail' } },
            { command: 'sweep_along_path', values: { path: '[Rail]', profile: stored, up: '0, 1, 0' } },
          ]),
          resources,
        ),
      );
      expect(swept.error).toBeNull();
      expect(swept.shapes.length).toBeGreaterThan(0);
    }
  });

  it('suggests Normal, Flipped, and Mirrored in inline formula autocomplete for CurveProfile side', () => {
    const text = '[=CurveProfile([Moulding], 0.12, 0.02, ';
    const context = solidScriptSuggestionContext(text, text.length, false);
    const labels = solidScriptSuggestions(context, { names: [], extra: [], words: [] }).map((entry) => entry.label);
    expect(labels).toEqual(expect.arrayContaining(['"Normal"', '"Flipped"', '"Mirrored"']));
  });
});
