import { solidScriptNameDotProblem } from '@/solid_script/language/solid_script_name_rules.js';
import type { SolidScriptCommandParameter } from '@/solid_script/commands/solid_script_command.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';
import {
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
}

/** How a field's inputs are read and checked. */
type SolidScriptConfiguratorFieldReader = Pick<SolidScriptConfiguratorField, 'read' | 'problem'>;

/** Axis captions of vector fields. */
const SOLID_SCRIPT_CONFIGURATOR_AXES = ['X', 'Y', 'Z'];

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
  const row = document.createElement('label');
  row.className = SOLID_SCRIPT_EDITOR_CLASSES.field;
  row.title = parameter.hint;
  const caption = document.createElement('span');
  caption.className = SOLID_SCRIPT_EDITOR_CLASSES.fieldLabel;
  caption.textContent = parameter.label;
  const inputs = document.createElement('span');
  inputs.className = SOLID_SCRIPT_EDITOR_CLASSES.fieldInputs;
  const field = solidScriptConfiguratorInputs(parameter, value, inputs);
  const shapeNames = scope.names
    .filter((entry) => entry.category === 'Shapes' || entry.category === 'Parts')
    .map((entry) => ({ word: entry.name, detail: entry.detail }));
  const suggest: SolidScriptSuggestionScope = {
    ...scope,
    words: parameter.shapeNames
      ? shapeNames
      : (parameter.words ?? []).filter((word) => !word.sees || scope.names.some((entry) => entry.name === word.sees)),
  };
  const texts =
    parameter.type === 'name' || parameter.type === 'target'
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
  const size = solidScriptConfiguratorVectorSize(parameter);
  if (size > 0) return solidScriptConfiguratorVector(value, size, parameter, inputs);
  if (parameter.type === 'boolean' && (value === 'true' || value === 'false'))
    return solidScriptConfiguratorCheckbox(value === 'true', parameter, inputs);
  const input = solidScriptConfiguratorInput(value, parameter.label);
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
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = mode;
    button.className = SOLID_SCRIPT_EDITOR_CLASSES.fieldMode;
    button.setAttribute('aria-label', `${mode} Texture`);
    button.title = mode === 'Pick' ? 'Pick a texture from the library' : 'Type a texture name, variable or formula';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      if ((mode === 'Pick') === picking) return;
      if (picking) input.value = select.read();
      else if (!input.value.includes('[')) select.write(input.value.trim());
      picking = mode === 'Pick';
      show();
      inputs.dispatchEvent(new Event('change', { bubbles: true }));
    });
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
 * Returns how many axes a field's vector has.
 *
 * @param parameter Parameter.
 * @returns 3, 2, or 0 for fields that are not vectors.
 */
function solidScriptConfiguratorVectorSize(parameter: SolidScriptCommandParameter): number {
  return parameter.type === 'vector3' ? 3 : parameter.type === 'vector2' ? 2 : 0;
}

/**
 * Builds a vector field: an input per axis, or one Vector input that takes a
 * vector such as [Edge.Middle], a formula or "1, 2, 3". A toggle switches,
 * keeping the value; a stored value that is not one part per axis opens as one
 * Vector.
 *
 * @param value Stored text.
 * @param size Axes.
 * @param parameter Parameter.
 * @param inputs Container.
 * @returns Reader and check.
 */
function solidScriptConfiguratorVector(
  value: string,
  size: number,
  parameter: SolidScriptCommandParameter,
  inputs: HTMLElement,
): SolidScriptConfiguratorFieldReader {
  const parts = solidScriptConfiguratorVectorParts(value, size);
  const axes = Array.from({ length: size }, (_, axis) => {
    const input = solidScriptConfiguratorInput(
      parts?.[axis] ?? '',
      `${parameter.label} ${SOLID_SCRIPT_CONFIGURATOR_AXES[axis]}`,
    );
    input.placeholder = SOLID_SCRIPT_CONFIGURATOR_AXES[axis] ?? '';
    return input;
  });
  const whole = solidScriptConfiguratorInput(parts ? '' : value, parameter.label);
  whole.placeholder = 'Vector, such as [Edge.Middle]';
  let single = !parts;
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.textContent = 'Vector';
  toggle.className = SOLID_SCRIPT_EDITOR_CLASSES.fieldMode;
  toggle.setAttribute('aria-label', `${parameter.label} As One Vector`);
  const show = (): void => {
    whole.hidden = !single;
    for (const input of axes) input.hidden = single;
    toggle.setAttribute('aria-pressed', String(single));
    toggle.title = single ? 'Type each axis on its own' : 'Type one vector, such as [Edge.Middle] or 1, 2, 3';
  };
  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    if (single) {
      const split = solidScriptConfiguratorVectorSplit(whole.value, size);
      if (!split) {
        toggle.title = 'This vector cannot be split into axes; write it as one value per axis first';
        return;
      }
      split.forEach((part, axis) => (axes[axis]!.value = part));
    } else whole.value = solidScriptConfiguratorVectorJoin(axes.map((input) => input.value));
    single = !single;
    show();
    inputs.dispatchEvent(new Event('change', { bubbles: true }));
  });
  show();
  inputs.append(...axes, whole, toggle);
  return {
    read: () => (single ? whole.value.trim() : axes.map((input) => input.value.trim()).join(', ')),
    problem: () => {
      if (single) {
        if (whole.value.trim() === '') return `${parameter.label} needs a vector.`;
        const count = solidScriptFieldSplit(whole.value, ',').length;
        const problem =
          solidScriptFieldCheck(whole.value) ||
          (count === 1 || count === size ? '' : `needs ${size} values, or one vector such as [Edge.Middle]`);
        return problem === '' ? '' : `${parameter.label}: ${problem}.`;
      }
      if (axes.some((input) => input.value.trim() === '')) return `${parameter.label} needs every axis.`;
      const problem = axes.map((input) => solidScriptFieldCheck(input.value)).find((text) => text !== '') ?? '';
      return problem === '' ? '' : `${parameter.label}: ${problem}.`;
    },
  };
}

