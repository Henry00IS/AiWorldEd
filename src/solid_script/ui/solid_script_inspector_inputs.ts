import { modifierStackParametersCommit } from '@/modifier/stack/modifier_stack_parameters_commit.js';
import { pathEditSelected, pathEditSelectionListen } from '@/path/edit/path_edit_selection.js';
import { PathField } from '@/path/ui/path_field.js';
import { pathAssetEncode } from '@/path/model/path_asset.js';
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
import { solidScriptNameKey } from '@/solid_script/language/solid_script_name_key.js';
import {
  solidScriptDocumentInputLayout,
  solidScriptInputRulesHold,
  type SolidScriptInputLayoutItem,
} from '@/solid_script/document/solid_script_document_inputs.js';
import type { SolidScriptEvent } from '@/solid_script/language/solid_script_machine_types.js';
import { solidScriptDocumentEvent } from '@/solid_script/document/solid_script_document_event.js';

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
  let visibility: (valueOf: (name: string) => string | undefined) => void = () => undefined;
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
    const { next, handled } = solidScriptDocumentEvent(script, event, values, text);
    noticesShow(handled.notices, handled.error?.message ?? null);
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
      const built = solidScriptInspectorLayoutRows(
        layout,
        (input, text) => commit({ kind: input.type === 'Button' ? 'button' : 'input', name: input.name }, text),
        () => targetOf(() => undefined)?.stepId ?? null,
      );
      rowsHost.replaceChildren(...built.elements);
      writers = built.rowWriters;
      visibility = built.visibility;
    }
    element.style.display = layout.length > 0 ? '' : 'none';
    inputs.forEach((input, index) => writers[index]?.(values[input.name] ?? input.fallback));
    visibility((name) => {
      const input = inputs.find((each) => solidScriptNameKey(each.name) === solidScriptNameKey(name));
      return input ? (values[input.name] ?? input.fallback) : values[name];
    });
  };
  return { element, write };
}

/**
 * Builds the rows of an inspector layout: a heading where an Input Group
 * starts, a line of text per note, a control per input, and the inputs of an
 * Input Row side by side.
 *
 * @param layout Rows in line order.
 * @param commit Stores a new value of an input, or presses a button with null.
 * @param stepIdOf Returns the id of the step the rows show, or null.
 * @returns Elements in order, how to show each input's value, and how to show
 *   only the rows whose Show Inputs When conditions hold.
 */
function solidScriptInspectorLayoutRows(
  layout: readonly SolidScriptInputLayoutItem[],
  commit: (input: SolidScriptInput, text: string | null) => void,
  stepIdOf: () => string | null,
): {
  elements: HTMLElement[];
  rowWriters: ((text: string) => void)[];
  visibility: (valueOf: (name: string) => string | undefined) => void;
} {
  const elements: HTMLElement[] = [];
  const rowWriters: ((text: string) => void)[] = [];
  // Elements shown under conditions; a heading shows while any row under it does.
  const units: { element: HTMLElement; when: SolidScriptInputLayoutItem['when'][] }[] = [];
  let caption: { element: HTMLElement; when: SolidScriptInputLayoutItem['when'][] } | null = null;
  let row = null as { element: HTMLElement; line: number; when: SolidScriptInputLayoutItem['when'][] } | null;
  let group = '';
  for (const item of layout) {
    if (item.group !== group && item.group !== '') {
      const element = modifierStackUiCaption(item.group);
      element.dataset['solidScriptGroup'] = item.group;
      elements.push(element);
      caption = { element, when: [] };
      units.push(caption);
    }
    if (item.group === '') caption = null;
    group = item.group;
    caption?.when.push(item.when);
    const element =
      item.kind === 'note'
        ? modifierStackUiText('div', item.text, true)
        : solidScriptInspectorInputRowWritten(item.input, commit, rowWriters, stepIdOf);
    if (item.row === null) {
      row = null;
      elements.push(element);
      units.push({ element, when: [item.when] });
      continue;
    }
    if (row?.line !== item.row) {
      const host = document.createElement('div');
      host.dataset['solidScriptRow'] = 'true';
      Object.assign(host.style, { display: 'flex', gap: '4px' });
      row = { element: host, line: item.row, when: [] };
      elements.push(host);
      units.push(row);
    }
    element.style.flex = '1 1 0';
    element.style.minWidth = '0';
    row.element.append(element);
    row.when.push(item.when);
  }
  const visibility = (valueOf: (name: string) => string | undefined): void => {
    for (const unit of units) {
      const shown = unit.when.some((when) => solidScriptInputRulesHold(when, valueOf));
      unit.element.style.display = shown ? (unit.element.dataset['solidScriptRow'] ? 'flex' : '') : 'none';
    }
  };
  return { elements, rowWriters, visibility };
}

