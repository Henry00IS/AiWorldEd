import type { SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptAuditLine } from './solid_script_audit_lines.js';

/**
 * A small seeded random source, so a failing script can be built again from its
 * seed.
 */
export function solidScriptAuditRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Names the random scripts write and read. */
const NAMES = ['A', 'C', 'D'];

/** Picks one item. */
const pick = <T>(random: () => number, items: readonly T[]): T => items[Math.floor(random() * items.length)]!;

/** Builds a line. */
const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });

/** Values of every kind a Set may give, some read from other names. */
const VALUES = (random: () => number): string =>
  pick(random, [
    '2',
    'abc',
    'Yes',
    'No',
    '[1, 2, 3]',
    '1, 2, 3, 4',
    'a, b',
    '',
    `[${pick(random, NAMES)}]`,
    `[=[${pick(random, NAMES)}] + 1]`,
    `[=IsNum([${pick(random, NAMES)}])]`,
    '[B]',
    '[B.Faces]',
    `[${pick(random, NAMES)}.First]`,
    `[=Len([${pick(random, NAMES)}])]`,
    '[$Selected.Faces]',
    `[${pick(random, NAMES)}(0)]`,
  ]);

/** Plain lines that write or change a name. */
const PLAIN: readonly ((random: () => number, name: string) => SolidScriptLine)[] = [
  (random, name) => line('variable', { name, value: VALUES(random) }),
  (random, name) => line('variable', { name, value: VALUES(random) }),
  (_random, name) => line('cube', { into: name }),
  (random, name) =>
    line('select_faces', { which: 'All', of: pick(random, ['[B]', `[${pick(random, NAMES)}]`]), into: name }),
  (_random, name) => line('select_edges', { which: 'All', of: '[B]', into: name }),
  (random, name) => line('add_item', { list: name, value: VALUES(random) }),
  (_random, name) => line('clear_variable', { name }),
  (_random, name) => line('make_dictionary', { into: name, keys: 'K, L', values: '1, 2' }),
  (random, name) =>
    line('add_entry', { dictionary: name, key: pick(random, ['K', 'L', 'Wood', '2x']), value: VALUES(random) }),
  (random, name) => line('remove_entry', { dictionary: name, key: pick(random, ['K', 'L']) }),
  (random, name) => line('merge_dictionary', { dictionary: name, from: `[${pick(random, NAMES)}]` }),
  (_random, name) => line('delete_variable', { name }),
  (_random, name) => line('remove_item', { target: `${name}()` }),
  (random, name) => line('remove_value', { list: name, value: VALUES(random) }),
  (_random, name) => line('sort_list', { list: name }),
  (_random, name) => line('reverse_list', { list: name }),
  (random, name) => line('find_item', { list: pick(random, NAMES), value: '2', result: name }),
  (random, name) => line('call', { name: 'F', values: VALUES(random), result: name }),
  (random, name) => line('extrude_face', { of: `[${pick(random, NAMES)}]`, top: name }),
  (random, name) => line('scatter_on_faces', { of: '[B]', count: '3', into: name, normals: pick(random, NAMES) }),
  (_random, name) => line('inset_face', { of: '[MF]', inner: name }),
  (random, name) => line('variable', { name: `${name}(0)`, value: VALUES(random) }),
  (random) => line('variable', { name: `${pick(random, NAMES)}.Data.K`, value: VALUES(random) }),
  (random) =>
    solidScriptAuditLine(
      pick(
        random,
        solidScriptCommands.filter(
          (command) =>
            (!command.nesting || command.nesting === 'none') &&
            ![
              'inset_face',
              'delete_faces',
              'delete_edges',
              'delete_vertices',
              'join_meshes',
              'merge_by_distance',
              'merge_points',
              'subdivide',
              'mesh_smooth',
              'displace',
              'flip_faces',
            ].includes(command.id),
        ),
      ),
    ),
];

/** Conditions an If tests, some of them narrowing a name. */
const CONDITIONS = (random: () => number): string =>
  pick(random, [
    `[${pick(random, NAMES)}] > 1`,
    `IsNum([${pick(random, NAMES)}])`,
    `[${pick(random, NAMES)}] == "abc"`,
    '1 == 2',
    `IsList([${pick(random, NAMES)}])`,
  ]);

/**
 * Builds random lines at one depth: plain lines, and blocks with lines inside.
 *
 * @param random Random source.
 * @param depth How many blocks deep.
 * @returns Lines.
 */
function solidScriptAuditLines(random: () => number, depth: number): SolidScriptLine[] {
  const lines: SolidScriptLine[] = [];
  const count = 1 + Math.floor(random() * 4);
  for (let index = 0; index < count; index++) {
    const name = pick(random, NAMES);
    const roll = random();
    if (depth < 2 && roll < 0.12)
      lines.push(
        line('if', { condition: CONDITIONS(random) }),
        ...solidScriptAuditLines(random, depth + 1),
        ...(random() < 0.5 ? [line('else'), ...solidScriptAuditLines(random, depth + 1)] : []),
        line('end'),
      );
    else if (depth < 2 && roll < 0.2)
      lines.push(
        line('repeat', { variable: name, from: '0', to: '2' }),
        ...solidScriptAuditLines(random, depth + 1),
        line('end'),
      );
    else if (depth < 2 && roll < 0.28)
      lines.push(
        line('for_each', { variable: name, list: `[${pick(random, NAMES)}]`, key: pick(random, ['', 'K']) }),
        ...solidScriptAuditLines(random, depth + 1),
        line('end'),
      );
    else lines.push(pick(random, PLAIN)(random, name));
  }
  return lines;
}

/**
 * Builds one random script from a seed: a brush B, a Function F that gives back
 * or changes what it is given, then random lines.
 *
 * @param seed Seed.
 * @returns Lines.
 */
export function solidScriptAuditFuzz(seed: number): SolidScriptLine[] {
  const random = solidScriptAuditRandom(seed);
  const body = pick(random, [
    [line('return', { value: '[$Local.P]' })],
    [line('variable', { name: 'A', value: '[$Local.P]' }), line('return', { value: '[=[$Local.P] + 1]' })],
    [
      line('if', { condition: 'IsNum([$Local.P])' }),
      line('return', { value: 'abc' }),
      line('end'),
      line('return', { value: '[$Local.P]' }),
    ],
  ]);
  return [
    line('cube', { into: 'B' }),
    line('mesh_from_solids', { into: 'M' }),
    line('cube'),
    line('end'),
    line('select_faces', { which: 'All', of: '[M]', into: 'MF' }),
    line('function', { name: 'F', parameters: 'P' }),
    ...body,
    line('end'),
    ...solidScriptAuditLines(random, 0),
  ];
}
