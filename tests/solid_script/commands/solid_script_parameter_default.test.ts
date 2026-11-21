import { describe, expect, it } from 'vitest';
import { solidScriptCommandFind, solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';
import {
  solidScriptCommandValuesStored,
  solidScriptParameterAllowsEmpty,
  solidScriptParameterPlaceholder,
  solidScriptParameterTextNormalized,
  solidScriptParameterValueIsDefault,
  solidScriptParameterValueStored,
} from '@/solid_script/commands/solid_script_parameter_default.js';
import { solidScriptFormulaCatalog } from '@/solid_script/commands/solid_script_formula_commands.js';
import { solidScriptConfiguratorProblem } from '@/solid_script/ui/solid_script_configurator_fields.js';

describe('SolidScript field defaults', () => {
  it('treats empty, folded and comma spacing as the same as the declared default', () => {
    expect(solidScriptParameterValueIsDefault('', 'Additive')).toBe(true);
    expect(solidScriptParameterValueIsDefault('Additive', 'Additive')).toBe(true);
    expect(solidScriptParameterValueIsDefault('additive', 'Additive')).toBe(true);
    expect(solidScriptParameterValueIsDefault('center,center,center', 'Center, Center, Center')).toBe(true);
    expect(solidScriptParameterValueIsDefault('Center,  Center, Center', 'Center, Center, Center')).toBe(true);
    expect(solidScriptParameterValueIsDefault('Subtractive', 'Additive')).toBe(false);
    expect(solidScriptParameterTextNormalized('Center,Center,Center')).toBe('center, center, center');
    expect(solidScriptParameterValueIsDefault('16.0', '16')).toBe(true);
    expect(solidScriptParameterValueIsDefault('2.0, 2.0, 2.0', '2, 2, 2')).toBe(true);
    expect(solidScriptParameterTextNormalized('16.0')).toBe('16');
    expect(solidScriptParameterTextNormalized('2.0,2.0,2.0')).toBe('2, 2, 2');
  });

  it('stores a typed default as empty, and keeps a value that differs', () => {
    expect(solidScriptParameterValueStored('16', '16')).toBe('');
    expect(solidScriptParameterValueStored('16.0', '16')).toBe('');
    expect(solidScriptParameterValueStored(' 16 ', '16')).toBe('');
    expect(solidScriptParameterValueStored('2,2,2', '2, 2, 2')).toBe('');
    expect(solidScriptParameterValueStored('2.0, 2.0, 2.0', '2, 2, 2')).toBe('');
    expect(solidScriptParameterValueStored('additive', 'Additive')).toBe('');
    expect(solidScriptParameterValueStored('15', '16')).toBe('15');
    expect(solidScriptParameterValueStored('2, 2, 3', '2, 2, 2')).toBe('2, 2, 3');
    const sphere = solidScriptCommandFind('sphere');
    if (!sphere) throw new Error('Sphere is missing');
    expect(
      solidScriptCommandValuesStored(sphere, {
        r: '1',
        sides: '16.0',
        rings: '8',
        anchor: 'center,center,center',
        mode: 'Additive',
      }),
    ).toMatchObject({ r: '', sides: '', rings: '', anchor: '', mode: '' });
    expect(
      solidScriptCommandValuesStored(sphere, { r: '1.3', sides: '15', rings: '8', mode: 'Subtractive' }),
    ).toMatchObject({ r: '1.3', sides: '15', rings: '', mode: 'Subtractive' });
  });

  it('starts no new block with a field typed to its declared default', () => {
    const catalogs = [
      solidScriptCommands,
      solidScriptFormulaCatalog().commands,
      solidScriptFormulaCatalog({ each: 'Face' }).commands,
    ];
    for (const commands of catalogs) {
      for (const command of commands) {
        const values = command.valuesDefault();
        for (const parameter of command.parameters) {
          const stored = values[parameter.key] ?? '';
          if (stored.trim() === '') continue;
          expect(
            solidScriptParameterValueIsDefault(stored, parameter.default),
            `${command.id}.${parameter.key} starts as '${stored}', which is the default`,
          ).toBe(false);
        }
      }
    }
  });

  it('shows the declared default as the placeholder when no other one is set', () => {
    const mode = solidScriptCommandFind('cube')?.parameters.find((parameter) => parameter.key === 'mode');
    const of = solidScriptCommandFind('move_by')?.parameters.find((parameter) => parameter.key === 'of');
    const size = solidScriptCommandFind('cube')?.parameters.find((parameter) => parameter.key === 'size');
    if (!mode || !of || !size) throw new Error('Cube or Move fields are missing');
    expect(mode.default).toBe('Additive');
    expect(solidScriptParameterPlaceholder(mode)).toBe('Additive');
    expect(solidScriptParameterPlaceholder(of)).toBe('[$Selected.Objects]');
    expect(solidScriptParameterPlaceholder(size)).toBe('1, 1, 1');
  });

  it('shows no placeholder when empty is not a value that can be typed', () => {
    const of = solidScriptCommandFind('select_objects')?.parameters.find((parameter) => parameter.key === 'of');
    const output = solidScriptCommandFind('output')?.parameters.find((parameter) => parameter.key === 'of');
    if (!of || !output) throw new Error('Select Objects or Output fields are missing');
    expect(solidScriptParameterPlaceholder(of)).toBe('');
    expect(solidScriptParameterPlaceholder(output)).toBe('');
  });

  it('allows an empty field when a default is declared, and uses that default', () => {
    const rings = solidScriptCommandFind('sphere')?.parameters.find((parameter) => parameter.key === 'rings');
    const of = solidScriptCommandFind('output')?.parameters.find((parameter) => parameter.key === 'of');
    if (!rings || !of) throw new Error('Sphere Rings or Output Of is missing');
    expect(rings.default).toBe('8');
    expect(solidScriptParameterAllowsEmpty(rings)).toBe(true);
    expect(solidScriptConfiguratorProblem(rings, '')).toBe('');
    expect(solidScriptConfiguratorProblem(rings, '8')).toBe('');
    expect(solidScriptParameterAllowsEmpty(of)).toBe(false);
    expect(solidScriptConfiguratorProblem(of, '')).toBe('Of needs a value.');
  });
});
