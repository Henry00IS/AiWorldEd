import { solidScriptNameKey } from '@/solid_script/language/solid_script_name_key.js';
import { solidScriptNameDotProblem } from '@/solid_script/language/solid_script_name_rules.js';
import {
  SOLID_SCRIPT_MISTAKE_NAMES,
  SOLID_SCRIPT_MISTAKE_NUMERIC,
  solidScriptFieldMistakeNote,
} from '@/solid_script/language/solid_script_field_mistakes.js';
import type { SolidScriptCommandParameter } from '@/solid_script/commands/solid_script_command.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';
import { solidScriptAnchorRead } from '@/solid_script/language/solid_script_anchor.js';
import {
  solidScriptFieldBoolean,
  solidScriptFieldCheck,
  solidScriptFieldSplit,
  solidScriptFieldVectorNote,
} from '@/solid_script/language/solid_script_field.js';
import {
  SOLID_SCRIPT_NAMES_RAW,
  solidScriptFieldKnown,
  solidScriptFieldUnknown,
  type SolidScriptName,
} from '@/solid_script/document/solid_script_document_names.js';
import { solidScriptFieldMirrorAttach } from './solid_script_field_highlight.js';
import { solidScriptEditorViewRead, type SolidScriptEditorView } from './solid_script_editor_view.js';
import { SolidScriptConfiguratorNames } from './solid_script_configurator_names.js';
import { solidScriptEditorToolButton } from './solid_script_editor_icons.js';
import { textureSelectCreate } from '@/texture/ui/texture_select.js';
import type { SolidScriptSuggestionScope } from './solid_script_suggestions.js';

/** One labelled field of the configurator. */
export interface SolidScriptConfiguratorField {
  /** Row element. */
  element: HTMLElement;
  /** Reads the value as field text. */
  read: () => string;
  /** Returns an error when the value cannot be used, or an empty string. */
  problem: () => string;
  /** Returns a note on names no line defines, or an empty string. */
  warning: () => string;
  /** Takes its suggestion lists off the page, when the window closes. */
  close: () => void;
}

/** What a field can refer to: the names of the script around the line. */
export interface SolidScriptConfiguratorScope {
  /** Names the script defines. */
  names: readonly SolidScriptName[];
  /** Names the command fills in for its own formulas. */
  extra: readonly string[];
  /** Reads another field of the line as it is typed now. */
  other?: (key: string) => string;
}

/** How a field's inputs are read and checked. */
type SolidScriptConfiguratorFieldReader = Pick<SolidScriptConfiguratorField, 'read' | 'problem'>;

/** Words of a Yes or No field; a variable or formula may be typed instead. */
const SOLID_SCRIPT_CONFIGURATOR_YES_NO = [
  { word: 'Yes', detail: 'On' },
  { word: 'No', detail: 'Off' },
];

/**
 * Returns how many values a vector field takes.
 *
 * @param parameter Parameter.
 * @returns 3, 2, or 0 for fields that are not vectors.
 */
function solidScriptConfiguratorVectorSize(parameter: SolidScriptCommandParameter): number {
  return parameter.type === 'vector3' ? 3 : parameter.type === 'vector2' ? 2 : 0;
}

/** Pattern of names a variable can have. */
const SOLID_SCRIPT_CONFIGURATOR_NAME = /^((local|persistent)\.)?[A-Za-z_][A-Za-z0-9_]*$/i;

/**
 * Pattern of what Set can change: a variable, or an item of a list such as
 * points(2) or points().
 */
const SOLID_SCRIPT_CONFIGURATOR_TARGET = /^((local|persistent)\.)?[A-Za-z_][A-Za-z0-9_]*(\.[xyz]|\s*\(.*\))?$/i;

/**
 * Builds the field of one command parameter.
 *
 * @param parameter Parameter.
 * @param value Stored field text.
 * @param changed Runs after every edit.
 * @param scope Names the field may refer to.
 * @returns Field.
 */
