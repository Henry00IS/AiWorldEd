import { modifierStackParametersCommit } from '@/modifier/stack/modifier_stack_parameters_commit.js';
import type { ModifierStackActionTarget, ModifierStackWidget } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackUiRow, modifierStackUiToggleRow } from '@/modifier/stack/ui/modifier_stack_ui_style.js';
import { InputSelect } from '@/ui/input/input_select.js';
import { inputNumericCreateUvField } from '@/ui/input/input_numeric_uv_field.js';
import { solidScriptDocumentNormalize } from '@/solid_script/document/solid_script_document.js';
import { solidScriptInputsList, type SolidScriptInput } from '@/solid_script/language/solid_script_input.js';

/** Builds what the rows act on, with a status line. */
type SolidScriptInspectorTargetOf = (status: (text: string) => void) => ModifierStackActionTarget | null;

/**
 * Reads the stored input values of a generator: text by input name.
 *
 * @param value Stored value.
 * @returns Input values.
 */
export function solidScriptInspectorInputValues(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

/**
 * Builds the inspector rows of a script's Input lines: one control per input,
 * like the settings of a built-in generator, hidden when the script has none.
 *
 * @param targetOf Builds what the rows act on.
 * @param scriptKey Parameter key of the script.
 * @param inputsKey Parameter key of the input values.
 * @returns Inspector widget.
 */
export function solidScriptInspectorInputs(
  targetOf: SolidScriptInspectorTargetOf,
  scriptKey: string,
  inputsKey: string,
): ModifierStackWidget {
  const element = document.createElement('div');
  element.dataset['solidScriptInputs'] = 'true';
  let shape = '';
  let values: Record<string, string> = {};
  let writers: ((text: string) => void)[] = [];
  const commit = (name: string, text: string): void => {
    const target = targetOf(() => undefined);
    if (!target) return;
    modifierStackParametersCommit(
      target.volume,
      target.stepId,
      { [inputsKey]: { ...values, [name]: text } },
      target.commandStack,
    );
    target.refresh?.();
  };
  const write = (parameters: Record<string, unknown>): void => {
    const inputs = solidScriptInputsList(solidScriptDocumentNormalize(parameters[scriptKey]).blocks);
    values = solidScriptInspectorInputValues(parameters[inputsKey]);
    const next = JSON.stringify(inputs);
    if (next !== shape) {
      shape = next;
      const rows = inputs.map((input) => solidScriptInspectorInputRow(input, (text) => commit(input.name, text)));
      element.replaceChildren(...rows.map((row) => row.element));
      writers = rows.map((row) => row.write);
    }
    element.style.display = inputs.length > 0 ? '' : 'none';
    inputs.forEach((input, index) => writers[index]?.(values[input.name] ?? input.fallback));
  };
  return { element, write };
}

/**
 * Builds the control of one input.
 *
 * @param input Input.
 * @param commit Stores a new value as text.
 * @returns Row and how to show a value.
 */
function solidScriptInspectorInputRow(
  input: SolidScriptInput,
  commit: (text: string) => void,
): { element: HTMLElement; write: (text: string) => void } {
  const hint = `Script input [${input.name}]`;
  if (input.type === 'switch') {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.setAttribute('aria-label', input.label);
    box.addEventListener('change', () => commit(box.checked ? 'yes' : 'no'));
    const write = (text: string): void => void (box.checked = ['true', 'yes', '1'].includes(text.trim().toLowerCase()));
    return { element: modifierStackUiToggleRow(input.label, box, hint), write };
  }
  if (input.type === 'choice') {
    const select = new InputSelect(
      input.choices.map((choice) => ({ value: choice, label: choice })),
      input.label,
    );
    select.bindCommit(() => commit(select.getValue()));
    return {
      element: modifierStackUiRow(input.label, select.getElement(), hint),
      write: (text) => select.setSharedValues([text.trim()]),
    };
  }
  if (input.type === 'text') {
    const field = document.createElement('input');
    field.type = 'text';
    field.setAttribute('aria-label', input.label);
    Object.assign(field.style, { width: '100%', boxSizing: 'border-box' });
    field.addEventListener('change', () => commit(field.value));
    return { element: modifierStackUiRow(input.label, field, hint), write: (text) => void (field.value = text) };
  }
  const integer = input.type === 'count';
  const number = inputNumericCreateUvField(integer ? 1 : 0.25, input.label);
  number.bindCommit(() => {
    const parsed = number.parseNumberOrNull();
    if (parsed === null || !Number.isFinite(parsed)) return;
    let value = integer ? Math.round(parsed) : parsed;
    if (input.min !== null) value = Math.max(input.min, value);
    if (input.max !== null) value = Math.min(input.max, value);
    commit(String(value));
  });
  const write = (text: string): void => number.setNumber(Number(text), integer ? 0 : 2);
  return { element: modifierStackUiRow(input.label, number.getElement(), hint), write };
}
