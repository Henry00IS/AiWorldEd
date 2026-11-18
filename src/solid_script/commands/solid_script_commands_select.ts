import { SolidScriptCommand, type SolidScriptCommandWord } from './solid_script_command.js';
import { solidScriptListingOptions } from './solid_script_command_listing.js';
import {
  solidScriptParameterInto,
  solidScriptParameterOf,
  solidScriptParameterOptional,
  solidScriptParameterWords,
} from './solid_script_command_parameters.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import type { SolidScriptSelectedKind } from '@/solid_script/language/solid_script_machine_variables.js';
import {
  SolidScriptElement,
  solidScriptValueNumber,
  solidScriptValueTruthy,
  solidScriptValueType,
  type SolidScriptValue,
} from '@/solid_script/language/solid_script_value.js';

/** Ways How adds a pick to the one before. */
const SOLID_SCRIPT_SELECT_HOW: readonly SolidScriptCommandWord[] = [
  { word: 'New', detail: 'Start a new pick' },
  { word: 'Add', detail: 'Pick more' },
  { word: 'Remove', detail: 'Drop these from the pick' },
];

/** What one Select line picks. */
interface SolidScriptSelectKind {
  id: string;
  label: string;
  /** Plural, as in messages. */
  many: string;
  /** Example for the manual. */
  example: string;
  /** Name of the value a Where condition reads, such as Edge. */
  item: string;
  selected: SolidScriptSelectedKind;
  /** Kinds of element it picks from. */
  from: readonly string[];
  words: readonly SolidScriptCommandWord[];
  /** Lists the items of an element. */
  items: (run: SolidScriptBlockRun, element: SolidScriptElement) => SolidScriptElement[];
  /** Size an item is ranked by for Longest and Shortest. */
  size?: (run: SolidScriptBlockRun, item: SolidScriptElement) => number;
}

/**
 * Reads the elements a Select line picks from: its Of, else [$Selected.Faces]
 * when faces are picked, else [$Selected.Brushes].
 *
 * @param run Running line.
 * @param kind What it picks.
 * @returns Elements.
 */
function solidScriptSelectFrom(run: SolidScriptBlockRun, kind: SolidScriptSelectKind): SolidScriptElement[] {
  const faces = run.selectedGet('faces');
  const from = run.ofValues() ?? (faces.length > 0 ? faces : run.selectedGet('brushes'));
  if (from.length === 0)
    throw new Error(`${kind.label} has no brushes to pick from; add a brush such as Cube above it`);
  return from.map((value) => {
    if (!(value instanceof SolidScriptElement) || !kind.from.includes(value.kind))
      throw new Error(`${kind.label} picks from brushes, faces or edges, not ${solidScriptValueType(value)}`);
    return value;
  });
}

/**
 * Lists every item of the elements once.
 *
 * @param run Running line.
 * @param kind What it picks.
 * @returns Items.
 */
function solidScriptSelectItems(run: SolidScriptBlockRun, kind: SolidScriptSelectKind): SolidScriptElement[] {
  const items: SolidScriptElement[] = [];
  for (const element of solidScriptSelectFrom(run, kind))
    for (const item of kind.items(run, element)) if (!items.includes(item)) items.push(item);
  return items;
}

/**
 * Keeps the items Which and Detail pick.
 *
 * @param run Running line.
 * @param kind What it picks.
 * @param items Items to pick from.
 * @returns Picked items.
 */
function solidScriptSelectWhich(
  run: SolidScriptBlockRun,
  kind: SolidScriptSelectKind,
  items: SolidScriptElement[],
): SolidScriptElement[] {
  const which = run.text('which').trim();
  if (which === 'All') return items;
  if (which === 'Where')
    return items.filter((item) => solidScriptValueTruthy(run.valueWith('detail', { [kind.item]: item })));
  const size = kind.size;
  if (!size || (which !== 'Longest' && which !== 'Shortest'))
    throw new Error(`Which must be one of ${kind.words.map((entry) => entry.word).join(', ')}, not "${which}"`);
  const count = run.text('detail').trim() === '' ? 1 : solidScriptValueNumber(run.value('detail'));
  if (count === undefined || !Number.isInteger(count) || count < 1)
    throw new Error(`${which} needs a whole number of ${kind.many} in Detail, such as 1`);
  const sign = which === 'Longest' ? -1 : 1;
  return [...items].sort((a, b) => sign * (size(run, a) - size(run, b))).slice(0, count);
}

/**
 * Joins a pick with the one before as How says, and writes it.
 *
 * @param run Running line.
 * @param kind What it picks.
 * @param picked Picked items.
 */
