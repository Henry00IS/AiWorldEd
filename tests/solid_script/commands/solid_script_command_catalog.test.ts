import { describe, expect, it } from 'vitest';
import {
  SOLID_SCRIPT_COMMAND_CATEGORIES,
  solidScriptCommandFind,
  solidScriptCommands,
} from '@/solid_script/commands/solid_script_command_catalog.js';
import type { SolidScriptCommand } from '@/solid_script/commands/solid_script_command.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';

/**
 * Title Case: every word starts with a capital letter or a digit; words may be
 * split by a slash, as in Depth / Width, and end in a unit, as in Sweep °.
 */
const SOLID_SCRIPT_TITLE_CASE = /^([A-Z0-9][A-Za-z0-9]*)( (\/ )?[A-Z0-9][A-Za-z0-9]*)*( [°%])?$/;

/**
 * Runs lines in a fresh machine.
 *
 * @param lines Lines.
 * @returns Run.
 */
function run(...lines: SolidScriptLine[]) {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines));
}

/**
 * Wraps one command's default line in lines that are valid on their own: blocks
 * get a child and an End, 2D shapes an extrusion, Else an If.
 *
 * @param command Command.
 * @returns Lines.
 */
function standalone(command: SolidScriptCommand): SolidScriptLine[] {
  const line: SolidScriptLine = { command: command.id };
  const counter: SolidScriptLine = { command: 'variable', values: { name: 'i', value: '0' } };
  const started: SolidScriptLine[] = [
    line,
    ...command.starter.map((entry) => ({ ...entry, values: { ...entry.values } })),
  ];
  if (command.category === 'Faces') {
    const pick: SolidScriptLine[] = [{ command: 'cube' }, { command: 'select_faces' }];
    if (command.id === 'select_faces') return [{ command: 'cube' }, line];
    if (command.nesting === 'open' && command.id !== 'place_on_face') return [...pick, ...started, { command: 'end' }];
    return [
      ...pick,
      { command: 'for_each_selected_face' },
      ...started,
      ...(command.nesting === 'open' ? [{ command: 'end' }] : []),
      { command: 'end' },
    ];
  }
  if (command.starter.length > 0 && command.category === '2D Shapes')
    return [{ command: 'linear_extrude' }, ...started, { command: 'end' }, { command: 'end' }];
  if (['input_group', 'input_row', 'show_inputs_when', 'if_used_as'].includes(command.id))
    return [...started, { command: 'end' }, { command: 'cube' }];
  if (command.starter.length > 0) return [...started, { command: 'end' }];
  if (command.id === 'vertex' || command.id === 'face') {
    const corners = ['0, 0, 0', '1, 0, 0', '0, 1, 0'].map((position) => ({ command: 'vertex', values: { position } }));
    const face: SolidScriptLine = { command: 'face', values: { corners: '0, 1, 2' } };
    return command.id === 'vertex'
      ? [{ command: 'mesh' }, line, ...corners.slice(1), face, { command: 'end' }]
      : [{ command: 'mesh' }, ...corners, line, { command: 'end' }];
  }
  if (command.id === 'point') {
    const corners = ['1, 0, 0', '0, 1, 0', '0, 0, 1'].map((position) => ({ command: 'point', values: { position } }));
    return [{ command: 'polyhedron' }, line, ...corners, { command: 'end' }];
  }
  if (command.category === '2D Shapes') return [{ command: 'linear_extrude' }, line, { command: 'end' }];
  if (command.id === 'linear_extrude') return [line, { command: 'square' }, { command: 'end' }];
  if (command.id === 'stop_script') return [{ command: 'cube' }, line, { command: 'sphere' }];
  if (command.id === 'else')
    return [counter, { command: 'if' }, { command: 'cube' }, line, { command: 'sphere' }, { command: 'end' }];
  if (command.category === 'Lists' && command.id !== 'remove_item' && command.id !== 'add_item')
    return [{ command: 'add_item', values: { list: 'items' } }, line, { command: 'cube' }];
  if (command.id === 'remove_item')
    return [{ command: 'variable', values: { name: 'points()', value: '0, 0' } }, line, { command: 'cube' }];
  if (command.id === 'end') return [{ command: 'union' }, { command: 'cube' }, line];
  if (command.id === 'part') return [line, { command: 'cube' }, { command: 'end' }, { command: 'use_part' }];
  if (command.id === 'function' || command.id === 'call')
    return [
      { command: 'function', values: { name: 'area', parameters: 'w, d' } },
      { command: 'cube' },
      { command: 'return', values: { value: '[=[local.w] * [local.d]]' } },
      { command: 'end' },
      { command: 'call', values: { name: 'area', values: '2, 3', result: 'size' } },
    ];
  if (['when_input_changes', 'when_button_pressed', 'when_baked'].includes(command.id))
    return [line, { command: 'end' }, { command: 'cube' }];
  if (command.id === 'set_input' || command.id === 'show_message') return [{ command: 'cube' }];
  if (command.id === 'return')
    return [{ command: 'part' }, { command: 'cube' }, line, { command: 'end' }, { command: 'use_part' }];
  if (command.id === 'use_part') return [{ command: 'part' }, { command: 'cube' }, { command: 'end' }, line];
  if (command.nesting === 'open')
    return [counter, line, { command: 'cube' }, { command: 'sphere' }, { command: 'end' }];
  return [counter, line, { command: 'cube' }];
}

