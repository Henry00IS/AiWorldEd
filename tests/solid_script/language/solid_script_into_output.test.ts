import { describe, expect, it } from 'vitest';
import { solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';
import type { SolidScriptCommand } from '@/solid_script/commands/solid_script_command.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptGeometryLeaves } from '@/solid_script/language/solid_script_geometry.js';
import { solidScriptProgramRun, type SolidScriptProgramOptions } from '@/solid_script/language/solid_script_program.js';
import type { SolidScriptUseFacts } from '@/solid_script/language/solid_script_system.js';

const END: SolidScriptLine = { command: 'end' };
const CUBE: SolidScriptLine = { command: 'cube', values: { size: '2, 2, 2', anchor: 'Center, Center, Center' } };
const HELD = 'Held';
const MESH_TOOLS = new Set([
  'inset_face',
  'delete_faces',
  'merge_by_distance',
  'subdivide',
  'mesh_smooth',
  'displace',
  'flip_faces',
]);
const FACE_TOOLS = new Set([
  'extrude_face',
  'texture_faces',
  'scale_faces',
  'box_uvs',
  'project_uvs',
  'unwrap',
  'pack_islands',
  'transform_uvs',
  'inset_face',
  'delete_faces',
]);
const RECEIVED: SolidScriptUseFacts = {
  usage: 'Modifier',
  solids: [
    [
      [-1, -1, -1],
      [1, -1, -1],
      [-1, 1, -1],
      [1, 1, -1],
      [-1, -1, 1],
      [1, -1, 1],
      [-1, 1, 1],
      [1, 1, 1],
    ],
  ],
  faces: 6,
};

/**
 * Commands that declare an Into field.
 *
 * @returns Commands.
 */
function withInto(): SolidScriptCommand[] {
  return solidScriptCommands.filter((command) => command.parameters.some((field) => field.key === 'into'));
}

/**
 * Line of a command with its defaults and Into set.
 *
 * @param command Command.
 * @param values Extra values.
 * @returns Line.
 */
function intoLine(command: SolidScriptCommand, values: Record<string, string> = {}): SolidScriptLine {
  return { command: command.id, values: { ...command.valuesDefault(), into: HELD, ...values } };
}

/**
 * Runs script lines.
 *
 * @param lines Lines.
 * @param options Run options.
 * @returns Run result.
 */
function run(lines: readonly SolidScriptLine[], options?: SolidScriptProgramOptions) {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines), { profile: true, ...options });
}

/**
 * World leaves of a successful run.
 *
 * @param lines Lines.
 * @param options Run options.
 * @returns Leaves in the output.
 */
function world(lines: readonly SolidScriptLine[], options?: SolidScriptProgramOptions) {
  const result = run(lines, options);
  expect(result.error?.message ?? null).toBeNull();
  return solidScriptGeometryLeaves(result.shapes);
}

/**
 * Children a building block needs so it can run with Into.
 *
 * @param command Command.
 * @returns Lines after the opener, or null to use the opener alone.
 */
function builderTail(command: SolidScriptCommand): SolidScriptLine[] | null {
  if (command.id === 'polyhedron')
    return [
      { command: 'point', values: { position: '0, 0, 0' } },
      { command: 'point', values: { position: '1, 0, 0' } },
      { command: 'point', values: { position: '0, 1, 0' } },
      { command: 'point', values: { position: '0, 0, 1' } },
      END,
    ];
  if (command.id === 'linear_extrude') return [{ command: 'square' }, END];
  if (command.id === 'rotate_extrude') return [{ command: 'square', values: { anchor: 'Left, Center' } }, END];
  if (command.id === 'mesh')
    return [
      { command: 'vertex', values: { position: '0, 0, 0' } },
      { command: 'vertex', values: { position: '1, 0, 0' } },
      { command: 'vertex', values: { position: '0, 1, 0' } },
      { command: 'face' },
      END,
    ];
  if (command.id === 'mesh_brushes' || command.id === 'group' || command.id === 'hull') return [CUBE, END];
  if (command.id === 'place_at_points') return [CUBE, END];
  if (command.nesting === 'open') return [CUBE, END];
  return null;
}

/**
 * Script that builds only into Held, plus an optional Output of Held.
 *
 * @param command Building command.
 * @param output True to stamp Held into the world.
 * @returns Lines and run options.
 */
function builderScript(
  command: SolidScriptCommand,
  output: boolean,
): { lines: SolidScriptLine[]; options?: SolidScriptProgramOptions } {
  if (command.id === 'input_brushes') {
    const lines = [intoLine(command), ...(output ? [{ command: 'output', values: { of: '[Held]' } }] : [])];
    return { lines, options: { use: RECEIVED } };
  }
  if (command.id === 'place_on_face') {
    const lines = [
      CUBE,
      { command: 'select_brushes' },
      { command: 'select_faces', values: { which: 'Facing Up' } },
      intoLine(command),
      { command: 'cube', values: { size: '0.2, 0.2, 0.2', anchor: 'Center, Bottom, Center' } },
      END,
      ...(output ? [{ command: 'output', values: { of: '[Held]' } }] : []),
    ];
    return { lines };
  }
  const extra = command.id === 'place_at_points' ? { at: '0, 2, 0' } : {};
  const tail = builderTail(command);
  const lines = [
    intoLine(command, extra),
    ...(tail ?? []),
    ...(output ? [{ command: 'output', values: { of: '[Held]' } }] : []),
  ];
  return { lines };
}

/**
 * Host brushes or meshes a tool with Into should leave unchanged in the world.
 *
 * @param command Tool.
 * @returns Lines before the tool.
 */
