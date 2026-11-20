import { describe, expect, it } from 'vitest';
import {
  solidScriptFormulaCheckInputs,
  solidScriptFormulaCheckKeys,
  solidScriptFormulaCheckLabel,
  solidScriptFormulaCheckName,
  solidScriptFormulaInputFallback,
} from '@/solid_script/commands/solid_script_formula_inputs.js';

describe('SolidScript formula inputs', () => {
  it('fills in the element of the formula for its element inputs', () => {
    expect(solidScriptFormulaInputFallback({ each: 'Face' }, 'in_box', 'point')).toBe('[$Face.Center]');
    expect(solidScriptFormulaInputFallback({ each: 'Vertex' }, 'near', 'point')).toBe('[$Vertex.Position]');
    expect(solidScriptFormulaInputFallback({ each: 'Face' }, 'hits_box', 'element')).toBe('[$Face]');
    expect(solidScriptFormulaInputFallback({ each: 'Edge' }, 'is_face', 'value')).toBe('[$Edge]');
    expect(solidScriptFormulaInputFallback({ each: 'Item' }, 'every_nth', 'index')).toBe('[$Index]');
    expect(solidScriptFormulaInputFallback({ each: 'Face' }, 'in_box', 'size')).toBe('');
  });

  it('fills in nothing outside a per-element formula, so every input is needed', () => {
    expect(solidScriptFormulaInputFallback({}, 'in_box', 'point')).toBe('');
    const point = solidScriptFormulaCheckInputs('in_box', {}).find((input) => input.name === 'point');
    expect(point?.fallback).toBe('');
    expect(point?.optional).toBe(false);
  });

  it('names every check the way the docs teach it, with a friendly label', () => {
    const keys = solidScriptFormulaCheckKeys();
    expect(keys).toContain('in_box');
    expect(keys).toContain('has_tag');
    expect(solidScriptFormulaCheckName('in_box')).toBe('InBox');
    expect(solidScriptFormulaCheckLabel('in_box')).toBe('In Box');
    for (const key of keys) expect(solidScriptFormulaCheckLabel(key)).not.toMatch(/Shape/);
  });

  it('tells vector, text and any inputs apart', () => {
    const kinds = Object.fromEntries(
      solidScriptFormulaCheckInputs('hits_box', {}).map((input) => [input.name, input.kind]),
    );
    expect(kinds['center']).toBe('vector');
    expect(kinds['how']).toBe('text');
    expect(kinds['element']).toBe('any');
  });
});
