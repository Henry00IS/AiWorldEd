import { afterEach, describe, expect, it } from 'vitest';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptFieldVectorNote } from '@/solid_script/language/solid_script_field.js';
import {
  solidScriptConfiguratorFieldBuild,
  solidScriptConfiguratorVectorJoin,
  solidScriptConfiguratorVectorSplit,
} from '@/solid_script/ui/solid_script_configurator_fields.js';

const OFFSET = solidScriptCommandFind('translate')!.parameters.find((parameter) => parameter.key === 'v')!;

afterEach(() => document.body.replaceChildren());

describe('SolidScript vector fields', () => {
  it('converts between one vector and its axes without losing anything it can keep', () => {
    expect(solidScriptConfiguratorVectorSplit('1, 2, 3', 3)).toEqual(['1', '2', '3']);
    expect(solidScriptConfiguratorVectorSplit('[Edge.Middle]', 3)).toEqual([
      '[Edge.Middle.x]',
      '[Edge.Middle.y]',
      '[Edge.Middle.z]',
    ]);
    expect(solidScriptConfiguratorVectorSplit('[=Lerp([A], [B], 0.5)]', 3)).toBeNull();
    expect(solidScriptConfiguratorVectorJoin(['[Edge.Middle.X]', '[Edge.Middle.Y]', '[Edge.Middle.Z]'])).toBe(
      '[Edge.Middle]',
    );
    expect(solidScriptConfiguratorVectorJoin(['1', '[A]', '3'])).toBe('1, [A], 3');
  });

  it('points out a built-in number in a vector field', () => {
    // A number in a vector field is allowed, every axis gets it, but it is pointed out.
    expect(solidScriptFieldVectorNote('[Edge.Length]')).toContain('not a vector');
    expect(solidScriptFieldVectorNote('[Edge.Middle]')).toBe('');
    expect(solidScriptFieldVectorNote('[Width]')).toBe('');
  });

  it('switches between X, Y, Z and one Vector input, picking one Vector for a stored vector', () => {
    const field = solidScriptConfiguratorFieldBuild(
      OFFSET,
      '[Edge.Middle.x], [Edge.Middle.y], [Edge.Middle.z]',
      () => {},
    );
    document.body.append(field.element);
    const toggle = field.element.querySelector<HTMLButtonElement>('button[aria-label="Offset As One Vector"]')!;
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    toggle.click();
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(field.read()).toBe('[Edge.Middle]');
    const single = solidScriptConfiguratorFieldBuild(OFFSET, '[Edge.Middle]', () => {});
    const singleToggle = single.element.querySelector<HTMLButtonElement>('button[aria-label="Offset As One Vector"]')!;
    expect(singleToggle.getAttribute('aria-pressed')).toBe('true');
    singleToggle.click();
    expect(single.read()).toBe('[Edge.Middle.x], [Edge.Middle.y], [Edge.Middle.z]');
    expect(solidScriptConfiguratorFieldBuild(OFFSET, '[Edge.Length]', () => {}).warning()).toContain('not a vector');
  });
});
