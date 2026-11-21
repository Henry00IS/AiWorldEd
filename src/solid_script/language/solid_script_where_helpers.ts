import type {
  SolidScriptFunctionArgument,
  SolidScriptFunctionDoc,
  SolidScriptFunctionGroup,
  SolidScriptFunctionKinds,
} from './solid_script_function_docs.js';
import { SOLID_SCRIPT_FACING_WITHIN_DEFAULT } from './solid_script_condition.js';
import { SOLID_SCRIPT_HITS_HOW_WORDS } from './solid_script_hits.js';
import { solidScriptFunctionKey, solidScriptNameKey } from './solid_script_name_key.js';

/** One input of a Where helper, for docs, autocomplete and formula blocks. */
export interface SolidScriptWhereHelperInput {
  /** Name in the call, such as direction. */
  name: string;
  /** Field label of its formula block. */
  label: string;
  /** Kinds the input takes. */
  type: SolidScriptFunctionKinds;
  /** What the input is. */
  about: string;
  /** Default as typed text, when the input may be left off. */
  optional?: string;
  /** Words it takes, when it takes one of a few. */
  choices?: readonly string[];
  /**
   * Formula an empty input stands for in a field that changes per item, such as
   * [$Index]; the formula editor shows it greyed.
   */
  each?: string;
}

/** Stored names of the Where helpers, in palette order. */
export const SOLID_SCRIPT_WHERE_HELPER_KEYS = [
  'facing',
  'in_box',
  'near',
  'every_nth',
  'has_tag',
  'hits',
  'chance',
  'random',
  'spread',
  'along',
] as const;

/** Stored name of a Where helper, such as in_box. */
export type SolidScriptWhereHelperKey = (typeof SOLID_SCRIPT_WHERE_HELPER_KEYS)[number];

/**
 * One Where helper: a function made for fields that change per item, such as
 * InBox or EveryNth. Its declaration drives formula blocks, docs and
 * autocomplete.
 */
export interface SolidScriptWhereHelper {
  /** Stored function key, such as in_box. */
  key: SolidScriptWhereHelperKey;
  /** Official call name, such as InBox. */
  name: string;
  /** Formula block name, such as In Box. */
  display: string;
  /** What it does, one short sentence. */
  description: string;
  /** Function group of its docs, such as Checks. */
  group: SolidScriptFunctionGroup;
  /** Kinds it gives. */
  gives: SolidScriptFunctionKinds;
  /** Inputs in call order. */
  inputs: readonly SolidScriptWhereHelperInput[];
}

/** What a yes-or-no helper gives, and its docs group. */
const SOLID_SCRIPT_WHERE_CHECK = { group: 'Checks', gives: ['Yes/No'] } as const;

/**
 * The Where helpers, the functions made for fields that change per item, such
 * as a Where condition or a per-face Distance. They work in every formula; in a
 * per-item field their inputs default to the item, such as [$Index]. One
 * declaration drives the Where blocks of the formula editor, autocomplete and
 * the docs.
 */
