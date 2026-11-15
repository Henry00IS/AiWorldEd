import type { SolidScriptCommandParameter } from '@/solid_script/commands/solid_script_command.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';

/** One labelled field of the configurator. */
export interface SolidScriptConfiguratorField {
  /** Row element. */
  element: HTMLElement;
  /** Reads the value as code text. */
  read: () => string;
  /** Returns an error when the value cannot be used, or an empty string. */
  problem: () => string;
}

/** Axis captions of vector fields. */
const SOLID_SCRIPT_CONFIGURATOR_AXES = ['X', 'Y', 'Z'];

/** Pattern of names a variable can have. */
const SOLID_SCRIPT_CONFIGURATOR_NAME = /^[A-Za-z_$][A-Za-z0-9_]*$/;

/**
 * Builds the field of one command parameter.
 *
 * @param parameter Parameter.
 * @param value Stored value as code text.
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
  row.append(caption, inputs);
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
    read: () => `[${fields.map((input) => input.value.trim()).join(', ')}]`,
    problem: () => (fields.some((input) => input.value.trim() === '') ? `${parameter.label} needs every axis.` : ''),
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
  if (parameter.type !== 'text' && text === '') return `${parameter.label} needs a value.`;
  return '';
}

/**
 * Splits a vector written as "[a, b, c]" into its axes, keeping nested lists
 * and calls whole.
 *
 * @param value Code text.
 * @param size Expected axis count.
 * @returns Axis texts, or null when the value is not such a list.
 */
export function solidScriptConfiguratorVectorParts(value: string, size: number): string[] | null {
  const text = value.trim();
  if (!text.startsWith('[') || !text.endsWith(']') || text.includes(':')) return null;
  const parts = solidScriptConfiguratorListSplit(text.slice(1, -1));
  return parts.length === size ? parts : null;
}

/**
 * Splits list items at the commas outside brackets and parentheses.
 *
 * @param inner Text between the list brackets.
 * @returns Trimmed items.
 */
function solidScriptConfiguratorListSplit(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < inner.length; index++) {
    const character = inner[index];
    if (character === '[' || character === '(') depth++;
    else if (character === ']' || character === ')') depth--;
    else if (character === ',' && depth === 0) {
      parts.push(inner.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(inner.slice(start).trim());
  return parts;
}