function solidScriptSelectWrite(
  run: SolidScriptBlockRun,
  kind: SolidScriptSelectKind,
  picked: SolidScriptValue[],
): void {
  const how = run.text('how').trim();
  if (!SOLID_SCRIPT_SELECT_HOW.some((entry) => entry.word === how))
    throw new Error(`How must be New, Add or Remove, not "${how}"`);
  const before = how === 'New' ? [] : run.selectedGet(kind.selected);
  const after =
    how === 'Remove'
      ? before.filter((item) => !picked.includes(item))
      : [...before, ...picked.filter((item) => !before.includes(item))];
  run.selectedSet(kind.selected, after);
  const into = run.text('into').trim();
  if (into !== '') run.variableSet(into.replace(/^\[(.*)\]$/s, '$1'), after);
}

/**
 * Builds one Select line.
 *
 * @param kind What it picks.
 * @returns Command.
 */
function solidScriptSelectCommand(kind: SolidScriptSelectKind): SolidScriptCommand {
  const words = kind.words.map((entry) => entry.word);
  return new SolidScriptCommand({
    id: kind.id,
    label: kind.label,
    category: 'Faces',
    description: `Pick ${kind.many} of brushes or faces`,
    manual: `Picks ${kind.many} and puts them in [$Selected.${kind.item === 'Edge' ? 'Edges' : 'Vertices'}], where lines with an empty Of find them. Of says where to pick from: brushes, faces or edges; empty uses [$Selected.Faces], or [$Selected.Brushes] when no faces are picked. Into also writes them to a variable, a ${kind.item} list. Where tests each one as [${kind.item}], such as [=[${kind.item}.${kind.item === 'Edge' ? 'Length' : 'Position.y'}] > 1]. How adds to or removes from the ${kind.many} picked before. Example: ${kind.example}`,
    stops: [
      'No brushes to pick from.',
      'A Which that is not one of the choices.',
      `An Of that is not brushes, faces or edges.`,
    ],
    parameters: [
      solidScriptParameterWords(
        'which',
        'Which',
        'text',
        'All',
        `How to pick. One of: ${words.join(', ')}.`,
        kind.words,
      ),
      solidScriptParameterOptional(
        'detail',
        'Detail',
        'value',
        kind.size ? 'How many for Longest or Shortest, a condition for Where.' : 'A condition for Where.',
      ),
      solidScriptParameterOf(`brushes, faces or edges to pick ${kind.many} of`, '$Selected.Faces'),
      solidScriptParameterWords(
        'how',
        'How',
        'text',
        'New',
        'New starts again, Add picks more, Remove drops them. One of: New, Add, Remove.',
        SOLID_SCRIPT_SELECT_HOW,
      ),
      solidScriptParameterInto(`the picked ${kind.many}, a ${kind.item} list`, `${kind.item} List`, 'what is made'),
    ],
    listing: (read) => [
      kind.label,
      ' ',
      read.text('which').trim(),
      ...(read.text('detail').trim() === '' ? [] : [' ', read.value('detail')]),
      ...(read.text('of') === '' ? [] : [' Of ', read.value('of')]),
      ...solidScriptListingOptions([read.text('how').trim() !== 'New' && [read.text('how').trim()]]),
      ...(read.text('into') === '' ? [] : [' Into ', read.variable('into')]),
    ],
    execute: (run) => {
      solidScriptSelectWrite(run, kind, solidScriptSelectWhich(run, kind, solidScriptSelectItems(run, kind)));
      return [];
    },
  });
}

/** Select Edges and Select Vertices. */
export const SOLID_SCRIPT_COMMANDS_SELECT: readonly SolidScriptCommand[] = [
  solidScriptSelectCommand({
    id: 'select_edges',
    label: 'Select Edges',
    many: 'edges',
    example: 'Cube, then Select Edges Longest 4 and Bevel Edges rounds the four longest edges.',
    item: 'Edge',
    selected: 'edges',
    from: ['brush', 'face', 'edge'],
    words: [
      { word: 'All', detail: 'Every edge' },
      { word: 'Longest', detail: 'The longest edges; Detail says how many' },
      { word: 'Shortest', detail: 'The shortest edges; Detail says how many' },
      { word: 'Where', detail: 'The edges a condition in Detail holds for, with [Edge]' },
    ],
    items: (run, element) => run.elements.edges(element).map((edge) => run.elements.edge(edge)),
    size: (run, item) => run.elements.edges(item)[0]?.length ?? 0,
  }),
  solidScriptSelectCommand({
    id: 'select_vertices',
    label: 'Select Vertices',
    many: 'corners',
    example: 'Cube, then Select Vertices Where [=[Vertex.Position.y] > 0] Into Up, and Print [Up.Count] shows 4.',
    item: 'Vertex',
    selected: 'vertices',
    from: ['brush', 'face', 'edge'],
    words: [
      { word: 'All', detail: 'Every corner' },
      { word: 'Where', detail: 'The corners a condition in Detail holds for, with [Vertex]' },
    ],
    items: (run, element) => {
      const leaf = run.elements.leaf(element);
      return run.elements.vertices(element).map((vertex) => run.elements.vertex(leaf, vertex));
    },
  }),
];
