import { modifierStackParametersCommit } from '@/modifier/stack/modifier_stack_parameters_commit.js';
import type { ModifierStackActionTarget, ModifierStackWidget } from '@/modifier/stack/modifier_stack_types.js';
import {
  modifierStackUiCaption,
  modifierStackUiRow,
  modifierStackUiText,
  modifierStackUiTextButton,
  modifierStackUiToggleRow,
} from '@/modifier/stack/ui/modifier_stack_ui_style.js';
import { curveDecode, curveEncode } from '@/curve/model/curve_codec.js';
import { curveFromPolyline } from '@/curve/model/curve_model.js';
import { curvePresetCatalog } from '@/curve/model/curve_preset_catalog.js';
import { CURVE_PRESETS_ARCHITECTURE } from '@/curve/model/curve_preset_architecture.js';
import { CURVE_PRESETS_EXTENDED } from '@/curve/model/curve_preset_extended.js';
import { CURVE_PRESETS_TURNERY } from '@/curve/model/curve_preset_turnery.js';
import { CurveField } from '@/curve/ui/curve_field.js';
import { modifierStackTextureRow } from '@/modifier/stack/ui/modifier_stack_texture_row.js';
import { InputSelect } from '@/ui/input/input_select.js';
import { inputNumericCreateUvField } from '@/ui/input/input_numeric_uv_field.js';
import { solidScriptDocumentNormalize } from '@/solid_script/document/solid_script_document.js';
import type { SolidScriptInput } from '@/solid_script/language/solid_script_input.js';
import {
  solidScriptDocumentInputLayout,
  type SolidScriptInputLayoutItem,
} from '@/solid_script/document/solid_script_document_inputs.js';
import type { SolidScriptEvent } from '@/solid_script/language/solid_script_machine.js';
import { solidScriptProgramHandle } from '@/solid_script/language/solid_script_program.js';

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
 * like the settings of a built-in generator, hidden when the script has none. A
 * change, or a press of a button input, first runs the script's When Input
 * Changes or When Button Pressed blocks, which may adjust values and show
 * messages under the rows; the result is stored as one undo step.
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
  const rowsHost = document.createElement('div');
  const notices = document.createElement('div');
  notices.dataset['solidScriptNotices'] = 'true';
  Object.assign(notices.style, { display: 'grid', gap: '2px', padding: '2px 0' });
  element.append(rowsHost, notices);
  let shape = '';
  let script: unknown = null;
  let values: Record<string, string> = {};
  let writers: ((text: string) => void)[] = [];
  const noticesShow = (texts: readonly string[], error: string | null): void => {
    const lines = texts.map((text) => modifierStackUiText('div', text, true));
    if (error !== null) {
      const line = modifierStackUiText('div', error, true);
      Object.assign(line.style, { color: '#e06c6c', opacity: '1' });
      lines.push(line);
    }
    notices.replaceChildren(...lines);
  };
  const commit = (event: SolidScriptEvent, text: string | null): void => {
    const target = targetOf(() => undefined);
    if (!target) return;
    const typed = text === null ? { ...values } : { ...values, [event.name]: text };
    const handled = solidScriptProgramHandle(solidScriptDocumentNormalize(script), event, typed);
    noticesShow(handled.notices, handled.error?.message ?? null);
    const next: Record<string, string> = { ...typed, ...handled.inputs };
    for (const key of handled.removed) delete next[key];
    if (JSON.stringify(next) === JSON.stringify(values)) return;
    modifierStackParametersCommit(target.volume, target.stepId, { [inputsKey]: next }, target.commandStack);
    target.refresh?.();
  };
  const write = (parameters: Record<string, unknown>): void => {
    script = parameters[scriptKey];
    const layout = solidScriptDocumentInputLayout(solidScriptDocumentNormalize(script));
    const inputs = layout.flatMap((item) => (item.kind === 'input' ? [item.input] : []));
    values = solidScriptInspectorInputValues(parameters[inputsKey]);
    const next = JSON.stringify(layout);
    if (next !== shape) {
      shape = next;
      notices.replaceChildren();
      const { elements, rowWriters } = solidScriptInspectorLayoutRows(layout, (input, text) =>
        commit({ kind: input.type === 'button' ? 'button' : 'input', name: input.name }, text),
      );
      rowsHost.replaceChildren(...elements);
      writers = rowWriters;
    }
    element.style.display = layout.length > 0 ? '' : 'none';
    inputs.forEach((input, index) => writers[index]?.(values[input.name] ?? input.fallback));
  };
  return { element, write };
}