/**
 * Builds the control of one input and records how to show its value.
 *
 * @param input Input.
 * @param commit Stores a new value of an input, or presses a button with null.
 * @param writers Receives how to show the value, in input order.
 * @param stepIdOf Returns the id of the step the rows show, or null.
 * @returns Control element.
 */
function solidScriptInspectorInputRowWritten(
  input: SolidScriptInput,
  commit: (input: SolidScriptInput, text: string | null) => void,
  writers: ((text: string) => void)[],
  stepIdOf: () => string | null,
): HTMLElement {
  const control = solidScriptInspectorInputRow(input, (text) => commit(input, text), stepIdOf);
  writers.push(control.write);
  return control.element;
}

/**
 * Builds the control of one input.
 *
 * @param input Input.
 * @param commit Stores a new value as text, or presses a button with null.
 * @param stepIdOf Returns the id of the step the row shows, or null.
 * @returns Row and how to show a value.
 */
function solidScriptInspectorInputRow(
  input: SolidScriptInput,
  commit: (text: string | null) => void,
  stepIdOf: () => string | null,
): { element: HTMLElement; write: (text: string) => void } {
  const hint = input.tooltip || `Script input [${input.name}]`;
  if (input.type === 'Button') {
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
  if (input.type === 'Switch') {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.setAttribute('aria-label', input.label);
    box.addEventListener('change', () => commit(box.checked ? 'yes' : 'no'));
    const write = (text: string): void => void (box.checked = ['true', 'yes', '1'].includes(text.trim().toLowerCase()));
    return { element: modifierStackUiToggleRow(input.label, box, hint), write };
  }
  if (input.type === 'Choice') {
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
  if (input.type === 'Curve') return solidScriptInspectorCurveRow(input, commit, hint);
  if (input.type === 'Path') return solidScriptInspectorPathRow(input, commit, hint, stepIdOf);
  if (input.type === 'Texture') {
    const { row, write } = modifierStackTextureRow(
      { key: input.name, label: input.label, type: 'texture', default: '', hint },
      (_key, value) => commit(String(value)),
    );
    row.dataset['solidScriptTexture'] = input.name;
    return { element: row, write: (text) => write(text, {}) };
  }
  if (input.type === 'Text') {
    const field = document.createElement('input');
    field.type = 'text';
    field.setAttribute('aria-label', input.label);
    Object.assign(field.style, { width: '100%', boxSizing: 'border-box' });
    field.addEventListener('change', () => commit(field.value));
    return { element: modifierStackUiRow(input.label, field, hint), write: (text) => void (field.value = text) };
  }
  if (input.type === 'Vector') return solidScriptInspectorVectorRow(input, commit, hint);
  const integer = input.type === 'Count';
  const number = inputNumericCreateUvField(integer ? 1 : 0.25, input.label);
  number.bindCommit(() => {
    const parsed = number.parseNumberOrNull();
    if (parsed === null || !Number.isFinite(parsed)) return;
    let value = integer ? Math.round(parsed) : parsed;
    if (input.min !== null) value = Math.max(input.min, value);
    if (input.max !== null) value = Math.min(input.max, value);
    commit(String(value));
  });
  if (input.min === null || input.max === null) {
    const write = (text: string): void => number.setNumber(Number(text), integer ? 0 : 2);
    return { element: modifierStackUiRow(input.label, number.getElement(), hint), write };
  }
  // Both limits known: a slider beside the field, committed when let go.
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = String(input.min);
  slider.max = String(input.max);
  slider.step = integer ? '1' : String((input.max - input.min) / 100 || 0.01);
  slider.setAttribute('aria-label', `${input.label} Slider`);
  Object.assign(slider.style, { minWidth: '0', flex: '1' });
  slider.addEventListener('input', () => number.setNumber(Number(slider.value), integer ? 0 : 2));
  slider.addEventListener('change', () => commit(String(Number(slider.value))));
  const pair = document.createElement('div');
  Object.assign(pair.style, { display: 'flex', gap: '6px', alignItems: 'center' });
  pair.append(slider, number.getElement());
  const write = (text: string): void => {
    number.setNumber(Number(text), integer ? 0 : 2);
    slider.value = text.trim();
  };
  return { element: modifierStackUiRow(input.label, pair, hint), write };
}

/**
 * Builds the control of a vector input: X, Y and Z number fields on one row,
 * stored together as three numbers with commas.
 *
 * @param input Vector input.
 * @param commit Stores a new value as text.
 * @param hint Row tooltip.
 * @returns Row and how to show a value.
 */
function solidScriptInspectorVectorRow(
  input: SolidScriptInput,
  commit: (text: string) => void,
  hint: string,
): { element: HTMLElement; write: (text: string) => void } {
  const shown = [0, 0, 0];
  const fields = ['X', 'Y', 'Z'].map((axis, index) => {
    const field = inputNumericCreateUvField(0.25, `${input.label} ${axis}`);
    field.bindCommit(() => {
      const parsed = field.parseNumberOrNull();
      if (parsed === null || !Number.isFinite(parsed)) return;
      let value = parsed;
      if (input.min !== null) value = Math.max(input.min, value);
      if (input.max !== null) value = Math.min(input.max, value);
      shown[index] = value;
      commit(shown.join(', '));
    });
    return field;
  });
  const row = document.createElement('div');
  row.dataset['solidScriptVector'] = input.name;
  Object.assign(row.style, { display: 'flex', gap: '4px' });
  row.append(...fields.map((field) => field.getElement()));
  const write = (text: string): void => {
    const parts = text.split(',').map((part) => Number(part.trim()));
    fields.forEach((field, index) => {
      shown[index] = Number.isFinite(parts[index]) ? parts[index]! : 0;
      field.setNumber(shown[index]!, 2);
    });
  };
  return { element: modifierStackUiRow(input.label, row, hint), write };
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

/**
 * Builds the control of a path input: its summary and file buttons, and the
 * settings of the point of this input selected in the scene. It follows the
 * selection while it is shown.
 *
 * @param input Path input.
 * @param commit Stores a new value as text.
 * @param hint Row tooltip.
 * @param stepIdOf Returns the id of the step the row shows, or null.
 * @returns Row and how to show a value.
 */
function solidScriptInspectorPathRow(
  input: SolidScriptInput,
  commit: (text: string) => void,
  hint: string,
  stepIdOf: () => string | null,
): { element: HTMLElement; write: (text: string) => void } {
  const field = new PathField({ label: input.label, onCommit: (path) => commit(pathAssetEncode(path)) });
  const row = modifierStackUiRow(input.label, field.getElement(), hint);
  row.dataset['solidScriptPath'] = input.name;
  const follow = (): void => {
    const picked = pathEditSelected();
    field.setSelected(picked?.name === input.name && picked.stepId === stepIdOf() ? picked.point : null);
  };
  const stop = pathEditSelectionListen(() => (row.isConnected ? follow() : stop()));
  return {
    element: row,
    write: (text) => {
      field.setText(text);
      follow();
    },
  };
}