describe('solid script command catalog', () => {
  it('gives every command a unique id, a Title Case label, a known group and documented values', () => {
    const ids = new Set<string>();
    for (const command of solidScriptCommands) {
      expect(ids.has(command.id), command.id).toBe(false);
      ids.add(command.id);
      expect(command.label, command.id).toMatch(SOLID_SCRIPT_TITLE_CASE);
      expect(SOLID_SCRIPT_COMMAND_CATEGORIES).toContain(command.category);
      expect(command.description.length, command.id).toBeGreaterThan(5);
      expect(command.manual.length, command.id).toBeGreaterThan(40);
      for (const parameter of command.parameters) {
        expect(parameter.label, `${command.id}.${parameter.key}`).toMatch(SOLID_SCRIPT_TITLE_CASE);
        expect(parameter.hint.length, `${command.id}.${parameter.key}`).toBeGreaterThan(3);
      }
      expect(solidScriptCommandFind(command.id)).toBe(command);
    }
  });

  it('documents with an example and the mistakes that stop every command with values', () => {
    // Notes never run, so nothing stops them.
    const notes = ['note', 'input_note'];
    for (const command of solidScriptCommands.filter(
      (entry) => entry.parameters.length > 0 && !notes.includes(entry.id),
    )) {
      expect(command.manual, command.id).toMatch(/Example|example/);
      expect(command.stops.length, command.id).toBeGreaterThan(0);
    }
  });

  it('writes help in plain field text: no double-quoted text and no bracketed lists', () => {
    for (const command of solidScriptCommands) {
      const help = [command.manual, ...command.stops, ...command.parameters.map((entry) => entry.hint)].join(' ');
      expect(help, command.id).not.toMatch(/\[\s*-?\d/);
      expect(help, command.id).not.toMatch(/"/);
      for (const parameter of command.parameters) expect(parameter.default, command.id).not.toMatch(/^\[\s*-?\d|"/);
    }
  });

  it('starts every transform as a neutral one that changes nothing', () => {
    const defaults = (id: string) => solidScriptCommandFind(id)?.valuesDefault();
    expect(defaults('translate')).toEqual({ v: '0, 0, 0' });
    expect(defaults('rotate')).toEqual({ a: '0, 0, 0' });
    expect(defaults('scale')).toEqual({ v: '1, 1, 1' });
    expect(defaults('linear_extrude')).toMatchObject({ scale: '1, 1' });
    const plain = JSON.stringify(run({ command: 'cube' }).shapes);
    for (const id of ['translate', 'rotate', 'scale'])
      expect(JSON.stringify(run({ command: id }, { command: 'cube' }, { command: 'end' }).shapes), id).toBe(plain);
  });

  it('centres shapes on the origin by default', () => {
    for (const id of ['cube', 'cylinder', 'sphere']) {
      const [shape] = run({ command: id }).shapes;
      const points = shape?.kind === 'solid' ? shape.points : [];
      const sum = points.reduce((total, point) => total + point.x + point.y + point.z, 0);
      expect(Math.abs(sum / Math.max(points.length, 1)), id).toBeLessThan(1e-9);
    }
  });

  it('runs every command with its default values', () => {
    for (const command of solidScriptCommands) {
      const result = run(...standalone(command));
      expect(result.error?.message ?? null, command.id).toBeNull();
    }
  });

  it('uses defaults for missing or blank values and keeps typed values on one line', () => {
    const cube = solidScriptCommandFind('cube');
    expect(cube?.valueText({}, 'size')).toBe('1, 1, 1');
    expect(cube?.valueText({ size: '  ' }, 'size')).toBe('1, 1, 1');
    expect(cube?.valueText({ size: '[w],\n2, 3' }, 'size')).toBe('[w], 2, 3');
  });

  it('opens a block for transforms, combinations, loops, conditions, parts and point shapes only', () => {
    const openers = solidScriptCommands
      .filter(
        (command) => command.nesting === 'open' && command.category !== 'Solids' && command.category !== '2D Shapes',
      )
      .map((command) => command.category);
    expect(new Set(openers)).toEqual(new Set(['Transforms', 'Combine', 'Meshes', 'Faces', 'Inputs', 'Logic', 'Parts']));
    const pointShapes = solidScriptCommands
      .filter((command) => command.starter.length > 0)
      .map((command) => command.id);
    expect(pointShapes).toEqual(
      expect.arrayContaining(['polyhedron', 'polygon', 'rotate_extrude', 'mesh', 'subdivide']),
    );
    for (const command of solidScriptCommands.filter((entry) => entry.starter.length > 0))
      expect(command.nesting, command.id).toBe('open');
    expect(solidScriptCommandFind('cube')?.nesting).toBe('none');
    expect(solidScriptCommandFind('else')?.nesting).toBe('continue');
    expect(solidScriptCommandFind('end')?.nesting).toBe('close');
    expect(solidScriptCommandFind('end')?.inPalette).toBe(false);
    expect(solidScriptCommandFind('blank')?.inPalette).toBe(false);
  });

  it('defines named parts that other lines build, before or after the definition', () => {
    const after = run(
      { command: 'part', values: { name: 'post' } },
      { command: 'cube' },
      { command: 'end' },
      { command: 'use_part', values: { name: 'post' } },
    );
    expect(after.shapes).toHaveLength(1);
    const before = run(
      { command: 'use_part', values: { name: 'post' } },
      { command: 'part', values: { name: 'post' } },
      { command: 'cube' },
      { command: 'end' },
    );
    expect(before.shapes).toHaveLength(1);
  });

  it('lists every parameter with its value, for display', () => {
    expect(solidScriptCommandFind('cube')?.entries({ size: '2, 2, 2' })).toEqual([
      { key: 'size', label: 'Size', value: '2, 2, 2' },
      { key: 'center', label: 'Center', value: 'true' },
    ]);
  });

  it('gives round shapes their own sides and rings, named like the primitive generators', () => {
    expect(solidScriptCommandFind('sphere')?.parameters.map((entry) => entry.key)).toEqual(['r', 'sides', 'rings']);
    expect(solidScriptCommandFind('cylinder')?.parameters.map((entry) => entry.key)).toContain('sides');
    expect(solidScriptCommandFind('circle')?.parameters.map((entry) => entry.key)).toContain('sides');
    const low = run({ command: 'sphere', values: { sides: '4', rings: '2' } }).shapes[0];
    const high = run({ command: 'sphere', values: { sides: '32', rings: '16' } }).shapes[0];
    expect(low?.kind === 'solid' && high?.kind === 'solid' && low.points.length < high.points.length).toBe(true);
    expect(run({ command: 'sphere', values: { sides: '2' } }).error?.message).toMatch(/Sides/);
  });
});
