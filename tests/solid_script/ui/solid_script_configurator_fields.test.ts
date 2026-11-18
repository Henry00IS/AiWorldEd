import { describe, expect, it } from 'vitest';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import type { SolidScriptCommandParameter } from '@/solid_script/commands/solid_script_command.js';
import { solidScriptConfiguratorFieldBuild } from '@/solid_script/ui/solid_script_configurator_fields.js';

/**
 * Returns the Variable field of the Set command.
 *
 * @returns Parameter.
 */
function setVariableParameter(): SolidScriptCommandParameter {
  const parameter = solidScriptCommandFind('variable')?.parameters.find((entry) => entry.key === 'name');
  if (parameter === undefined) throw new Error('Set has no Variable field');
  return parameter;
}

/**
 * Checks a text typed into the Variable field of Set.
 *
 * @param text Typed text.
 * @returns Problem the field shows, or an empty string.
 */
function setVariableProblem(text: string): string {
  return solidScriptConfiguratorFieldBuild(setVariableParameter(), text, () => {}).problem();
}

describe('SolidScript configurator Set Variable field', () => {
  it('accepts a value under .Data, also through members and items', () => {
    for (const text of [
      'Face.Data.Height',
      'Brush.Edges.Data.Anything',
      'Brush.Faces(0).Edges.Data.Kind',
      'Edge.Parent.Data.Kind',
      'Sides(0).Data.[Key]',
    ])
      expect(setVariableProblem(text), text).toBe('');
  });

  it('still refuses members that can only be read', () => {
    expect(setVariableProblem('Brush.Edges')).toMatch(/Brush\.Edges can only be read/);
    expect(setVariableProblem('Face.Center')).toMatch(/Face\.Center can only be read/);
    expect(setVariableProblem('Brush.Edges.Data')).toMatch(/Brush\.Edges\.Data needs a key to set/);
  });
});
