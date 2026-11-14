import type { InputNumeric } from '@/ui/input/input_numeric.js';
import { inputNumericCreateUvField } from '@/ui/input/input_numeric_uv_field.js';
import type { ModifierStackField, ModifierStackValue } from '@/modifier/stack/modifier_stack_types.js';
import { PATH_MAX_POINTS, pathDecode, pathEncode, pathFallback, type Path } from '@/path/model/path_model.js';
import type { ModifierStackFieldRow } from './modifier_stack_field_rows.js';
import {
  modifierStackUiIconButton,
  modifierStackUiText,
  modifierStackUiTextButton,
  modifierStackUiToggleRow,
} from './modifier_stack_ui_style.js';

/** Remove glyph of a point row. */
const PATH_ROW_REMOVE_GLYPH =
  '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

/** Axis keys of a point, in input order. */
const PATH_ROW_AXES = ['x', 'y', 'z'] as const;

/**
 * Creates the editor of a path field: Smooth Curve and Closed Loop toggles, one
 * row of X, Y, Z per point with a remove button, and Add Point and Reverse
 * actions. Every change commits the whole path as one edit.
 *
 * @param field Path field.
 * @param onCommit Receives the encoded path.
 * @returns Rendered field.
 */
export function modifierStackPathRow(
  field: ModifierStackField,
  onCommit: (key: string, value: ModifierStackValue) => void,
): ModifierStackFieldRow {
  let path: Path = pathFallback();
  const element = document.createElement('div');
  element.title = field.hint ?? '';
  const commit = (next: Path): void => onCommit(field.key, pathEncode(next));
  const smooth = pathRowCheckbox('Smooth Curve', () => commit({ ...path, smooth: smooth.checked }));
  const closed = pathRowCheckbox('Closed Loop', () => commit({ ...path, closed: closed.checked }));
  const toggles = document.createElement('div');
  toggles.append(
    modifierStackUiToggleRow('Smooth Curve', smooth, 'Draws a smooth curve through the points.'),
    modifierStackUiToggleRow('Closed Loop', closed, 'Joins the last point back to the first.'),
  );
  const list = document.createElement('div');
  Object.assign(list.style, { display: 'flex', flexDirection: 'column', gap: '3px', padding: '0 8px 6px' });
  let inputs: InputNumeric[][] = [];
  const add = modifierStackUiTextButton('Add Point', 'Add Point', () => commit(pathRowAppend(path)));
  const reverse = modifierStackUiTextButton('Reverse', 'Reverse Path Direction', () =>
    commit({ ...path, points: [...path.points].reverse() }),
  );
  const actions = document.createElement('div');
  Object.assign(actions.style, { display: 'flex', gap: '6px', padding: '0 8px 6px' });
  actions.append(add, reverse);
  element.append(modifierStackUiText('div', field.label), toggles, list, actions);
  Object.assign((element.firstChild as HTMLElement).style, { padding: '0 8px 4px' });

  const rebuild = (): void => {
    list.replaceChildren();
    inputs = path.points.map((_, index) => {
      const row = pathRowPoint(index, (axis, value) => {
        const points = path.points.map((point, at) => (at === index ? { ...point, [axis]: value } : point));
        commit({ ...path, points });
      });
      const remove = modifierStackUiIconButton(PATH_ROW_REMOVE_GLYPH, `Remove Point ${index + 1}`, () =>
        commit({ ...path, points: path.points.filter((_, at) => at !== index) }),
      );
      remove.disabled = path.points.length <= 2;
      remove.style.opacity = remove.disabled ? '0.35' : '1';
      row.element.appendChild(remove);
      list.appendChild(row.element);
      return row.inputs;
    });
  };
  const write = (value: unknown): void => {
    path = pathDecode(value) ?? pathDecode(field.default) ?? pathFallback();
    smooth.checked = path.smooth;
    closed.checked = path.closed;
    add.disabled = path.points.length >= PATH_MAX_POINTS;
    if (inputs.length !== path.points.length) rebuild();
    path.points.forEach((point, index) =>
      PATH_ROW_AXES.forEach((axis, column) => {
        const input = inputs[index]?.[column];
        if (input && !input.isTyping()) input.setNumber(point[axis], 0);
      }),
    );
  };
  return { field, row: element, write };
}

/**
 * Creates a labelled checkbox.
 *
 * @param label Accessible name.
 * @param onChange Change handler.
 * @returns Checkbox.
 */
function pathRowCheckbox(label: string, onChange: () => void): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('aria-label', label);
  input.addEventListener('change', onChange);
  return input;
}

/**
 * Builds one point row: its number and X, Y, Z inputs.
 *
 * @param index Point index.
 * @param onEdit Receives an edited coordinate.
 * @returns Row and its inputs.
 */
function pathRowPoint(
  index: number,
  onEdit: (axis: (typeof PATH_ROW_AXES)[number], value: number) => void,
): { element: HTMLElement; inputs: InputNumeric[] } {
  const element = document.createElement('div');
  Object.assign(element.style, { display: 'flex', alignItems: 'center', gap: '3px' });
  const number = modifierStackUiText('span', String(index + 1), true);
  Object.assign(number.style, { width: '14px', textAlign: 'right', flexShrink: '0' });
  element.appendChild(number);
  const inputs = PATH_ROW_AXES.map((axis) => {
    const input = inputNumericCreateUvField(0.25, `Point ${index + 1} ${axis.toUpperCase()}`);
    input.bindCommit(() => {
      const value = input.parseNumberOrNull();
      if (value !== null && Number.isFinite(value)) onEdit(axis, value);
    });
    Object.assign(input.getElement().style, {
      flex: '1',
      minWidth: '0',
      width: 'auto',
      maxWidth: 'none',
      padding: '0 3px',
      fontSize: '11px',
    });
    element.appendChild(input.getElement());
    return input;
  });
  return { element, inputs };
}

/**
 * Appends a point that continues the last span by the same length, or 2 m along
 * X for a degenerate end.
 *
 * @param path Path.
 * @returns Path with one more point.
 */
function pathRowAppend(path: Path): Path {
  const last = path.points[path.points.length - 1]!;
  const before = path.points[path.points.length - 2] ?? last;
  let step = { x: last.x - before.x, y: last.y - before.y, z: last.z - before.z };
  if (Math.hypot(step.x, step.y, step.z) < 1e-6) step = { x: 2, y: 0, z: 0 };
  return { ...path, points: [...path.points, { x: last.x + step.x, y: last.y + step.y, z: last.z + step.z }] };
}
