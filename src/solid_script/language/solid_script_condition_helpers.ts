import type {
  SolidScriptFunctionArgument,
  SolidScriptFunctionDoc,
  SolidScriptFunctionKinds,
} from './solid_script_function_docs.js';
import { SOLID_SCRIPT_FACING_WITHIN_DEFAULT } from './solid_script_condition.js';
import { SOLID_SCRIPT_HITS_HOW_WORDS } from './solid_script_hits.js';

/**
 * One input of a curated condition function, for docs, autocomplete and formula
 * blocks.
 */
export interface SolidScriptConditionHelperInput {
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
}

/**
 * One curated condition function, the declaration formula blocks, docs and
 * autocomplete share.
 */
export interface SolidScriptConditionHelper {
  /** Stored function key, such as in_box. */
  key: string;
  /** Official call name, such as InBox. */
  name: string;
  /** Formula block name, such as In Box. */
  display: string;
  /** What it tests, one short sentence. */
  description: string;
  /** Inputs in call order. */
  inputs: readonly SolidScriptConditionHelperInput[];
}

/**
 * Curated condition functions. Each one works in Where, Filter List, If and
 * every other condition field. One declaration drives formula blocks,
 * autocomplete and the docs.
 */
export const SOLID_SCRIPT_CONDITION_HELPERS: readonly SolidScriptConditionHelper[] = [
  {
    key: 'facing',
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
    name: 'EveryNth',
    display: 'Every Nth',
    description:
      'Yes for every Nth item, such as every second one: Step 1 keeps every item, 2 every second item (skipping the one between), 3 every third, and so on. Items count from 0, so of 6 items EveryNth([$Index], 2) keeps items 0, 2 and 4, and EveryNth([$Index], 2, 1) keeps items 1, 3 and 5.',
    inputs: [
      { name: 'index', label: 'Index', type: ['Number'], about: 'Item number from 0, usually [$Index].' },
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
    name: 'Hits',
    display: 'Hits',
    description:
      'Yes when the box of an element meets another box, or any item of a list. How is Touching by default (any contact, including sitting inside), Overlapping (they share interior space) or Fully Inside.',
    inputs: [
      {
        name: 'element',
        label: 'Element',
        type: ['Brush', 'Mesh', 'Face', 'Edge', 'Vertex', 'Vector', 'List'],
        about: 'The thing to test, such as [$Brush] or [$Face].',
      },
      {
        name: 'target',
        label: 'Box',
        type: ['Brush', 'Mesh', 'Face', 'Edge', 'Vertex', 'Vector', 'List'],
        about: 'A brush, mesh or list whose bounds are the box, such as [Wall].',
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
];

/**
 * Docs for one curated helper.
 *
 * @param key Stored name, such as in_box.
 * @returns Docs.
 */
function solidScriptConditionHelperDoc(key: string): SolidScriptFunctionDoc {
  const helper = SOLID_SCRIPT_CONDITION_HELPERS.find((entry) => entry.key === key);
  if (!helper) throw new Error(`missing condition helper ${key}`);
  return {
    usage: `${helper.name}(${helper.inputs.map((input) => input.name).join(', ')})`,
    summary: helper.description,
    group: 'Checks',
    gives: ['Yes/No'],
  };
}

/**
 * Argument docs for one curated helper.
 *
 * @param key Stored name, such as in_box.
 * @returns Inputs keyed by name.
 */
function solidScriptConditionHelperArgs(
  key: string,
): Readonly<Record<string, Omit<SolidScriptFunctionArgument, 'name'>>> {
  const helper = SOLID_SCRIPT_CONDITION_HELPERS.find((entry) => entry.key === key);
  if (!helper) throw new Error(`missing condition helper ${key}`);
  return Object.fromEntries(
    helper.inputs.map((input) => [
      input.name,
      { type: input.type, about: input.about, ...(input.choices ? { choices: input.choices } : {}) },
    ]),
  );
}

/** Docs entries for the curated condition functions, keyed by stored name. */
export const SOLID_SCRIPT_CONDITION_HELPER_DOCS = {
  facing: solidScriptConditionHelperDoc('facing'),
  in_box: solidScriptConditionHelperDoc('in_box'),
  near: solidScriptConditionHelperDoc('near'),
  every_nth: solidScriptConditionHelperDoc('every_nth'),
  has_tag: solidScriptConditionHelperDoc('has_tag'),
  hits: solidScriptConditionHelperDoc('hits'),
};

/** Argument docs for the curated condition functions, keyed by stored name. */
export const SOLID_SCRIPT_CONDITION_HELPER_ARGUMENTS = {
  facing: solidScriptConditionHelperArgs('facing'),
  in_box: solidScriptConditionHelperArgs('in_box'),
  near: solidScriptConditionHelperArgs('near'),
  every_nth: solidScriptConditionHelperArgs('every_nth'),
  has_tag: solidScriptConditionHelperArgs('has_tag'),
  hits: solidScriptConditionHelperArgs('hits'),
};
