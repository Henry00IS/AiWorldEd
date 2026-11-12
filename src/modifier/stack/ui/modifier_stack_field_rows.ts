import { curveDecode, curveEncode } from '@/curve/model/curve_codec.js';
import { curveMarkerHeightSet } from '@/curve/model/curve_markers.js';
import type { Curve } from '@/curve/model/curve_model.js';
import { InputSelect, type InputSelectChoice } from '@/ui/input/input_select.js';
import type { InputNumeric } from '@/ui/input/input_numeric.js';
import { inputNumericCreateUvField } from '@/ui/input/input_numeric_uv_field.js';
import type { ModifierStackField, ModifierStackValue } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackUiCaption, modifierStackUiRow, modifierStackUiToggleRow } from './modifier_stack_ui_style.js';
import { modifierStackTextureRow } from './modifier_stack_texture_row.js';
import { modifierStackCurveRow, type ModifierStackCurveHooks } from './modifier_stack_curve_row.js';

/** One rendered field: its row, and how to read and write its control. */
export interface ModifierStackFieldRow {
  field: ModifierStackField;
  row: HTMLElement;
  write: (value: unknown, parameters: Record<string, unknown>) => void;
}

/**
 * Renders the fields of a field-based modifier as grouped rows. Rows whose
 * field does not apply to the current parameters are hidden.
 */
export class ModifierStackFieldRows {
  private readonly element: HTMLElement;
  private readonly rows: ModifierStackFieldRow[] = [];
  private readonly captions = new Map<string, HTMLElement>();

  /**
   * Builds the rows.
   *
   * @param fields Field descriptions in display order.
   * @param onCommit Receives a committed field value.
   * @param objectChoices Lists the objects an object field can name.
   * @param curveHooks Live preview and fallback curves of curve fields.
   */
  constructor(
    fields: readonly ModifierStackField[],
    onCommit: (key: string, value: ModifierStackValue) => void,
    private readonly objectChoices: () => InputSelectChoice[] = () => [],
    private readonly curveHooks: ModifierStackCurveHooks = {},
  ) {
    this.element = document.createElement('div');
    for (const field of fields.filter((candidate) => !candidate.hidden)) {
      if (field.group && !this.captions.has(field.group)) this.appendCaption(field.group);
      const row = this.createRow(field, onCommit);
      this.rows.push(row);
      this.element.appendChild(row.row);
    }
  }

  /**
   * Returns the rows container.
   *
   * @returns Container element.
   */
  getElement(): HTMLElement {
    return this.element;
  }

  /**
   * Writes parameter values and applies smart visibility.
   *
   * @param parameters Normalized modifier parameters.
   */
  update(parameters: Record<string, unknown>): void {
    const visibleGroups = new Set<string>();
    for (const { field, row, write } of this.rows) {
      const visible = field.visible ? field.visible(parameters) : true;
      row.style.display = visible ? '' : 'none';
      if (visible && field.group) visibleGroups.add(field.group);
      write(parameters[field.key], parameters);
    }
    for (const [group, caption] of this.captions) caption.style.display = visibleGroups.has(group) ? 'block' : 'none';
  }

  /**
   * Adds a small group caption.
   *
   * @param group Group title.
   */
  private appendCaption(group: string): void {
    const caption = modifierStackUiCaption(group);
    this.captions.set(group, caption);
    this.element.appendChild(caption);
  }

  /**
   * Creates the row and control for one field.
   *
   * @param field Field description.
   * @param onCommit Commit callback.
   * @returns Rendered field.
   */
  private createRow(
    field: ModifierStackField,
    onCommit: (key: string, value: ModifierStackValue) => void,
  ): ModifierStackFieldRow {
    if (field.type === 'choice') return modifierStackChoiceRow(field, onCommit);
    if (field.type === 'boolean') return modifierStackBooleanRow(field, onCommit);
    if (field.type === 'object') return modifierStackObjectRow(field, onCommit, this.objectChoices);
    if (field.type === 'curve') return modifierStackCurveRow(field, onCommit, this.curveHooks);
    if (field.type === 'texture') return modifierStackTextureRow(field, onCommit);
    if (field.type === 'color') return modifierStackColorRow(field, onCommit);
    if (field.curveHeight) return modifierStackCurveHeightRow(field, field.curveHeight, onCommit);
    return modifierStackNumberRow(field, onCommit);
  }
}

/**
 * Creates a numeric row.
 *
 * @param field Number field.
 * @param onCommit Commit callback.
 * @returns Rendered field.
 */
