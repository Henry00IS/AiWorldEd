import { solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';
import type { SolidScriptCommand } from '@/solid_script/commands/solid_script_command.js';
import type { SolidScriptLine } from '@/solid_script/document/solid_script_document.js';

/** A script that runs one command, and where that command's line is. */
export interface SolidScriptAuditScript {
  /** Lines of the script. */
  lines: SolidScriptLine[];
  /** 0-based line of the command under audit. */
  at: number;
}

/** Builds a line. */
const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });

/** Lines that give every kind a value can have, for the fields to read. */
export const SOLID_SCRIPT_AUDIT_PRELUDE: readonly SolidScriptLine[] = [
  line('cube', { into: 'B' }),
  line('select_faces', { which: 'All', of: '[B]', into: 'F' }),
  line('select_edges', { which: 'All', of: '[B]', into: 'E' }),
  line('select_vertices', { which: 'All', of: '[B]', into: 'P' }),
  line('variable', { name: 'Items', value: '1, 2, 3' }),
  line('variable', { name: 'Points', value: '[0, 0, 0], [1, 0, 0]' }),
  line('variable', { name: 'I', value: '2' }),
];

/** Point lines of a closed solid. */
const CORNERS = ['0, 0, 0', '1, 0, 0', '0, 1, 0', '0, 0, 1'].map((position) => line('point', { position }));

/** Vertex and face lines of a small mesh. */
const MESH = [...['0, 0, 0', '1, 0, 0', '0, 1, 0'].map((position) => line('vertex', { position })), line('face')];

/**
 * Places a command's line where it can run, keyed by command id: the lines
 * before it, and the lines after it, around the line itself. Commands not
 * listed run on their own, with their End when they open a block.
 */
const SOLID_SCRIPT_AUDIT_PLACES: Readonly<Record<string, (self: SolidScriptLine) => SolidScriptLine[][]>> = {
  polyhedron: (self) => [[], [self, ...CORNERS, line('end')]],
  point: (self) => [
    [line('polyhedron'), ...CORNERS.slice(1)],
    [self, line('end')],
  ],
  square: (self) => [[line('linear_extrude')], [self, line('end')]],
  circle: (self) => [[line('linear_extrude')], [self, line('end')]],
  offset: (self) => [[line('linear_extrude')], [self, line('square'), line('end'), line('end')]],
  polygon: (self) => [[line('linear_extrude')], [self, ...CORNERS.slice(0, 3), line('end'), line('end')]],
  linear_extrude: (self) => [[], [self, line('square'), line('end')]],
  rotate_extrude: (self) => [[], [self, line('square', { anchor: 'Left, Center' }), line('end')]],
  mesh: (self) => [[], [self, ...MESH, line('end')]],
  vertex: (self) => [
    [line('mesh'), ...MESH.slice(1, 3)],
    [self, line('face'), line('end')],
  ],
  face: (self) => [
    [line('mesh'), ...MESH.slice(0, 3)],
    [self, line('end')],
  ],
  else: (self) => [
    [line('if', { condition: '1 == 2' }), line('cube')],
    [self, line('cube'), line('end')],
  ],
  end: (self) => [[line('if', { condition: '1 == 1' }), line('cube')], [self]],
  return: (self) => [
    [line('function'), line('cube')],
    [self, line('end'), line('call')],
  ],
  use_part: (self) => [[line('part'), line('cube'), line('end')], [self]],
  call: (self) => [[line('function'), line('return', { value: '3' }), line('end')], [self]],
  set_input: (self) => [
    [line('input', { name: 'Width' }), line('when_input_changes')],
    [self, line('end')],
  ],
  show_message: (self) => [
    [line('input', { name: 'Width' }), line('when_input_changes')],
    [self, line('end')],
  ],
  when_input_changes: (self) => [[line('input', { name: 'Width' })], [self, line('end')]],
  when_button_pressed: (self) => [[line('input', { name: 'Reset', type: 'button' })], [self, line('end')]],
  show_inputs_when: (self) => [[line('input', { name: 'Rails', type: 'switch' })], [self, line('end')]],
  find_item: (self) => [[], [self]],
  delete_variable: (self) => [[], [self]],
};

/** Commands that work on faces or edges, which the prelude's faces feed. */
const SOLID_SCRIPT_AUDIT_FACES = new Set([
  'scatter_points',
  'place_on_face',
  'extrude_face',
  'inset_face',
  'bevel_edges',
  'delete_faces',
  'texture_faces',
  'find_on',
]);

/**
 * Builds the line of a command with its defaults, plus given values.
 *
 * @param command Command.
 * @param values Values over the defaults.
 * @returns Line.
 */
export function solidScriptAuditLine(
  command: SolidScriptCommand,
  values: Record<string, string> = {},
): SolidScriptLine {
  const filled: Record<string, string> = {};
  for (const parameter of command.parameters) filled[parameter.key] = parameter.default;
  if (SOLID_SCRIPT_AUDIT_FACES.has(command.id) && 'of' in filled) filled['of'] = '[F]';
  if (command.id === 'remove_item') filled['target'] = 'Points()';
  return line(command.id, { ...filled, ...values });
}

/**
 * Builds a script that runs a command's line once, after the prelude.
 *
 * @param command Command.
 * @param values Values over the defaults.
 * @returns Script and the command's line.
 */
export function solidScriptAuditScript(
  command: SolidScriptCommand,
  values: Record<string, string> = {},
): SolidScriptAuditScript {
  const self = solidScriptAuditLine(command, values);
  const place = SOLID_SCRIPT_AUDIT_PLACES[command.id];
  const [before, after] = place
    ? place(self)
    : [[], command.nesting === 'open' ? [self, line('cube'), line('end')] : [self]];
  const lines = [...SOLID_SCRIPT_AUDIT_PRELUDE, ...before!, ...after!, line('echo', { value: 'done' })];
  return { lines, at: SOLID_SCRIPT_AUDIT_PRELUDE.length + before!.length };
}

/** Every registered command. */
/**
 * Values that open a field for an audit: the field itself, and, when it is
 * shown only for some words of another field, the first of those words so the
 * line actually uses it.
 *
 * @param parameter Field under test.
 * @param value Text to put in that field.
 * @returns Values for the command line.
 */
export function solidScriptAuditFieldValues(
  parameter: { readonly key: string; readonly when?: { readonly field: string; readonly words: readonly string[] } },
  value: string,
): Record<string, string> {
  const rule = parameter.when;
  const word = rule?.words[0];
  return !rule || word === undefined ? { [parameter.key]: value } : { [rule.field]: word, [parameter.key]: value };
}

export const SOLID_SCRIPT_AUDIT_COMMANDS = solidScriptCommands.map((command) => [command.id, command] as const);
