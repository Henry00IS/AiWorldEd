import type { SolidScriptCommandParameter } from '@/solid_script/commands/solid_script_command.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';
import { solidScriptFieldCheck, solidScriptFieldSplit } from '@/solid_script/language/solid_script_field.js';

/** One labelled field of the configurator. */
export interface SolidScriptConfiguratorField {
  /** Row element. */
  element: HTMLElement;
  /** Reads the value as field text. */
  read: () => string;
  /** Returns an error when the value cannot be used, or an empty string. */
  problem: () => string;
}

/** Axis captions of vector fields. */
const SOLID_SCRIPT_CONFIGURATOR_AXES = ['X', 'Y', 'Z'];

/** Pattern of names a variable can have. */
const SOLID_SCRIPT_CONFIGURATOR_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Pattern of what Set can change: a variable, or an item of a list such as
 * points(2) or points().
 */
const SOLID_SCRIPT_CONFIGURATOR_TARGET = /^[A-Za-z_][A-Za-z0-9_]*(\s*\(.*\))?$/;

/**
 * Builds the field of one command parameter.
 *
 * @param parameter Parameter.
 * @param value Stored field text.
 * @param changed Runs after every edit.
 * @returns Field.
 */
export function solidScriptConfiguratorFieldBuild(
  parameter: SolidScriptCommandParameter,
  value: string,
  changed: () => void,
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
  inputs.addEventListener('input', changed);
  inputs.addEventListener('change', changed);
  const hint = document.createElement('span');
  hint.className = SOLID_SCRIPT_EDITOR_CLASSES.fieldHint;
  hint.textContent = parameter.hint;
  row.append(caption, inputs, hint);
  return { element: row, ...field };
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
): Omit<SolidScriptConfiguratorField, 'element'> {
  const size = parameter.type === 'vector3' ? 3 : parameter.type === 'vector2' ? 2 : 0;
  const parts = size > 0 ? solidScriptConfiguratorVectorParts(value, size) : null;
  if (parts) return solidScriptConfiguratorVector(parts, parameter, inputs);
  if (parameter.type === 'boolean' && (value === 'true' || value === 'false'))
    return solidScriptConfiguratorCheckbox(value === 'true', parameter, inputs);
  const input = solidScriptConfiguratorInput(value, parameter.label);
  inputs.append(input);
  return { read: () => input.value.trim(), problem: () => solidScriptConfiguratorProblem(parameter, input.value) };
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
 * Builds one input per axis of a vector.
 *
 * @param parts Axis values.
 * @param parameter Parameter.
 * @param inputs Container.
 * @returns Reader and check.
 */
function solidScriptConfiguratorVector(
  parts: string[],
  parameter: SolidScriptCommandParameter,
  inputs: HTMLElement,
): Omit<SolidScriptConfiguratorField, 'element'> {
  const fields = parts.map((part, axis) => {
    const input = solidScriptConfiguratorInput(part, `${parameter.label} ${SOLID_SCRIPT_CONFIGURATOR_AXES[axis]}`);
    input.placeholder = SOLID_SCRIPT_CONFIGURATOR_AXES[axis] ?? '';
    return input;
  });
  inputs.append(...fields);
  return {
    read: () => fields.map((input) => input.value.trim()).join(', '),
    problem: () => {
      if (fields.some((input) => input.value.trim() === '')) return `${parameter.label} needs every axis.`;
      const problem = fields.map((input) => solidScriptFieldCheck(input.value)).find((text) => text !== '') ?? '';
      return problem === '' ? '' : `${parameter.label}: ${problem}.`;
    },
  };
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
): Omit<SolidScriptConfiguratorField, 'element'> {
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
