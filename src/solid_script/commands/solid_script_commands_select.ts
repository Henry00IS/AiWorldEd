import { solidScriptKindNamed } from '@/solid_script/language/solid_script_kinds.js';
import { SolidScriptCommand, type SolidScriptCommandWord } from './solid_script_command.js';
import type { SolidScriptCommandEach } from './solid_script_command_each.js';
import { solidScriptListingOptions } from './solid_script_command_listing.js';
import {
  solidScriptParameterInto,
  solidScriptOfAccepts,
  solidScriptParameterOf,
  solidScriptParameterOptional,
  solidScriptParameterWords,
} from './solid_script_command_parameters.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import type { SolidScriptSelectedKind } from '@/solid_script/language/solid_script_machine_variables.js';
import { SOLID_SCRIPT_SELECT_NEW, solidScriptOfEmpty } from '@/solid_script/language/solid_script_select.js';
import { solidScriptConditionHolds } from '@/solid_script/language/solid_script_condition.js';
import { solidScriptGeometryLeaves } from '@/solid_script/language/solid_script_geometry.js';
import { SolidScriptElement, type SolidScriptValue } from '@/solid_script/language/solid_script_value.js';

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
  item: SolidScriptCommandEach;
  selected: SolidScriptSelectedKind;
  /** Kinds of element it picks from. */
  from: readonly string[];
  words: readonly SolidScriptCommandWord[];
  /** Lists the items of an element. */
  items: (run: SolidScriptBlockRun, element: SolidScriptElement) => SolidScriptElement[];
  /** Replaces Of as the pool to pick from, such as every built brush. */
  pool?: (run: SolidScriptBlockRun) => SolidScriptElement[];
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
  if (kind.pool) return kind.pool(run);
  const given = run.ofValues();
  const faces = run.selectedGet('faces');
  const from = given ?? (faces.length > 0 ? faces : run.selectedGet('brushes'));
  if (from.length === 0)
    throw new Error(
      given
        ? `${kind.label} has no ${kind.many} in Of; check that Of holds brushes, faces or edges`
        : solidScriptOfEmpty(kind.label, faces.length > 0 ? 'faces' : 'brushes'),
    );
  return from.map((value) => {
    if (!(value instanceof SolidScriptElement) || !kind.from.includes(value.kind))
      throw new Error(`${kind.label} picks from brushes, faces or edges, not ${solidScriptKindNamed(value)}`);
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
 * The Of field of a Select line.
 *
 * @param kind What it picks.
 * @returns Parameter.
 */
function solidScriptSelectOf(kind: SolidScriptSelectKind) {
  if (kind.pool) {
    return {
      ...solidScriptParameterOptional(
        'of',
        'Of',
        'value',
        'The brushes to pick from: a variable such as [Wall], a list, or a Name given to brushes; empty uses every brush and mesh built so far, and those a modifier has received.',
      ),
      placeholder: 'every built brush',
      nameGroups: ['Brushes', 'Parts'] as const,
      accepts: solidScriptOfAccepts(['Brush']),
    };
  }
  return solidScriptParameterOf(`brushes, faces or edges to pick ${kind.many} of`, '$Selected.Faces', [
    'Brush',
    'Face',
    'Edge',
  ]);
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
    description: `Pick ${kind.many}`,
    fills:
      kind.item === 'Edge' ? ['$Edge', '$Index'] : kind.item === 'Brush' ? ['$Brush', '$Index'] : ['$Vertex', '$Index'],
    manual: `Picks ${kind.many} and puts them in [$Selected.${kind.item === 'Edge' ? 'Edges' : kind.item === 'Brush' ? 'Brushes' : 'Vertices'}], where lines with an empty Of find them. ${kind.item === 'Brush' ? 'Of says which brushes to pick from; empty uses every brush and mesh built so far, and those a modifier has received.' : 'Of says where to pick from: brushes, faces or edges; empty uses [$Selected.Faces], or [$Selected.Brushes] when no faces are picked.'} Which All keeps every one, the same as a Where left off. Which New keeps only what was created since the previous ${kind.label}. Where is a 🔁 condition each remaining one must pass, with [$${kind.item}] the item being tested, such as [=[$${kind.item}.${kind.item === 'Edge' ? 'Length' : kind.item === 'Brush' ? 'Size.X' : 'Position.Y'}] > 1], and [$Index] its number from 0. Left off, Where keeps what Which picked. How adds to or removes from the ${kind.many} picked before. Into also writes them to a variable, a ${kind.item} list. Example: ${kind.example}`,
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
      {
        ...solidScriptParameterOptional(
          'where',
          'Where',
          'value',
          `A 🔁 condition each of the ${kind.many} must pass, such as [=[$${kind.item}.${kind.item === 'Edge' ? 'Length' : kind.item === 'Brush' ? 'Size.X' : 'Position.Y'}] > 1], with [$${kind.item}] the item being tested and [$Index] its number from 0. Left off keeps every one Which picked.`,
        ),
        each: kind.item,
      },
      solidScriptSelectOf(kind),
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
      ...(read.text('where').trim() === '' ? [] : [' Where ', read.value('where')]),
      ...(read.text('of') === '' ? [] : [' Of ', read.value('of')]),
      ...solidScriptListingOptions([read.text('how').trim() !== 'New' && [read.text('how').trim()]]),
      ...(read.text('into') === '' ? [] : [' Into ', read.variable('into')]),
    ],
    execute: (run) => {
      const pool = solidScriptSelectItems(run, kind);
      const which = run.text('which').trim();
      if (which !== 'All' && which !== SOLID_SCRIPT_SELECT_NEW)
        throw new Error(`Which must be one of ${kind.words.map((entry) => entry.word).join(', ')}, not "${which}"`);
      const chosen = which === SOLID_SCRIPT_SELECT_NEW ? run.selectFresh(kind.selected, pool) : pool;
      const picked = chosen.filter((item, index) =>
        solidScriptConditionHolds(run, 'where', { [`$${kind.item}`]: item, $Index: index }),
      );
      run.selectNote(kind.selected, pool);
      solidScriptSelectWrite(run, kind, picked);
      return [];
    },
  });
}