/**
 * Splits one vector into its axes for the axis inputs: a list with one part per
 * axis as it is, one [Name] into [Name.x], [Name.y] and [Name.z].
 *
 * @param text Vector text.
 * @param size Axes.
 * @returns Axis texts, or null when the text cannot be split.
 */
export function solidScriptConfiguratorVectorSplit(text: string, size: number): string[] | null {
  const parts = solidScriptConfiguratorVectorParts(text, size);
  if (parts) return parts;
  const named = /^\[\s*([A-Za-z_][\w.]*)\s*\]$/.exec(text.trim())?.[1];
  return named === undefined ? null : ['x', 'y', 'z'].slice(0, size).map((axis) => `[${named}.${axis}]`);
}

/**
 * Joins axis texts into one vector: [Name.x], [Name.y], [Name.z] become [Name],
 * anything else "x, y, z".
 *
 * @param parts Axis texts.
 * @returns Vector text.
 */
export function solidScriptConfiguratorVectorJoin(parts: readonly string[]): string {
  const names = parts.map((part) => /^\[\s*([A-Za-z_][\w.]*)\.([xyz])\s*\]$/i.exec(part.trim()));
  const base = names[0]?.[1];
  const same = names.every(
    (match, axis) =>
      match && match[1]!.toLowerCase() === base?.toLowerCase() && match[2]!.toLowerCase() === 'xyz'[axis],
  );
  return same && base !== undefined ? `[${base}]` : parts.map((part) => part.trim()).join(', ');
}

/**
 * Builds a checkbox.
 *
 * @param checked Initial state.
 * @param parameter Parameter.
 * @param inputs Container.
 * @returns Reader and check.
 */
function solidScriptConfiguratorCheckbox(
  checked: boolean,
  parameter: SolidScriptCommandParameter,
  inputs: HTMLElement,
): SolidScriptConfiguratorFieldReader {
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = checked;
  box.setAttribute('aria-label', parameter.label);
  inputs.append(box);
  return { read: () => (box.checked ? 'true' : 'false'), problem: () => '' };
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
  const dotted = parameter.type === 'name' || parameter.type === 'target' ? solidScriptNameDotProblem(text, 'set') : '';
  if (dotted) return `${parameter.label}: ${dotted}.`;
  if (parameter.type === 'name' && !SOLID_SCRIPT_CONFIGURATOR_NAME.test(text))
    return `${parameter.label} must start with a letter and use only letters, digits and _.`;
  if (parameter.type === 'target' && !SOLID_SCRIPT_CONFIGURATOR_TARGET.test(text))
    return `${parameter.label} must be a name such as width, or an item such as points(0), or points() to add one.`;
  if (text === '' && parameter.optional) return '';
  if (parameter.type !== 'text' && text === '') return `${parameter.label} needs a value.`;
  if (parameter.type === 'name' || parameter.type === 'text') return '';
  const problem = solidScriptFieldCheck(text);
  return problem === '' ? '' : `${parameter.label}: ${problem}.`;
}

/**
 * Splits a vector written as "x, y, z" into its axes, keeping bracketed
 * variables and formulas whole.
 *
 * @param value Field text.
 * @param size Expected axis count.
 * @returns Axis texts, or null when the value has another count.
 */
export function solidScriptConfiguratorVectorParts(value: string, size: number): string[] | null {
  const parts = solidScriptFieldSplit(value, ',');
  return parts.length === size ? parts : null;
}
