import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';
import { SolidScriptCommand } from '@/solid_script/commands/solid_script_command.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun, type SolidScriptProgramOptions } from '@/solid_script/language/solid_script_program.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import { solidScriptUseSolidOf } from '../language/solid_script_use_solid.js';

/** Run methods whose first argument is the key of the field they read. */
const RUN_KEYED = new Set(['value', 'text', 'source', 'list', 'values', 'valueItems', 'valueWith']);

/** Methods of the strict field view whose first argument is a field key. */
const FIELDS_KEYED = new Set(['value', 'number', 'positive', 'vector', 'flag']);

/**
 * Fields every command that declares them gets from the script machine rather
 * than from its own run step: Name labels what the line builds, Mode cuts or
 * keeps overlap, and Into names what it built.
 */
const MACHINE_KEYS = new Set(['label', 'mode', 'into']);

/**
 * Fields of lines the script machine handles itself, or that only the editor or
 * the inspector reads, with what reads them.
 */
const READ_ELSEWHERE: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  note: { text: 'The editor shows the note.' },
  input_group: { title: 'The inspector shows the heading.' },
  show_inputs_when: { name: 'The inspector shows or hides inputs.', value: 'The inspector shows or hides inputs.' },
  input_note: { text: 'The inspector shows the note.' },
  function: { name: 'The machine defines the function.', parameters: 'The machine defines the function inputs.' },
  part: { name: 'The machine names the part.' },
  when_input_changes: { name: 'The machine runs the block when that input changes.' },
  when_button_pressed: { name: 'The machine runs the block when that button is pressed.' },
};

/** Keys read per command id while the fixtures run. */
const reads = new Map<string, Set<string>>();

/**
 * Remembers that a command read a field.
 *
 * @param id Command id.
 * @param key Field key.
 */
function readsNote(id: string, key: string): void {
  const known = reads.get(id) ?? new Set<string>();
  known.add(key);
  reads.set(id, known);
}

/**
 * Wraps the strict field view of a line so its keyed reads are remembered.
 *
 * @param id Command id.
 * @param view Field view.
 * @returns Wrapped view.
 */
function readsFieldsView<T extends object>(id: string, view: T): T {
  return new Proxy(view, {
    get(target, property) {
      const member: unknown = Reflect.get(target, property, target);
      if (typeof member !== 'function') return member;
      const name = String(property);
      return (...args: unknown[]) => {
        if (FIELDS_KEYED.has(name)) readsNote(id, String(args[0]));
        if (name === 'anchor') readsNote(id, 'anchor');
        return (member as (...rest: unknown[]) => unknown).apply(target, args);
      };
    },
  });
}

/**
 * Wraps a running line so every field it reads is remembered for its command.
 *
 * @param id Command id.
 * @param run Running line.
 * @returns Wrapped run.
 */
function readsRun(id: string, run: SolidScriptBlockRun): SolidScriptBlockRun {
  return new Proxy(run, {
    get(target, property) {
      const member: unknown = Reflect.get(target, property, target);
      if (typeof member !== 'function') return member;
      const name = String(property);
      return (...args: unknown[]) => {
        if (RUN_KEYED.has(name)) readsNote(id, String(args[0]));
        if (name === 'variableWrite') readsNote(id, String(args[1]));
        if (name === 'ofValues') readsNote(id, 'of');
        const result: unknown = (member as (...rest: unknown[]) => unknown).apply(target, args);
        return name === 'fields' ? readsFieldsView(id, result as object) : result;
      };
    },
  });
}

/**
 * Lines before the line under test: a cube, a list, and every brush and face
 * selected.
 */
const PRELUDE_BRUSHES: readonly SolidScriptLine[] = [
  { command: 'cube', values: {} },
  { command: 'variable', values: { name: 'Items', value: '1, 2, 3' } },
  { command: 'select_objects', values: { which: 'All' } },
  { command: 'select_faces', values: { which: 'All' } },
];

/** Lines before the line under test: a mesh cube with every face selected. */
const PRELUDE_MESH: readonly SolidScriptLine[] = [
  { command: 'mesh_from_solids', values: {} },
  { command: 'cube', values: {} },
  { command: 'end', values: {} },
  { command: 'select_objects', values: { which: 'All' } },
  { command: 'select_faces', values: { which: 'All' } },
];

/** Lines a block holds while it is tested: flat blocks get a square. */
const INSIDE: Readonly<Record<string, readonly SolidScriptLine[]>> = {
  linear_extrude: [{ command: 'square', values: {} }],
  rotate_extrude: [{ command: 'square', values: { size: '1, 1' } }],
  minkowski: [
    { command: 'cube', values: {} },
    { command: 'sphere', values: { r: '0.1' } },
  ],
};