export const SOLID_SCRIPT_WHERE_HELPERS: readonly SolidScriptWhereHelper[] = [
  {
    key: 'facing',
    ...SOLID_SCRIPT_WHERE_CHECK,
    name: 'Facing',
    display: 'Facing',
    description: `Yes when a direction, such as a face's normal, points along another direction, within a number of degrees, ${SOLID_SCRIPT_FACING_WITHIN_DEFAULT} by default.`,
    inputs: [
      {
        name: 'normal',
        label: 'Normal',
        type: ['Vector'],
        about: 'Direction of the thing, such as [$Face.Normal].',
      },
      {
        name: 'direction',
        label: 'Direction',
        type: ['Vector'],
        about: 'Direction it should face, such as [0, 1, 0] for up.',
      },
      {
        name: 'within',
        label: 'Within',
        type: ['Number'],
        about: 'Degrees it may lean, from 0 to 180, such as 45.',
        optional: String(SOLID_SCRIPT_FACING_WITHIN_DEFAULT),
      },
    ],
  },
  {
    key: 'in_box',
    ...SOLID_SCRIPT_WHERE_CHECK,
    name: 'InBox',
    display: 'In Box',
    description:
      'Yes when a point lies in an axis-aligned box of a Center and Size, including the faces of the box, such as InBox([$Face.Center], Vector(0, 0, 0), 2).',
    inputs: [
      {
        name: 'point',
        label: 'Point',
        type: ['Vector'],
        about: 'Point to test, such as [$Face.Center] or [$Vertex.Position].',
      },
      { name: 'center', label: 'Center', type: ['Vector'], about: 'Center of the box, such as [0, 1, 0].' },
      {
        name: 'size',
        label: 'Size',
        type: ['Vector', 'Number'],
        about: 'Width, height and depth in metres, such as [4, 2, 4]; or one number for every axis, such as 2.',
      },
    ],
  },
  {
    key: 'near',
    ...SOLID_SCRIPT_WHERE_CHECK,
    name: 'Near',
    display: 'Near',
    description:
      'Yes when a point is within a distance of a target, including the exact distance, such as Near([$Face.Center], [Spot], 0.5).',
    inputs: [
      { name: 'point', label: 'Point', type: ['Vector'], about: 'Point to test, such as [$Face.Center].' },
      { name: 'target', label: 'Target', type: ['Vector'], about: 'Point to measure from, such as [Spot].' },
      {
        name: 'distance',
        label: 'Distance',
        type: ['Number'],
        about: 'Greatest distance that still counts, in metres, such as 0.5.',
      },
    ],
  },
  {
    key: 'every_nth',
    ...SOLID_SCRIPT_WHERE_CHECK,
    name: 'EveryNth',
    display: 'Every Nth',
    description:
      'Yes for every Nth item, such as every second one: Step 1 keeps every item, 2 every second item (skipping the one between), 3 every third, and so on. Items count from 0, so of 6 items EveryNth([$Index], 2) keeps items 0, 2 and 4, and EveryNth([$Index], 2, 1) keeps items 1, 3 and 5.',
    inputs: [
      {
        name: 'index',
        label: 'Index',
        type: ['Number'],
        about: 'Item number from 0, usually [$Index].',
        each: '[$Index]',
      },
      {
        name: 'step',
        label: 'Step',
        type: ['Number'],
        about:
          'How often to keep an item, such as 2; 1 keeps every item, 2 every second, 3 every third, and so on, always a whole number of 1 or more.',
      },
      {
        name: 'start',
        label: 'Start',
        type: ['Number'],
        about:
          'Shifts which items are kept, such as 1; the item at Start is kept, and every Step-th item before and after it, so with Step 2, Start 1 keeps items 1, 3 and 5.',
        optional: '0',
      },
    ],
  },
  {
    key: 'has_tag',
    ...SOLID_SCRIPT_WHERE_CHECK,
    name: 'HasTag',
    display: 'Has Tag',
    description: 'Yes when a tag or list of tags includes a name, ignoring case, such as HasTag([$Face.Tags], "Top").',
    inputs: [
      {
        name: 'tags',
        label: 'Tags',
        type: ['Text', 'List'],
        about: 'A tag, or a list of tags such as [$Face.Tags].',
      },
      { name: 'name', label: 'Name', type: ['Text'], about: 'Tag to look for, such as Top.' },
    ],
  },
  {
    key: 'hits',
    ...SOLID_SCRIPT_WHERE_CHECK,
    name: 'Hits',
    display: 'Hits',
    description:
      'Yes when the box of an element meets another box, or any item of a list. How is Touching by default (any contact, including sitting inside), Overlapping (they share interior space) or Fully Inside.',
    inputs: [
      {
        name: 'element',
        label: 'Element',
        type: ['Object', 'Mesh', 'Face', 'Edge', 'Vertex', 'Vector', 'List'],
        about: 'The thing to test, such as [$Object] or [$Face].',
      },
      {
        name: 'target',
        label: 'Box',
        type: ['Object', 'Mesh', 'Face', 'Edge', 'Vertex', 'Vector', 'List'],
        about: 'An object or list whose bounds are the box, such as [Wall].',
        optional: '',
      },
      {
        name: 'center',
        label: 'Center',
        type: ['Vector'],
        about: 'Center of a box of your own, without Box, such as [0, 1, 0].',
        optional: '',
      },
      {
        name: 'size',
        label: 'Size',
        type: ['Vector', 'Number'],
        about:
          'Width, height and depth of a box of your own, without Box, such as [4, 2, 4]; or one number for every axis.',
        optional: '',
      },
      {
        name: 'how',
        label: 'How',
        type: ['Text'],
        about: 'How the boxes meet: Touching, Overlapping or Fully Inside.',
        optional: 'Touching',
        choices: SOLID_SCRIPT_HITS_HOW_WORDS,
      },
    ],
  },
  {
    key: 'chance',
    name: 'Chance',
    display: 'Chance',
    group: 'Random',
    gives: ['Yes/No'],
    description:
      'Yes for about a share of the items, picked at random, such as Chance(0.3) to keep about 3 in 10 faces in a Where. The same ID and Seed always give the same answer; another Seed picks other items.',
    inputs: [
      {
        name: 'probability',
        label: 'Probability',
        type: ['Number'],
        about: 'Share of the items that get Yes, from 0 (none) to 1 (all), such as 0.3.',
      },
      {
        name: 'id',
        label: 'ID',
        type: ['Number'],
        about: 'Which item asks, such as [$Index]; each ID gets its own answer.',
        optional: '0',
        each: '[$Index]',
      },
      {
        name: 'seed',
        label: 'Seed',
        type: ['Number'],
        about: 'Any number, such as 1; another seed gives other answers for the same IDs.',
        optional: '0',
      },
    ],
  },
  {
    key: 'random',
    name: 'Random',
    display: 'Random',
    group: 'Random',
    gives: ['Number', 'Vector'],
    description:
      'A random number from Min to Max, or a vector between two vectors, such as Random(0.5, 2) for a size per face. The same ID and Seed always give the same value; give another Seed, such as Random(0, 90, [$Index], 1), for a value that does not follow another Random.',
    inputs: [
      {
        name: 'min',
        label: 'Min',
        type: ['Number', 'Vector'],
        about: 'The lowest value, or a vector of lowest values, such as 0.',
      },
      {
        name: 'max',
        label: 'Max',
        type: ['Number', 'Vector'],
        about: 'The highest value, or a vector of highest values, such as 1.',
      },
      {
        name: 'id',
        label: 'ID',
        type: ['Number'],
        about: 'Which item asks, such as [$Index]; each ID gets its own value.',
        optional: '0',
        each: '[$Index]',
      },
      {
        name: 'seed',
        label: 'Seed',
        type: ['Number'],
        about: 'Any number, such as 1; another seed gives other values for the same IDs.',
        optional: '0',
      },
    ],
  },
  {
    key: 'spread',
    name: 'Spread',
    display: 'Spread',
    group: 'Math',
    gives: ['Number', 'Vector'],
    description:
      'Steps evenly from From to To over the items: the first item gets From, the last gets To, and those between are spaced out, such as Spread(0, 90) to turn copies from 0 to 90 degrees.',
    inputs: [
      { name: 'from', label: 'From', type: ['Number', 'Vector'], about: 'Value of the first item, such as 0.' },
      { name: 'to', label: 'To', type: ['Number', 'Vector'], about: 'Value of the last item, such as 90.' },
      {
        name: 'index',
        label: 'Index',
        type: ['Number'],
        about: 'Item number from 0, usually [$Index].',
        each: '[$Index]',
      },
      {
        name: 'count',
        label: 'Count',
        type: ['Number'],
        about: 'How many items there are, usually [$Count].',
        each: '[$Count]',
      },
    ],
  },
  {
    key: 'along',
    name: 'Along',
    display: 'Along',
    group: 'Vector',
    gives: ['Vector'],
    description:
      'The point a distance away from a point along a direction, such as Along([$Face.Center], [$Face.Normal], 0.5) half a metre out from a face.',
    inputs: [
      { name: 'point', label: 'Point', type: ['Vector'], about: 'Where to start, such as [$Face.Center].' },
      {
        name: 'direction',
        label: 'Direction',
        type: ['Vector'],
        about: 'Which way to go, such as [$Face.Normal]; only its direction counts, not its length.',
      },
      { name: 'distance', label: 'Distance', type: ['Number'], about: 'How far to go, in metres, such as 0.5.' },
    ],
  },
];

