import '@/solid_script/commands/solid_script_command_catalog.js';
import { describe, expect, it } from 'vitest';
import {
  solidScriptParameter,
  solidScriptParameterApplies,
  solidScriptParameterWhen,
  solidScriptParameterWords,
} from '@/solid_script/commands/solid_script_command_parameters.js';

const choice = solidScriptParameterWords('shape', 'Shape', 'text', 'Line', 'Shape of the path.', [
  { word: 'Line', detail: 'A straight path' },
  { word: 'Arc', detail: 'A curved path' },
]);
const sweep = solidScriptParameterWhen(
  solidScriptParameter('sweep', 'Sweep', 'number', '90', 'How far the arc turns, in degrees.'),
  'shape',
  ['Arc'],
);
const parameters = [choice, sweep];

describe('SolidScript parameter When', () => {
  it('shows a field only for the words it names, and shows it when the choice is a variable', () => {
    expect(solidScriptParameterApplies(sweep, { shape: 'Line' }, parameters)).toBe(false);
    expect(solidScriptParameterApplies(sweep, { shape: 'Arc' }, parameters)).toBe(true);
    expect(solidScriptParameterApplies(sweep, { shape: 'arc' }, parameters)).toBe(true);
    expect(solidScriptParameterApplies(sweep, { shape: '[Mode]' }, parameters)).toBe(true);
    expect(solidScriptParameterApplies(sweep, {}, parameters)).toBe(false);
  });
});
