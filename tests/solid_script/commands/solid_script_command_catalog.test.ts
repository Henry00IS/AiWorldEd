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
  if (command.id === 'part') return `${line}\ncube(1);\n}\npart();`;
  if (command.id === 'use_part') return `module part() {\ncube(1);\n}\n${line}`;
  if (command.nesting === 'open') return `i = 0;\n${line}\ncube([1, 1, 1]);\ncube([0.5, 0.5, 2]);\n}`;
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

  it('starts every transform as a neutral one that changes nothing', () => {
    const defaults = (id: string) => solidScriptCommandFind(id)?.valuesDefault();
    expect(defaults('translate')).toEqual({ v: '[0, 0, 0]' });
    expect(defaults('rotate')).toEqual({ a: '[0, 0, 0]' });
    expect(defaults('scale')).toEqual({ v: '[1, 1, 1]' });
    expect(defaults('linear_extrude')).toMatchObject({ scale: '[1, 1]' });
    const plain = JSON.stringify(solidScriptProgramEvaluate('cube(1);').shapes);
    for (const id of ['translate', 'rotate', 'scale']) {
      const command = solidScriptCommandFind(id);
      const line = command?.code(command.valuesDefault()) ?? '';
      expect(JSON.stringify(solidScriptProgramEvaluate(`${line}\ncube(1);\n}`).shapes), id).toBe(plain);
    }
  });

  it('starts every solid with the defaults the language uses when a value is left out', () => {
    for (const command of solidScriptCommands.filter((entry) => entry.category === 'Solids')) {
      if (command.id === 'polyhedron') continue;
      const configured = solidScriptProgramEvaluate(command.code(command.valuesDefault())).shapes;
      const bare = solidScriptProgramEvaluate(`${command.id}();`).shapes;
      expect(JSON.stringify(configured), command.id).toBe(JSON.stringify(bare));
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

  it('opens a block for transforms, combinations, loops, conditions and parts only', () => {
    const openers = solidScriptCommands
      .filter((command) => command.nesting === 'open')
      .map((command) => command.category);
    expect(new Set(openers)).toEqual(new Set(['Transforms', 'Combine', 'Logic', 'Parts']));
    expect(solidScriptCommandFind('cube')?.nesting).toBe('none');
    expect(solidScriptCommandFind('else')?.nesting).toBe('continue');
    expect(solidScriptCommandFind('end')?.nesting).toBe('close');
    expect(solidScriptCommandFind('end')?.inPalette).toBe(false);
    expect(solidScriptCommandFind('blank')?.inPalette).toBe(false);
  });

  it('defines named parts that later lines build again', () => {
    const part = solidScriptCommandFind('part');
    const use = solidScriptCommandFind('use_part');
    const source = [part?.code({ name: 'post' }), 'cube(1);', '}', use?.code({ name: 'post' })].join('\n');
    expect(solidScriptProgramEvaluate(source).shapes).toHaveLength(1);
  });

  it('lists every parameter with the value it writes, for display', () => {
    expect(solidScriptCommandFind('cube')?.entries({ size: '[2, 2, 2]' })).toEqual([
      { key: 'size', label: 'Size', value: '[2, 2, 2]' },
      { key: 'center', label: 'Center', value: 'false' },
    ]);
  });
});
