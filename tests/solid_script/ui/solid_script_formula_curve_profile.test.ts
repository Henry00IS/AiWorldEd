import { describe, expect, it, vi } from 'vitest';
import { curveDecode, curveEncode } from '@/curve/model/curve_codec.js';
import { curveFromPolyline } from '@/curve/model/curve_model.js';
import {
  SOLID_SCRIPT_FORMULA_CHECK,
  solidScriptFormulaCatalog,
} from '@/solid_script/commands/solid_script_formula_commands.js';
import { solidScriptFormulaRead } from '@/solid_script/document/solid_script_formula_read.js';
import { solidScriptFormulaWrite } from '@/solid_script/document/solid_script_formula_write.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptFormulaStore } from '@/solid_script/language/solid_script_formula_field.js';
import { solidScriptFormulaTextQuote } from '@/solid_script/language/solid_script_formula_plain.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptConfiguratorFieldBuild } from '@/solid_script/ui/solid_script_configurator_fields.js';
import { solidScriptSuggestionContext, solidScriptSuggestions } from '@/solid_script/ui/solid_script_suggestions.js';

describe('CurveProfile in Formula Editor and autocomplete', () => {
  it('registers formula_check_curve_profile with a raw Curve picker and Side enum words', () => {
    const command = solidScriptFormulaCatalog().find(`${SOLID_SCRIPT_FORMULA_CHECK}curve_profile`);
    expect(command).toBeDefined();
    expect(command?.category).toBe('Curve');
    const curve = command?.parameters.find((entry) => entry.key === 'curve');
    expect(curve?.curve?.raw).toBe(true);
    expect(curve?.curve?.presets.length).toBeGreaterThan(0);
    const side = command?.parameters.find((entry) => entry.key === 'side');
    expect(side?.words?.map((entry) => entry.word)).toEqual(['Normal', 'Flipped', 'Mirrored']);
  });

  it('renders a Curve picker inside the formula editor field and round-trips raw curve JSON cleanly', () => {
    const command = solidScriptFormulaCatalog().find(`${SOLID_SCRIPT_FORMULA_CHECK}curve_profile`)!;
    const curveParam = command.parameters.find((entry) => entry.key === 'curve')!;
    const encoded = curveEncode(
      curveFromPolyline([
        [0, 1],
        [0.5, 0.5],
        [1, 0.2],
      ]),
    );

    const onChange = vi.fn();
    const field = solidScriptConfiguratorFieldBuild(curveParam, '', onChange);
    expect(field.element.querySelector('canvas')).not.toBeNull();
    expect(field.element.querySelector('button[aria-label="Pick Curve"]')?.getAttribute('aria-pressed')).toBe('true');

    const withCurve = solidScriptConfiguratorFieldBuild(curveParam, encoded, onChange);
    expect(withCurve.element.querySelector('button[aria-label="Pick Curve"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(withCurve.read()).toBe(encoded);
    expect(curveDecode(withCurve.read())).not.toBeNull();

    const parsed = solidScriptFormulaRead(
      `CurveProfile(${solidScriptFormulaTextQuote(encoded)}, 0.15, 0.03, "Flipped", 12)`,
    );
    expect(parsed.document.blocks[0]?.command).toBe(`${SOLID_SCRIPT_FORMULA_CHECK}curve_profile`);
    expect(parsed.document.blocks[0]?.values['curve']).toBe(encoded);
    expect(parsed.document.blocks[0]?.values['side']).toBe('Flipped');

    const written = solidScriptFormulaWrite(parsed.document, parsed);
    expect('text' in written && written.text).toContain('CurveProfile(');
    expect('text' in written && written.text).toContain('"Flipped"');
    if ('text' in written) {
      const stored = solidScriptFormulaStore('points2', written.text, '');
      const swept = solidScriptProgramRun(
        solidScriptDocumentCreate([
          { command: 'line_path', values: { from: '0, 0, 0', to: '2, 0, 0', count: '2', into: 'Rail' } },
          { command: 'sweep_along_path', values: { path: '[Rail]', profile: stored, up: '0, 1, 0' } },
        ]),
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