export function solidScriptConfiguratorFieldBuild(
  parameter: SolidScriptCommandParameter,
  value: string,
  changed: () => void,
  scope: SolidScriptConfiguratorScope = { names: [], extra: [] },
  view: SolidScriptEditorView = solidScriptEditorViewRead(),
): SolidScriptConfiguratorField {
  // Not a <label>: a click that starts in one input and ends in another lands on
  // the row, and a label would then focus its first input. The inputs carry
  // their own names, so a click on the caption does nothing.
  const row = document.createElement('div');
  row.className = SOLID_SCRIPT_EDITOR_CLASSES.field;
  row.title = parameter.hint;
  const caption = document.createElement('span');
  caption.className = SOLID_SCRIPT_EDITOR_CLASSES.fieldLabel;
  caption.textContent = parameter.label;
  const inputs = document.createElement('span');
  inputs.className = SOLID_SCRIPT_EDITOR_CLASSES.fieldInputs;
  const field = solidScriptConfiguratorInputs(parameter, value, inputs);
  const named = (categories: readonly string[]) =>
    scope.names
      .filter((entry) => categories.includes(entry.category))
      .map((entry) => ({ word: entry.name, detail: entry.detail }));
  const words = parameter.nameGroups
    ? named(parameter.nameGroups)
    : parameter.type === 'boolean'
      ? SOLID_SCRIPT_CONFIGURATOR_YES_NO
      : (parameter.words ?? []);
  const from = parameter.wordsOf;
  const suggest: SolidScriptSuggestionScope = {
    names: scope.names,
    extra: scope.extra,
    get words() {
      return from ? [...words, ...from.words(scope.other?.(from.key) ?? '')] : words;
    },
  };
  const texts =
    (parameter.type === 'name' || parameter.type === 'target') && !parameter.nameGroups
      ? []
      : [...inputs.querySelectorAll<HTMLInputElement>('input[type="text"]')];
  const lists = texts.map((input) => new SolidScriptConfiguratorNames(input, suggest));
  inputs.addEventListener('input', changed);
  inputs.addEventListener('change', changed);
  const known = solidScriptFieldKnown(scope.names, scope.extra);
  const raw = SOLID_SCRIPT_NAMES_RAW.has(parameter.type);
  if (!raw)
    for (const input of texts)
      solidScriptFieldMirrorAttach(
        input,
        view,
        (text) => new Set(solidScriptFieldUnknown(text, known).map((entry) => entry.key)),
      );
  const warning = (): string => {
    if (raw) return '';
    const mistake = SOLID_SCRIPT_MISTAKE_NAMES.has(parameter.type)
      ? ''
      : solidScriptFieldMistakeNote(field.read(), SOLID_SCRIPT_MISTAKE_NUMERIC.has(parameter.type), (name) =>
          known.names.has(solidScriptNameKey(name)),
        );
    if (mistake) return `${parameter.label}: ${mistake}`;
    const note = solidScriptConfiguratorVectorSize(parameter) > 0 ? solidScriptFieldVectorNote(field.read()) : '';
    if (note) return `${parameter.label}: ${note}.`;
    const unknown = solidScriptFieldUnknown(field.read(), known);
    const names = unknown.filter((entry) => !entry.call).map((entry) => `[${entry.written}]`);
    const calls = unknown.filter((entry) => entry.call).map((entry) => `${entry.written}()`);
    if (names.length > 0)
      return `${parameter.label}: no line sets ${names.join(', ')} yet; it must exist before this line runs.`;
    return calls.length > 0 ? `${parameter.label}: no function is named ${calls.join(', ')}.` : '';
  };
  const hint = document.createElement('span');
  hint.className = SOLID_SCRIPT_EDITOR_CLASSES.fieldHint;
  hint.textContent = parameter.hint;
  row.append(caption, inputs, hint);
  return {
    element: row,
    read: field.read,
    warning,
    close: () => lists.forEach((list) => list.close()),
    problem: () => {
      const problem = field.problem();
      for (const input of inputs.querySelectorAll('input[type="text"]'))
        input.classList.toggle(SOLID_SCRIPT_EDITOR_CLASSES.invalid, problem !== '');
      return problem;
    },
  };
}

/**
 * Fills a field with the inputs its type needs.
 *
 * @param parameter Parameter.
 * @param value Stored value.
 * @param inputs Container.
 * @returns Reader and check.
 */