/** Docs entries of the Where helpers, keyed by stored name. */
export const SOLID_SCRIPT_WHERE_HELPER_DOCS = Object.fromEntries(
  SOLID_SCRIPT_WHERE_HELPERS.map((helper) => [
    helper.key,
    {
      usage: `${helper.name}(${helper.inputs.map((input) => input.name).join(', ')})`,
      summary: helper.description,
      group: helper.group,
      gives: helper.gives,
    },
  ]),
) as Readonly<Record<SolidScriptWhereHelperKey, SolidScriptFunctionDoc>>;

/** Argument docs of the Where helpers, keyed by stored name. */
export const SOLID_SCRIPT_WHERE_HELPER_ARGUMENTS = Object.fromEntries(
  SOLID_SCRIPT_WHERE_HELPERS.map((helper) => [
    helper.key,
    Object.fromEntries(
      helper.inputs.map((input) => [
        input.name,
        { type: input.type, about: input.about, ...(input.choices ? { choices: input.choices } : {}) },
      ]),
    ),
  ]),
) as Readonly<Record<SolidScriptWhereHelperKey, Readonly<Record<string, Omit<SolidScriptFunctionArgument, 'name'>>>>>;

/**
 * Finds a Where helper by its stored name.
 *
 * @param key Stored name, such as in_box.
 * @returns Helper, or undefined for any other function.
 */