function toolHost(command: SolidScriptCommand): SolidScriptLine[] {
  if (MESH_TOOLS.has(command.id)) {
    const faces = FACE_TOOLS.has(command.id) ? [{ command: 'select_faces', values: { which: 'All' } }] : [];
    return [{ command: 'mesh_brushes' }, CUBE, END, { command: 'select_brushes' }, ...faces];
  }
  if (command.id === 'bevel_edges')
    return [CUBE, { command: 'select_brushes' }, { command: 'select_edges', values: { which: 'All' } }];
  const faces = FACE_TOOLS.has(command.id) ? [{ command: 'select_faces', values: { which: 'All' } }] : [];
  const uvs = command.id === 'unwrap' || command.id === 'pack_islands' ? [{ command: 'project_uvs' }] : [];
  return [CUBE, { command: 'select_brushes' }, ...faces, ...uvs];
}

/**
 * Scripts that write only point or pick lists into Held.
 *
 * @param command Command.
 * @returns Lines, or null when this is not a list writer.
 */
function listScript(command: SolidScriptCommand): SolidScriptLine[] | null {
  if (command.id === 'path' || command.id === 'filter_list') return [intoLine(command)];
  if (command.id === 'scatter_points' || command.id.startsWith('points_from_') || command.id === 'find_on')
    return [
      CUBE,
      { command: 'select_brushes' },
      { command: 'select_faces', values: { which: 'All' } },
      intoLine(command),
    ];
  if (command.id === 'select_brushes') return [CUBE, intoLine(command)];
  if (command.id.startsWith('select_'))
    return [CUBE, { command: 'select_brushes' }, intoLine(command, { which: 'All', of: '' })];
  return null;
}

describe('Into-set results stay out of the world until Output', () => {
  it('covers every command that has an Into field', () => {
    const ids = withInto()
      .map((command) => command.id)
      .sort();
    const builders = withInto().filter((command) => command.builds || command.id === 'input_brushes');
    const tools = withInto().filter((command) => command.edits);
    const lists = withInto().filter((command) => listScript(command));
    const covered = new Set([...builders, ...tools, ...lists].map((command) => command.id));
    expect(ids.filter((id) => !covered.has(id))).toEqual([]);
  });

  it('does not give Grid Mesh an Into field', () => {
    const grid = solidScriptCommands.find((command) => command.id === 'grid_mesh');
    expect(grid?.parameters.some((field) => field.key === 'into')).toBe(false);
  });

  it.each(
    withInto()
      .filter((command) => command.builds || command.id === 'input_brushes')
      .map((command) => [command.id, command] as const),
  )('%s with Into is absent from the output until Output places it', (_id, command) => {
    const hidden = builderScript(command, false);
    const withheld = world(hidden.lines, hidden.options);
    const shown = builderScript(command, true);
    const placed = world(shown.lines, shown.options);
    const added = placed.length - withheld.length;
    expect(added).toBeGreaterThan(0);
    if (command.id === 'place_on_face') expect(withheld).toHaveLength(1);
    else expect(withheld).toHaveLength(0);
  });

  it.each(
    withInto()
      .filter((command) => command.edits)
      .map((command) => [command.id, command] as const),
  )('%s with Into leaves the original in the output and keeps the copy in the variable', (_id, command) => {
    const host = toolHost(command);
    const original = world(host);
    const copied = world([...host, intoLine(command)]);
    expect(copied).toHaveLength(original.length);
    if (command.id === 'bevel_edges') {
      const result = run([...host, intoLine(command), { command: 'echo', values: { value: '[=[Held.Count]]' } }]);
      expect(result.error?.message ?? null).toBeNull();
      expect(Number(result.messages[0])).toBeGreaterThan(0);
      return;
    }
    const placed = world([...host, intoLine(command), { command: 'output', values: { of: '[Held]' } }]);
    expect(placed.length).toBeGreaterThan(original.length);
  });

  it.each(
    withInto()
      .filter((command) => listScript(command))
      .map((command) => [command.id, command] as const),
  )('%s with Into does not add brushes of its own to the output', (_id, command) => {
    const lines = listScript(command);
    if (!lines) throw new Error(`missing list script for ${command.id}`);
    const result = run(lines);
    expect(result.error?.message ?? null).toBeNull();
    const leaves = solidScriptGeometryLeaves(result.shapes);
    if (command.id === 'path' || command.id === 'filter_list') expect(leaves).toHaveLength(0);
    else expect(leaves).toHaveLength(1);
  });

  it('warns when a Cube is only stored Into a variable, and traces the line', () => {
    const result = run([{ ...CUBE, values: { ...CUBE.values, into: HELD } }]);
    expect(result.error?.message ?? null).toBeNull();
    expect(solidScriptGeometryLeaves(result.shapes)).toHaveLength(0);
    expect(result.warnings).toEqual([
      {
        line: null,
        text: 'The script builds no brushes or meshes; add one such as Cube, or Output a variable.',
      },
    ]);
    expect(result.passed).toContain(1);
    expect(result.variables.some((entry) => entry.name === HELD)).toBe(true);
  });

  it('does not warn, and the preview has the brush, when Output places the variable', () => {
    const result = run(
      [
        { ...CUBE, values: { ...CUBE.values, into: HELD } },
        { command: 'output', values: { of: '[Held]' } },
      ],
      { context: 'preview' },
    );
    expect(result.error?.message ?? null).toBeNull();
    expect(result.warnings).toEqual([]);
    expect(solidScriptGeometryLeaves(result.shapes)).toHaveLength(1);
    expect(result.passed).toEqual(expect.arrayContaining([1, 2]));
    expect(result.variables.some((entry) => entry.name === HELD)).toBe(true);
  });
});
