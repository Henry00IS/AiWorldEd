import { describe, expect, it } from 'vitest';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import {
  solidScriptParameterAllowsEmpty,
  solidScriptParameterPlaceholder,
  solidScriptParameterTextNormalized,
  solidScriptParameterValueIsDefault,
} from '@/solid_script/commands/solid_script_parameter_default.js';
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
  });

  it('shows the declared default as the placeholder when no other one is set', () => {
    const mode = solidScriptCommandFind('cube')?.parameters.find((parameter) => parameter.key === 'mode');
    const of = solidScriptCommandFind('move_by')?.parameters.find((parameter) => parameter.key === 'of');
    const size = solidScriptCommandFind('cube')?.parameters.find((parameter) => parameter.key === 'size');
    if (!mode || !of || !size) throw new Error('Cube or Move fields are missing');
    expect(mode.default).toBe('Additive');
    expect(solidScriptParameterPlaceholder(mode)).toBe('Additive');
    expect(solidScriptParameterPlaceholder(of)).toBe('[$Selected.Brushes]');
    expect(solidScriptParameterPlaceholder(size)).toBe('1, 1, 1');
  });

  it('shows no placeholder when empty is not a value that can be typed', () => {
    const of = solidScriptCommandFind('select_brushes')?.parameters.find((parameter) => parameter.key === 'of');
    const output = solidScriptCommandFind('output')?.parameters.find((parameter) => parameter.key === 'of');
    if (!of || !output) throw new Error('Select Brushes or Output fields are missing');
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