function modifierStackNumberRow(
  field: ModifierStackField,
  onCommit: (key: string, value: ModifierStackValue) => void,
): ModifierStackFieldRow {
  const input: InputNumeric = inputNumericCreateUvField(field.step ?? (field.integer ? 1 : 0.25), field.label);
  input.bindCommit(() => {
    const value = input.parseNumberOrNull();
    if (value !== null && Number.isFinite(value)) onCommit(field.key, field.integer ? Math.round(value) : value);
  });
  const write = (value: unknown): void =>
    input.setNumber(typeof value === 'number' ? value : Number(field.default), field.integer ? 0 : 2);
  return { field, row: modifierStackUiRow(field.label, input.getElement(), field.hint), write };
}

/**
 * Creates a numeric row for a fixed Base or Top height kept in a curve field:
 * it shows the curve's height, or the field's own value for curves without one,
 * and commits the curve with the new height as one edit.
 *
 * @param field Number field.
 * @param target Curve field key and marker.
 * @param onCommit Commit callback.
 * @returns Rendered field.
 */
function modifierStackCurveHeightRow(
  field: ModifierStackField,
  target: NonNullable<ModifierStackField['curveHeight']>,
  onCommit: (key: string, value: ModifierStackValue) => void,
): ModifierStackFieldRow {
  let curve: Curve | null = null;
  const row = modifierStackNumberRow(field, (_key, value) => {
    if (curve && typeof value === 'number')
      onCommit(target.curve, curveEncode(curveMarkerHeightSet(curve, target.side, value)));
  });
  const write = (value: unknown, parameters: Record<string, unknown>): void => {
    curve = curveDecode(parameters[target.curve]);
    row.write(curve?.markers?.heights?.[target.side] ?? value, parameters);
  };
  return { ...row, write };
}

/**
 * Creates a choice row.
 *
 * @param field Choice field.
 * @param onCommit Commit callback.
 * @returns Rendered field.
 */
function modifierStackChoiceRow(
  field: ModifierStackField,
  onCommit: (key: string, value: ModifierStackValue) => void,
): ModifierStackFieldRow {
  const input = new InputSelect(field.choices ?? [], field.label);
  input.bindCommit(() => onCommit(field.key, input.getValue()));
  const write = (value: unknown): void => input.setSharedValues([String(value ?? field.default)]);
  return { field, row: modifierStackUiRow(field.label, input.getElement(), field.hint), write };
}

/**
 * Creates a checkbox row.
 *
 * @param field Boolean field.
 * @param onCommit Commit callback.
 * @returns Rendered field.
 */
function modifierStackBooleanRow(
  field: ModifierStackField,
  onCommit: (key: string, value: ModifierStackValue) => void,
): ModifierStackFieldRow {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('aria-label', field.label);
  input.addEventListener('change', () => onCommit(field.key, input.checked));
  const row = modifierStackUiToggleRow(field.label, input, field.hint);
  return { field, row, write: (value) => (input.checked = value === true) };
}

/**
 * Creates a color row. The value commits once the picker closes, so dragging
 * through colors makes one undo step.
 *
 * @param field Color field.
 * @param onCommit Commit callback.
 * @returns Rendered field.
 */
function modifierStackColorRow(
  field: ModifierStackField,
  onCommit: (key: string, value: ModifierStackValue) => void,
): ModifierStackFieldRow {
  const input = document.createElement('input');
  input.type = 'color';
  input.setAttribute('aria-label', field.label);
  Object.assign(input.style, {
    height: '22px',
    padding: '0',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
  });
  input.addEventListener('change', () => onCommit(field.key, input.value.toLowerCase()));
  const write = (value: unknown): void => {
    input.value = typeof value === 'string' ? value : String(field.default);
  };
  return { field, row: modifierStackUiRow(field.label, input, field.hint), write };
}

/**
 * Creates an object picker: None, then every group and brush the provider
 * lists. A stored id that no longer exists stays visible as missing.
 *
 * @param field Field description.
 * @param onCommit Receives the picked id, or empty for none.
 * @param objectChoices Lists the objects that can be picked.
 * @returns Row.
 */
function modifierStackObjectRow(
  field: ModifierStackField,
  onCommit: (key: string, value: ModifierStackValue) => void,
  objectChoices: () => InputSelectChoice[],
): ModifierStackFieldRow {
  const input = new InputSelect([], field.label);
  input.bindCommit(() => onCommit(field.key, input.getValue()));
  const write = (value: unknown): void => {
    const id = typeof value === 'string' ? value : '';
    const choices = [{ value: '', label: 'None' }, ...objectChoices()];
    if (id && !choices.some((choice) => choice.value === id)) choices.push({ value: id, label: 'Missing Object' });
    input.setChoices(choices);
    input.setSharedValues([id]);
  };
  return { field, row: modifierStackUiRow(field.label, input.getElement(), field.hint), write };
}