function solidScriptConfiguratorInputs(
  parameter: SolidScriptCommandParameter,
  value: string,
  inputs: HTMLElement,
): SolidScriptConfiguratorFieldReader {
  const switched = parameter.type === 'boolean' ? solidScriptFieldBoolean(value) : value;
  const shown = typeof switched === 'boolean' ? (switched ? 'Yes' : 'No') : value;
  const input = solidScriptConfiguratorInput(shown, parameter.label);
  if (parameter.placeholder) input.placeholder = parameter.placeholder;
  if (parameter.texture === true) return solidScriptConfiguratorTexture(input, parameter, inputs);
  inputs.append(input);
  return { read: () => input.value.trim(), problem: () => solidScriptConfiguratorProblem(parameter, input.value) };
}

/**
 * Builds a texture field: the shared texture picker, or typing for a variable
 * or formula. It opens typed when the text uses [ ].
 *
 * @param input Text input with the stored text.
 * @param parameter Parameter.
 * @param inputs Container.
 * @returns Reader and check.
 */
function solidScriptConfiguratorTexture(
  input: HTMLInputElement,
  parameter: SolidScriptCommandParameter,
  inputs: HTMLElement,
): SolidScriptConfiguratorFieldReader {
  const select = textureSelectCreate(parameter.label, () =>
    inputs.dispatchEvent(new Event('change', { bubbles: true })),
  );
  select.element.classList.add(SOLID_SCRIPT_EDITOR_CLASSES.input);
  let picking = !input.value.includes('[');
  const modes = (['Pick', 'Type'] as const).map((mode) => {
    const button = solidScriptEditorToolButton(
      mode,
      mode.toLowerCase(),
      mode === 'Pick' ? 'Pick a texture from the library' : 'Type a texture name, variable or formula',
      () => {
        if ((mode === 'Pick') === picking) return;
        if (picking) input.value = select.read();
        else if (!input.value.includes('[')) select.write(input.value.trim());
        picking = mode === 'Pick';
        show();
        inputs.dispatchEvent(new Event('change', { bubbles: true }));
      },
    );
    button.setAttribute('aria-label', `${mode} Texture`);
    return button;
  });
  const show = (): void => {
    select.element.hidden = !picking;
    input.hidden = picking;
    modes.forEach((button, index) => button.setAttribute('aria-pressed', String((index === 0) === picking)));
  };
  select.write(picking ? input.value.trim() : '');
  show();
  inputs.append(...modes, select.element, input);
  return {
    read: () => (picking ? select.read() : input.value.trim()),
    problem: () => (picking ? '' : solidScriptConfiguratorProblem(parameter, input.value)),
  };
}

/**
 * Builds one text input.
 *
 * @param value Text.
 * @param label Accessible name.
 * @returns Input.
 */
function solidScriptConfiguratorInput(value: string, label: string): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = SOLID_SCRIPT_EDITOR_CLASSES.input;
  input.value = value;
  input.spellcheck = false;
  input.setAttribute('aria-label', label);
  return input;
}

/**
 * Checks a typed value.
 *
 * @param parameter Parameter.
 * @param value Typed text.
 * @returns Problem, or an empty string.
 */
function solidScriptConfiguratorProblem(parameter: SolidScriptCommandParameter, value: string): string {
  const text = value.trim();
  if (text === '' && parameter.optional) return '';
  const dotted = parameter.type === 'name' || parameter.type === 'target' ? solidScriptNameDotProblem(text, 'set') : '';
  if (dotted) return `${parameter.label}: ${dotted}.`;
  if (parameter.type === 'name' && !SOLID_SCRIPT_CONFIGURATOR_NAME.test(text))
    return `${parameter.label} must start with a letter and use only letters, digits and _.`;
  if (parameter.type === 'target' && !SOLID_SCRIPT_CONFIGURATOR_TARGET.test(text))
    return `${parameter.label} must be a name such as width, or an item such as points(0), or points() to add one.`;
  if (parameter.type !== 'text' && text === '') return `${parameter.label} needs a value.`;
  if (parameter.anchor && !text.includes('[')) {
    const read = solidScriptAnchorRead(text, parameter.anchor);
    return typeof read === 'string' ? `${parameter.label} ${read}.` : '';
  }
  if (parameter.type === 'name' || parameter.type === 'text') return '';
  const size = solidScriptConfiguratorVectorSize(parameter);
  const count = solidScriptFieldSplit(text, ',').length;
  if (size > 0 && count !== 1 && count !== size)
    return `${parameter.label} needs ${size} values separated by commas, or one vector such as [$Box.Size].`;
  const problem = solidScriptFieldCheck(text);
  return problem === '' ? '' : `${parameter.label}: ${problem}.`;
}
