import { describe, expect, it } from 'vitest';
import {
  SOLID_SCRIPT_COMMAND_CATEGORIES,
  solidScriptCommandFind,
  solidScriptCommandPreservesBrushes,
  solidScriptCommands,
  solidScriptCommandsOfCategory,
} from '@/solid_script/commands/solid_script_command_catalog.js';
import type { SolidScriptCommand } from '@/solid_script/commands/solid_script_command.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptShapeMeshes } from '@/solid_script/language/solid_script_mesh.js';

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

/** Sample lines inside each block that needs some, so it runs on its own. */
const SOLID_SCRIPT_SAMPLE_CHILDREN: Readonly<Record<string, readonly SolidScriptLine[]>> = {
  polyhedron: [
    { command: 'point', values: { position: '0, 0, 0' } },
    { command: 'point', values: { position: '1, 0, 0' } },
    { command: 'point', values: { position: '0, 1, 0' } },
    { command: 'point', values: { position: '0, 0, 1' } },
  ],
  polygon: [
    { command: 'point', values: { position: '0, 0, 0' } },
    { command: 'point', values: { position: '2, 0, 0' } },
    { command: 'point', values: { position: '1, 2, 0' } },
  ],
  rotate_extrude: [
    { command: 'translate', values: { v: '2, 0, 0' } },
    { command: 'square', values: { size: '0.5, 1' } },
    { command: 'end' },
  ],
  mesh: [
    { command: 'vertex', values: { position: '-1, -1, 0' } },
    { command: 'vertex', values: { position: '1, -1, 0' } },
    { command: 'vertex', values: { position: '1, 1, 0' } },
    { command: 'vertex', values: { position: '-1, 1, 0' } },
    { command: 'vertex', values: { position: '0, 0, 1.5' } },
    { command: 'face', values: { corners: '0, 3, 2, 1' } },
    { command: 'face', values: { corners: '0, 1, 4' } },
    { command: 'face', values: { corners: '1, 2, 4' } },
    { command: 'face', values: { corners: '2, 3, 4' } },
    { command: 'face', values: { corners: '3, 0, 4' } },
  ],
  mesh_brushes: [{ command: 'cube' }],
  place_on_face: [{ command: 'cube', values: { size: '0.2, 0.2, 0.2', anchor: 'Left, Bottom, Back' } }],
  texture: [{ command: 'cube' }],
  input_group: [{ command: 'input' }],
  input_row: [
    { command: 'input', values: { name: 'width' } },
    { command: 'input', values: { name: 'depth' } },
  ],
  show_inputs_when: [{ command: 'input', values: { name: 'railHeight' } }],
  if_used_as: [{ command: 'cube' }],
  offset: [{ command: 'square' }],
};

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
  const children = SOLID_SCRIPT_SAMPLE_CHILDREN[command.id] ?? [];
  const started: SolidScriptLine[] = [line, ...children.map((entry) => ({ ...entry, values: { ...entry.values } }))];
  const meshFirst: SolidScriptLine[] = [{ command: 'mesh_brushes' }, { command: 'cube' }, { command: 'end' }];
  if (
    ['merge_by_distance', 'subdivide', 'mesh_smooth', 'displace', 'flip_faces', 'inset_face', 'delete_faces'].includes(
      command.id,
    )
  ) {
    const prepared =
      command.id === 'mesh_smooth'
        ? [...meshFirst, { command: 'subdivide', values: { smooth: 'false' } }]
        : command.id === 'displace'
          ? [...meshFirst, { command: 'subdivide', values: { levels: '3', smooth: 'false' } }]
          : meshFirst;
    if (command.category === 'Faces') return [...prepared, { command: 'select_faces' }, line];
    return [...prepared, line];
  }
  if (command.category === 'Faces') {
    const pick: SolidScriptLine[] = [{ command: 'cube' }, { command: 'select_faces' }];
    if (command.id === 'select_faces') return [{ command: 'cube' }, line];
    return [...pick, ...started, ...(command.nesting === 'open' ? [{ command: 'end' }] : [])];
  }
  if (children.length > 0 && command.category === '2D Shapes')
    return [{ command: 'linear_extrude' }, ...started, { command: 'end' }, { command: 'end' }];
  if (['input_group', 'input_row', 'show_inputs_when', 'if_used_as'].includes(command.id))
    return [...started, { command: 'end' }, { command: 'cube' }];
  if (children.length > 0) return [...started, { command: 'end' }];
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
  if (command.id === 'clip') return [{ command: 'cube', values: { anchor: 'Center, Center, Center' } }, line];
  if (command.id === 'stop_script') return [{ command: 'cube' }, line, { command: 'sphere' }];
  if (command.id === 'else')
    return [counter, { command: 'if' }, { command: 'cube' }, line, { command: 'sphere' }, { command: 'end' }];
  if (command.category === 'Lists' && command.id !== 'remove_item' && command.id !== 'add_item')
    return [{ command: 'add_item', values: { list: 'items' } }, line, { command: 'cube' }];
  if (command.id === 'remove_item')
    return [{ command: 'variable', values: { name: 'points()', value: '0, 0' } }, line, { command: 'cube' }];
  if (command.id === 'end') return [{ command: 'translate' }, { command: 'cube' }, line];
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

  it('writes help in plain field text: no double-quoted text, and numbers in brackets only as vectors', () => {
    for (const command of solidScriptCommands) {
      const help = [command.manual, ...command.stops, ...command.parameters.map((entry) => entry.hint)].join(' ');
      for (const bracket of help.match(/\[\s*-?\d[^\]]*\]/g) ?? [])
        expect(bracket.split(',').length, `${command.id}: ${bracket}`).toBe(3);
      expect(help, command.id).not.toMatch(/"/);
      for (const parameter of command.parameters) expect(parameter.default, command.id).not.toMatch(/"/);
      // Points are vectors in brackets separated by commas, never semicolons.
      expect(help, command.id).not.toMatch(/\d\s*;\s*-?\d/);
      for (const parameter of command.parameters) expect(parameter.default, command.id).not.toMatch(/;/);
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

  it('stands shapes on the origin by default, and still centers them when asked', () => {
    for (const id of ['cube', 'cylinder', 'sphere']) {
      const [shape] = run({ command: id }).shapes;
      const points = shape?.kind === 'solid' ? shape.points : [];
      const ys = points.map((point) => point.y);
      const midX = points.reduce((total, point) => total + point.x, 0) / Math.max(points.length, 1);
      const midZ = points.reduce((total, point) => total + point.z, 0) / Math.max(points.length, 1);
      expect(Math.min(...ys), id).toBeCloseTo(0, 9);
      expect(Math.abs(midX), `${id} x`).toBeLessThan(1e-9);
      expect(Math.abs(midZ), `${id} z`).toBeLessThan(1e-9);
    }
    for (const id of ['cube', 'cylinder', 'sphere']) {
      const [shape] = run({ command: id, values: { anchor: 'Center, Center, Center' } }).shapes;
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
    expect(solidScriptCommandFind('cube')?.nesting).toBe('none');
    expect(solidScriptCommandFind('else')?.nesting).toBe('continue');
    expect(solidScriptCommandFind('end')?.nesting).toBe('close');
    expect(solidScriptCommandFind('end')?.inPalette).toBe(true);
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
      { key: 'anchor', label: 'Anchor', value: 'Center, Bottom, Center' },
      { key: 'mode', label: 'Mode', value: '' },
      { key: 'label', label: 'Name', value: '' },
      { key: 'into', label: 'Into', value: '' },
    ]);
  });

  it('gives round shapes their own sides and rings, named like the primitive generators', () => {
    expect(solidScriptCommandFind('sphere')?.parameters.map((entry) => entry.key)).toEqual([
      'r',
      'sides',
      'rings',
      'anchor',
      'mode',
      'label',
      'into',
    ]);
    expect(solidScriptCommandFind('cylinder')?.parameters.map((entry) => entry.key)).toContain('sides');
    expect(solidScriptCommandFind('circle')?.parameters.map((entry) => entry.key)).toContain('sides');
    const low = run({ command: 'sphere', values: { sides: '4', rings: '2' } }).shapes[0];
    const high = run({ command: 'sphere', values: { sides: '32', rings: '16' } }).shapes[0];
    expect(low?.kind === 'solid' && high?.kind === 'solid' && low.points.length < high.points.length).toBe(true);
    expect(run({ command: 'sphere', values: { sides: '2' } }).error?.message).toMatch(/Sides/);
  });

  it('lets every field whose hint allows it stay empty', () => {
    const strict = solidScriptCommands.flatMap((command) =>
      command.parameters
        .filter((parameter) => /\b(empty|blank)\b/i.test(parameter.hint) && parameter.optional !== true)
        .map((parameter) => `${command.label}: ${parameter.label}`),
    );
    expect(strict).toEqual([]);
  });

  it('lists the allowed words of every field that takes one of a few words', () => {
    const word = (id: string, key: string): string[] =>
      (solidScriptCommandFind(id)?.parameters.find((parameter) => parameter.key === key)?.words ?? []).map(
        (entry) => entry.word,
      );
    expect(word('select_faces', 'which')).toEqual(expect.arrayContaining(['All', 'Facing Up', 'Tagged', 'Where']));
    expect(word('select_faces', 'how')).toEqual(['New', 'Add', 'Remove']);
    expect(word('if_used_as', 'use')).toEqual(['Generator', 'Modifier']);
    expect(word('input_brushes', 'textures')).toEqual(['Move With Shape', 'World Aligned']);
    expect(word('input', 'type')).toContain('Texture');
    expect(word('stairs', 'direction')).toEqual(['Right', 'Left', 'Front', 'Back']);
    const missing = solidScriptCommands.flatMap((command) =>
      command.parameters
        .filter((parameter) => /One of:/.test(parameter.hint) && (parameter.words?.length ?? 0) === 0)
        .map((parameter) => `${command.id}.${parameter.key}`),
    );
    expect(missing).toEqual([]);
  });

  it('sorts the palette commands of every group by display name', () => {
    for (const category of SOLID_SCRIPT_COMMAND_CATEGORIES) {
      const labels = solidScriptCommandsOfCategory(category).map((command) => command.label);
      expect(labels, category).toEqual([...labels].sort((left, right) => left.localeCompare(right)));
    }
  });

  it('never turns a brush into a mesh when the command is declared as keeping brushes', () => {
    const converters = solidScriptCommands.filter((command) => !solidScriptCommandPreservesBrushes(command));
    expect(converters.map((command) => command.id).sort()).toEqual(['grid_mesh', 'mesh', 'mesh_brushes']);
    const projectUvs = solidScriptCommandFind('project_uvs');
    expect(projectUvs && projectUvs.category === 'Faces').toBe(true);
    const boxUvs = solidScriptCommandFind('box_uvs');
    expect(boxUvs && solidScriptCommandPreservesBrushes(boxUvs)).toBe(true);
    const hint = /no longer be a convex brush.+Mesh From Brushes first/;
    const refused = [
      'merge_by_distance',
      'subdivide',
      'mesh_smooth',
      'displace',
      'flip_faces',
      'inset_face',
      'delete_faces',
    ];
    for (const id of refused) {
      const pick = id === 'inset_face' || id === 'delete_faces' ? [{ command: 'select_faces' }] : [];
      const result = run({ command: 'cube' }, ...pick, { command: id });
      expect(result.error?.message ?? '', id).toMatch(hint);
      expect(solidScriptShapeMeshes(result.shapes), id).toHaveLength(0);
    }
    const skip = new Set([...refused, 'vertex', 'face', 'curve_to_mesh']);
    for (const command of solidScriptCommands.filter(
      (entry) => solidScriptCommandPreservesBrushes(entry) && !skip.has(entry.id),
    )) {
      const result = run(...standalone(command));
      expect(result.error?.message ?? null, command.id).toBeNull();
      expect(solidScriptShapeMeshes(result.shapes), command.id).toHaveLength(0);
    }
  });
});