export function solidScriptWhereHelper(key: string): SolidScriptWhereHelper | undefined {
  return SOLID_SCRIPT_WHERE_HELPERS.find((helper) => helper.key === key);
}

/**
 * Finds a Where helper by its name as written, in any case, such as random for
 * Random.
 *
 * @param written Name as written.
 * @returns Helper, or undefined for any other function.
 */
export function solidScriptWhereHelperNamed(written: string): SolidScriptWhereHelper | undefined {
  const folded = solidScriptFunctionKey(written);
  return SOLID_SCRIPT_WHERE_HELPERS.find((helper) => solidScriptFunctionKey(helper.name) === folded);
}

/**
 * Counts the inputs a Where helper always needs: those before the first that
 * may be left off or that a per-item field fills in, and at least one.
 *
 * @param helper Helper.
 * @returns Fewest inputs.
 */
export function solidScriptWhereHelperLeast(helper: SolidScriptWhereHelper): number {
  const first = helper.inputs.findIndex((input) => input.optional !== undefined || input.each !== undefined);
  return Math.max(1, first < 0 ? helper.inputs.length : first);
}

/** An input a call left off that a per-item field fills in. */
export interface SolidScriptWhereHelperFill {
  /** Folded name of the per-item value, such as $index; null for none. */
  variable: string | null;
  /** Value when there is no such value, such as 0; undefined to stop there. */
  optional: number | undefined;
}

/**
 * Lists the inputs after those a call gives, up to the last one a per-item
 * field fills in, such as the ID of Random(0, 1) from [$Index].
 *
 * @param key Stored function name, such as random.
 * @param given How many inputs the call gives.
 * @returns The inputs to fill in, in order; empty for other functions.
 */
export function solidScriptWhereHelperFills(key: string, given: number): SolidScriptWhereHelperFill[] {
  const inputs = solidScriptWhereHelper(key)?.inputs ?? [];
  let last = -1;
  inputs.forEach((input, index) => {
    if (input.each !== undefined) last = index;
  });
  return inputs.slice(given, last + 1).map((input) => ({
    variable: input.each ? solidScriptNameKey(input.each.replace(/^\[|\]$/g, '')) : null,
    optional: input.optional === undefined || input.optional === '' ? undefined : Number(input.optional),
  }));
}