/**
 * Builds the rows of an inspector layout: a heading where an Input Group
 * starts, a line of text per note and a control per input.
 *
 * @param layout Rows in line order.
 * @param commit Stores a new value of an input, or presses a button with null.
 * @returns Elements in order, and how to show each input's value.
 */
function solidScriptInspectorLayoutRows(
  layout: readonly SolidScriptInputLayoutItem[],
  commit: (input: SolidScriptInput, text: string | null) => void,
): { elements: HTMLElement[]; rowWriters: ((text: string) => void)[] } {
  const elements: HTMLElement[] = [];
  const rowWriters: ((text: string) => void)[] = [];
  let group = '';
  for (const item of layout) {
    if (item.group !== group && item.group !== '') {
      const caption = modifierStackUiCaption(item.group);
      caption.dataset['solidScriptGroup'] = item.group;
      elements.push(caption);
    }
    group = item.group;
    if (item.kind === 'note') {
      elements.push(modifierStackUiText('div', item.text, true));
      continue;
    }
    const row = solidScriptInspectorInputRow(item.input, (text) => commit(item.input, text));
    elements.push(row.element);
    rowWriters.push(row.write);
  }
  return { elements, rowWriters };
}

/**
 * Builds the control of one input.
 *
 * @param input Input.
 * @param commit Stores a new value as text, or presses a button with null.
 * @returns Row and how to show a value.
 */
function solidScriptInspectorInputRow(
  input: SolidScriptInput,
  commit: (text: string | null) => void,
): { element: HTMLElement; write: (text: string) => void } {
  const hint = `Script input [${input.name}]`;
  if (input.type === 'button') {
    const button = modifierStackUiTextButton(
      input.label,
      `${input.label}: runs When Button Pressed ${input.name}`,
      () => commit(null),
    );
    button.dataset['solidScriptButton'] = input.name;
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.append(button);
    return { element: row, write: () => undefined };
  }
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
  if (input.type === 'curve') return solidScriptInspectorCurveRow(input, commit, hint);
  if (input.type === 'texture') {
    const { row, write } = modifierStackTextureRow(
      { key: input.name, label: input.label, type: 'texture', default: '', hint },
      (_key, value) => commit(String(value)),
    );
    row.dataset['solidScriptTexture'] = input.name;
    return { element: row, write: (text) => write(text, {}) };
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

/**
 * Builds the control of a curve input: a preview strip that opens the curve
 * editor, with the column presets. The curve is stored as text; a number or
 * empty text shows as a flat line at that height, as the script reads it.
 *
 * @param input Curve input.
 * @param commit Stores a new value as text.
 * @param hint Row tooltip.
 * @returns Row and how to show a value.
 */
function solidScriptInspectorCurveRow(
  input: SolidScriptInput,
  commit: (text: string) => void,
  hint: string,
): { element: HTMLElement; write: (text: string) => void } {
  const field = new CurveField({
    label: input.label,
    presets: curvePresetCatalog([...CURVE_PRESETS_ARCHITECTURE, ...CURVE_PRESETS_TURNERY, ...CURVE_PRESETS_EXTENDED]),
    fileName: input.label,
    onPreview: () => undefined,
    onCommit: (curve) => commit(curveEncode(curve)),
  });
  const write = (text: string): void => {
    const height = text.trim() === '' ? 1 : Number(text);
    field.setCurve(
      (Number.isFinite(height) ? null : curveDecode(text)) ??
        curveFromPolyline([
          [0, Number.isFinite(height) ? height : 1],
          [1, Number.isFinite(height) ? height : 1],
        ]),
    );
  };
  const row = modifierStackUiRow(input.label, field.getElement(), hint);
  row.dataset['solidScriptCurve'] = input.name;
  return { element: row, write };
}
