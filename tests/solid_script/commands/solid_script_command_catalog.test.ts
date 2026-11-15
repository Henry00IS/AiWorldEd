import { describe, expect, it } from 'vitest';
import {
  SOLID_SCRIPT_COMMAND_CATEGORIES,
  solidScriptCommandFind,
  solidScriptCommands,
} from '@/solid_script/commands/solid_script_command_catalog.js';
import type { SolidScriptCommand } from '@/solid_script/commands/solid_script_command.js';
import { solidScriptProgramEvaluate } from '@/solid_script/language/solid_script_program.js';

/** Title Case: every word starts with a capital letter or a digit. */
const SOLID_SCRIPT_TITLE_CASE = /^([A-Z0-9][A-Za-z0-9]*)( [A-Z0-9][A-Za-z0-9]*)*$/;

/**
 * Wraps one command's default line in a program that is valid on its own:
 * blocks get a child and an End, 2D shapes an extrusion, Else an If.
 *
 * @param command Command.
 * @returns Source text.
 */
function standaloneProgram(command: SolidScriptCommand): string {
  const line = command.code(command.valuesDefault());
  if (command.category === '2D Shapes') return `linear_extrude(height = 1) {\n${line}\n}`;
  if (command.id === 'linear_extrude') return `${line}\nsquare([1, 1]);\n}`;
  if (command.id === 'else') return `i = 0;\nif (i == 1) {\ncube(1);\n${line}\nsphere(1);\n}`;
  if (command.id === 'end') return `union() {\ncube(1);\n${line}`;
  if (command.opensBlock) return `i = 0;\n${line}\ncube([1, 1, 1]);\ncube([0.5, 0.5, 2]);\n}`;
  return `i = 0;\n${line}\ncube(1);`;
}

describe('solid script command catalog', () => {
  it('gives every command a unique id, a Title Case label, a known group and documented values', () => {
    const ids = new Set<string>();
    for (const command of solidScriptCommands) {
      expect(ids.has(command.id), command.id).toBe(false);
      ids.add(command.id);
      expect(command.label, command.id).toMatch(SOLID_SCRIPT_TITLE_CASE);
      expect(SOLID_SCRIPT_COMMAND_CATEGORIES).toContain(command.category);
      expect(command.description.length, command.id).toBeGreaterThan(10);
      for (const parameter of command.parameters) {
        expect(parameter.label, `${command.id}.${parameter.key}`).toMatch(SOLID_SCRIPT_TITLE_CASE);
        expect(parameter.hint.length, `${command.id}.${parameter.key}`).toBeGreaterThan(3);
      }
      expect(solidScriptCommandFind(command.id)).toBe(command);
    }
  });

  it('writes exactly one line per command that the language evaluates', () => {
    for (const command of solidScriptCommands) {
      const line = command.code(command.valuesDefault());
      expect(line.includes('\n'), command.id).toBe(false);
      expect(() => solidScriptProgramEvaluate(standaloneProgram(command)), command.id).not.toThrow();
    }
  });

  it('uses defaults for missing or blank values and keeps typed values on one line', () => {
    const cube = solidScriptCommandFind('cube');
    expect(cube?.code({})).toBe('cube(size = [1, 1, 1], center = false);');
    expect(cube?.code({ size: '  ', center: 'true' })).toBe('cube(size = [1, 1, 1], center = true);');
    expect(cube?.code({ size: '[w,\n2, 3]' })).toBe('cube(size = [w, 2, 3], center = false);');
  });

  it('opens a block for transforms, combinations, loops and conditions only', () => {
    const openers = solidScriptCommands.filter((command) => command.opensBlock).map((command) => command.category);
    expect(new Set(openers)).toEqual(new Set(['Transforms', 'Combine', 'Logic']));
    expect(solidScriptCommandFind('cube')?.opensBlock).toBe(false);
    expect(solidScriptCommandFind('end')?.inPalette).toBe(false);
  });
});