/** Lines around a line that only works inside another block. */
const AROUND: Readonly<Record<string, readonly [SolidScriptLine, SolidScriptLine]>> = {
  offset: [
    { command: 'linear_extrude', values: {} },
    { command: 'end', values: {} },
  ],
};

/** Run options for generator and modifier use. */
const USES: readonly SolidScriptProgramOptions[] = [
  {},
  {
    use: {
      usage: 'Modifier',
      solids: [
        solidScriptUseSolidOf([-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => [x, y, z] as const)))),
      ],
      faces: 6,
    },
  },
];

/**
 * Values to try for a command: every default, then each word of a choice field
 * and Yes for each switch, one at a time.
 *
 * @param command Command.
 * @returns Value sets.
 */
function fixtureValues(command: SolidScriptCommand): Record<string, string>[] {
  const base = Object.fromEntries(command.parameters.map((parameter) => [parameter.key, parameter.default]));
  const words = command.parameters.flatMap((parameter) =>
    (parameter.words ?? []).map((entry) => ({ ...base, [parameter.key]: entry.word })),
  );
  const switches = command.parameters
    .filter((parameter) => parameter.type === 'boolean')
    .map((parameter) => ({ ...base, [parameter.key]: 'Yes' }));
  return [base, ...words, ...switches];
}

/**
 * The script that tests one line: the prelude, then the line, with what its
 * block holds and the block it needs around it.
 *
 * @param command Command.
 * @param values Values of the line.
 * @param prelude Lines before.
 * @returns Lines.
 */
function fixtureLines(
  command: SolidScriptCommand,
  values: Record<string, string>,
  prelude: readonly SolidScriptLine[],
): SolidScriptLine[] {
  const inside = command.nesting === 'open' ? [...(INSIDE[command.id] ?? [{ command: 'cube', values: {} }])] : [];
  const line: SolidScriptLine[] = [{ command: command.id, values }, ...inside];
  if (command.nesting === 'open') line.push({ command: 'end', values: {} });
  const around = AROUND[command.id];
  return [...prelude, ...(around ? [around[0], ...line, around[1]] : line)];
}

/**
 * Runs every command in every fixture, as a generator and as a modifier; a line
 * that stops still counts the fields it read first.
 */
function fixturesRun(): void {
  for (const command of solidScriptCommands)
    for (const values of fixtureValues(command))
      for (const prelude of [PRELUDE_BRUSHES, PRELUDE_MESH])
        for (const options of USES)
          solidScriptProgramRun(solidScriptDocumentCreate(fixtureLines(command, values, prelude)), options);
}

/**
 * Fields of a command that nothing reads: not its run step in any fixture, not
 * the machine, and not a reader listed in READ_ELSEWHERE.
 *
 * @param command Command.
 * @returns Field keys.
 */
function fieldsUnread(command: SolidScriptCommand): string[] {
  const read = reads.get(command.id);
  const elsewhere = READ_ELSEWHERE[command.id] ?? {};
  return command.parameters
    .map((parameter) => parameter.key)
    .filter((key) => !read?.has(key) && !MACHINE_KEYS.has(key) && elsewhere[key] === undefined);
}

describe('SolidScript catalog fields', () => {
  beforeAll(() => {
    const execute = SolidScriptCommand.prototype.execute;
    vi.spyOn(SolidScriptCommand.prototype, 'execute').mockImplementation(function (
      this: SolidScriptCommand,
      run: SolidScriptBlockRun,
    ) {
      return execute.call(this, readsRun(this.id, run));
    });
    fixturesRun();
  }, 120000);

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('reads every declared field of every block', () => {
    const unread = solidScriptCommands
      .map((command) => [command.id, fieldsUnread(command)] as const)
      .filter(([, keys]) => keys.length > 0)
      .map(([id, keys]) => `${id}: ${keys.join(', ')}`);
    expect(unread).toEqual([]);
  });

  it('lists only real fields as read elsewhere', () => {
    const stale = Object.entries(READ_ELSEWHERE).flatMap(([id, keys]) => {
      const command = solidScriptCommands.find((entry) => entry.id === id);
      return Object.keys(keys)
        .filter((key) => !command?.parameters.some((parameter) => parameter.key === key))
        .map((key) => `${id}.${key}`);
    });
    expect(stale).toEqual([]);
  });

  it('offers only Into on Input Objects', () => {
    const keys = solidScriptCommands.find((command) => command.id === 'input_objects')?.parameters.map((p) => p.key);
    expect(keys).toEqual(['into']);
  });
});
