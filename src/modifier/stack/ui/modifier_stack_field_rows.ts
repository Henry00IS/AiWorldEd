import { InputSelect } from '@/ui/input/input_select.js';
import type { InputNumeric } from '@/ui/input/input_numeric.js';
import { inputNumericCreateUvField } from '@/ui/input/input_numeric_uv_field.js';
import type { ModifierStackField, ModifierStackValue } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackUiCaption, modifierStackUiRow, modifierStackUiToggleRow } from './modifier_stack_ui_style.js';

/** One rendered field: its row, and how to read and write its control. */
interface ModifierStackFieldRow {
  field: ModifierStackField;
  row: HTMLElement;
  write: (value: unknown) => void;
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
   */
  constructor(fields: readonly ModifierStackField[], onCommit: (key: string, value: ModifierStackValue) => void) {
    this.element = document.createElement('div');
    for (const field of fields) {
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
      write(parameters[field.key]);
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
