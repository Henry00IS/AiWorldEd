import { afterEach, describe, expect, it } from 'vitest';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptFieldVectorNote } from '@/solid_script/language/solid_script_field.js';
import { solidScriptConfiguratorFieldBuild } from '@/solid_script/ui/solid_script_configurator_fields.js';

const OFFSET = solidScriptCommandFind('translate')!.parameters.find((parameter) => parameter.key === 'v')!;

afterEach(() => document.body.replaceChildren());

describe('SolidScript vector fields', () => {
  it('points out a built-in number in a vector field', () => {
    // A number in a vector field is allowed, every axis gets it, but it is pointed out.
    expect(solidScriptFieldVectorNote('[Edge.Length]')).toContain('not a vector');
    expect(solidScriptFieldVectorNote('[Edge.Middle]')).toBe('');
    expect(solidScriptFieldVectorNote('[Width]')).toBe('');
  });

  it('is one text field of values separated by commas, without a toggle', () => {
    const field = solidScriptConfiguratorFieldBuild(OFFSET, '4, 1, 2', () => {});
    expect(field.element.querySelectorAll('input')).toHaveLength(1);
    expect(field.element.querySelector('button')).toBeNull();
    expect(field.read()).toBe('4, 1, 2');
    expect(field.problem()).toBe('');
    expect(solidScriptConfiguratorFieldBuild(OFFSET, '[Edge.Middle]', () => {}).problem()).toBe('');
    expect(solidScriptConfiguratorFieldBuild(OFFSET, '1, 2', () => {}).problem()).toContain('needs 3 values');
    expect(solidScriptConfiguratorFieldBuild(OFFSET, '[Edge.Length]', () => {}).warning()).toContain('not a vector');
  });
});