/**
 * The brushes Select Brushes picks from when Of is empty: every brush and mesh
 * built so far, and those a modifier has received.
 *
 * @param run Running line.
 * @returns Brushes, each once.
 */
function solidScriptSelectBrushPool(run: SolidScriptBlockRun): SolidScriptElement[] {
  const given = run.ofValues();
  if (given) {
    if (given.length === 0) throw new Error('Select Brushes has no brushes in Of; check that Of holds brushes');
    return given.map((value) => {
      if (!(value instanceof SolidScriptElement) || value.kind !== 'brush')
        throw new Error(`Select Brushes picks from brushes, not ${solidScriptKindNamed(value)}`);
      return value;
    });
  }
  const leaves = [...solidScriptGeometryLeaves(run.built()), ...run.receivedLatest()];
  const brushes: SolidScriptElement[] = [];
  for (const leaf of leaves) {
    const brush = run.elements.brush(leaf);
    if (!brushes.includes(brush)) brushes.push(brush);
  }
  if (brushes.length === 0)
    throw new Error('Select Brushes has no brushes to pick from; add a brush such as Cube or Input Brushes above it');
  return brushes;
}

/** Select Brushes, Select Edges and Select Vertices. */
export const SOLID_SCRIPT_COMMANDS_SELECT: readonly SolidScriptCommand[] = [
  solidScriptSelectCommand({
    id: 'select_brushes',
    label: 'Select Brushes',
    many: 'brushes',
    example: 'Cube, Select Brushes, then Clip cuts those brushes.',
    item: 'Brush',
    selected: 'brushes',
    from: ['brush'],
    words: [
      { word: 'All', detail: 'Every brush and mesh, the same as a Where left off' },
      {
        word: SOLID_SCRIPT_SELECT_NEW,
        detail:
          'Only brushes and meshes created since the previous Select Brushes. Example: Cube, Select Brushes, Cube, then Select Brushes Which New picks only the second Cube.',
      },
    ],
    items: (_run, element) => [element],
    pool: solidScriptSelectBrushPool,
  }),
  solidScriptSelectCommand({
    id: 'select_edges',
    label: 'Select Edges',
    many: 'edges',
    example: 'Cube, then Select Edges Where [=[$Edge.Length] > 0.5] and Bevel Edges rounds those edges.',
    item: 'Edge',
    selected: 'edges',
    from: ['brush', 'face', 'edge'],
    words: [
      { word: 'All', detail: 'Every edge, the same as a Where left off' },
      {
        word: SOLID_SCRIPT_SELECT_NEW,
        detail:
          "Only edges created since the previous Select Edges. Example: Cube, Select Edges, Cube, then Select Edges Which New picks only the second Cube's edges.",
      },
    ],
    items: (run, element) => run.elements.edges(element).map((edge) => run.elements.edge(edge)),
  }),
  solidScriptSelectCommand({
    id: 'select_vertices',
    label: 'Select Vertices',
    many: 'corners',
    example: 'Cube, then Select Vertices Where [=[$Vertex.Position.Y] > 0] Into Up, and Print [Up.Count] shows 4.',
    item: 'Vertex',
    selected: 'vertices',
    from: ['brush', 'face', 'edge'],
    words: [
      { word: 'All', detail: 'Every corner, the same as a Where left off' },
      {
        word: SOLID_SCRIPT_SELECT_NEW,
        detail:
          "Only corners created since the previous Select Vertices. Example: Cube, Select Vertices, Cube, then Select Vertices Which New picks only the second Cube's corners.",
      },
    ],
    items: (run, element) => {
      const leaf = run.elements.leaf(element);
      return run.elements.vertices(element).map((vertex) => run.elements.vertex(leaf, vertex));
    },
  }),
];
