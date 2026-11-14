import type { InputNumeric } from '@/ui/input/input_numeric.js';
import { inputNumericCreateUvField } from '@/ui/input/input_numeric_uv_field.js';
import type { ModifierStackField, ModifierStackValue } from '@/modifier/stack/modifier_stack_types.js';
import {
  SKETCH_MAX_POINTS,
  SKETCH_MAX_SHAPES,
  SKETCH_SHAPE_TYPES,
  sketchDecode,
  sketchEncode,
  sketchShapeCreate,
  sketchShapeNormalize,
  type Sketch,
  type SketchPoint,
  type SketchShape,
} from '@/sketch/model/sketch_model.js';
import type { ModifierStackFieldRow } from './modifier_stack_field_rows.js';
import {
  modifierStackUiCaption,
  modifierStackUiIconButton,
  modifierStackUiRow,
  modifierStackUiText,
  modifierStackUiTextButton,
} from './modifier_stack_ui_style.js';
import { modifierStackUiPaint } from './modifier_stack_ui_paint.js';

/** Remove glyph. */
const SKETCH_ROW_REMOVE_GLYPH =
  '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

/** Visible name of each shape type. */
const SKETCH_ROW_TYPE_LABELS: Readonly<Record<SketchShape['type'], string>> = {
  rectangle: 'Rectangle',
  circle: 'Circle',
  arc: 'Arc',
  polygon: 'Outline',
  polyline: 'Line',
};

/** Number properties of each shape type with their captions. */
const SKETCH_ROW_NUMBERS: Readonly<Record<SketchShape['type'], readonly (readonly [string, string, number])[]>> = {
  rectangle: [
    ['u', 'Center U', 0.25],
    ['v', 'Center V', 0.25],
    ['width', 'Width', 0.25],
    ['height', 'Height', 0.25],
  ],
  circle: [
    ['u', 'Center U', 0.25],
    ['v', 'Center V', 0.25],
    ['radius', 'Radius', 0.25],
    ['sides', 'Sides', 1],
  ],
  arc: [
    ['u', 'Center U', 0.25],
    ['v', 'Center V', 0.25],
    ['radius', 'Radius', 0.25],
    ['thickness', 'Thickness', 0.05],
    ['start', 'Start Angle', 15],
    ['sweep', 'Sweep', 15],
    ['sides', 'Sides', 1],
  ],
  polygon: [],
  polyline: [['thickness', 'Thickness', 0.05]],
};

/** Inputs of one shape card. */
interface SketchRowCard {
  numbers: Map<string, InputNumeric>;
  points: InputNumeric[][];
}

/**
 * Creates the editor of a sketch field: one card per shape with its sizes or
 * points, add and remove buttons, and an Add row offering every shape type.
 * Every change commits the whole sketch as one edit.
 *
 * @param field Sketch field.
 * @param onCommit Receives the encoded sketch.
 * @returns Rendered field.
 */
export function modifierStackSketchRow(
  field: ModifierStackField,
  onCommit: (key: string, value: ModifierStackValue) => void,
): ModifierStackFieldRow {
  let sketch: Sketch = { shapes: [] };
  let structure = '';
  let cards: SketchRowCard[] = [];
  const element = document.createElement('div');
  element.title = field.hint ?? '';
  const list = document.createElement('div');
  const empty = modifierStackUiText('div', 'No shapes yet. Add one below.', true);
  Object.assign(empty.style, { padding: '0 8px 6px' });
  const commit = (next: Sketch): void => onCommit(field.key, sketchEncode(next));
  const replace = (index: number, shape: SketchShape): void => {
    const normalized = sketchShapeNormalize(shape);
    if (normalized) commit({ shapes: sketch.shapes.map((old, at) => (at === index ? normalized : old)) });
  };
  const adders = document.createElement('div');
  Object.assign(adders.style, { display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '0 8px 6px' });
  const addButtons = SKETCH_SHAPE_TYPES.map((type) =>
    modifierStackUiTextButton(`+ ${SKETCH_ROW_TYPE_LABELS[type]}`, `Add ${SKETCH_ROW_TYPE_LABELS[type]}`, () =>
      commit({ shapes: [...sketch.shapes, sketchShapeCreate(type)] }),
    ),
  );
  for (const button of addButtons) Object.assign(button.style, { flex: '1 1 40%' });
  adders.append(...addButtons);
  element.append(modifierStackUiCaption(field.label), empty, list, adders);

  const rebuild = (): void => {
    list.replaceChildren();
    cards = sketch.shapes.map((shape, index) => {
      const card = sketchRowCard(shape, index, {
        edit: (next) => replace(index, next),
        remove: () => commit({ shapes: sketch.shapes.filter((_, at) => at !== index) }),
      });
      list.appendChild(card.element);
      return card.inputs;
    });
  };
  const write = (value: unknown): void => {
    sketch = sketchDecode(value) ?? sketchDecode(field.default) ?? { shapes: [] };
    const next = sketch.shapes.map((shape) => `${shape.type}:${'points' in shape ? shape.points.length : 0}`).join(',');
    if (next !== structure) {
      structure = next;
      rebuild();
    }
    empty.style.display = sketch.shapes.length === 0 ? '' : 'none';
    for (const button of addButtons) button.disabled = sketch.shapes.length >= SKETCH_MAX_SHAPES;
    sketch.shapes.forEach((shape, index) => sketchRowWrite(shape, cards[index]));
  };
  return { field, row: element, write };
}

/**
 * Writes a shape's values into its card's inputs, leaving fields being typed in
 * alone.
 *
 * @param shape Shape.
 * @param card Card inputs.
 */
function sketchRowWrite(shape: SketchShape, card: SketchRowCard | undefined): void {
  if (!card) return;
  const values = shape as unknown as Record<string, unknown>;
  for (const [key, input] of card.numbers) {
    const value = values[key];
    if (typeof value === 'number' && !input.isTyping()) input.setNumber(value, 0);
  }
  if (!('points' in shape)) return;
  shape.points.forEach((point, index) => {
    const [u, v] = card.points[index] ?? [];
    if (u && !u.isTyping()) u.setNumber(point.u, 0);
    if (v && !v.isTyping()) v.setNumber(point.v, 0);
  });
}

/**
 * Builds one shape card.
 *
 * @param shape Shape.
 * @param index Shape index.
 * @param actions Edit and remove callbacks.
 * @returns Card element and inputs.
 */
function sketchRowCard(
  shape: SketchShape,
  index: number,
  actions: { edit: (shape: SketchShape) => void; remove: () => void },
): { element: HTMLElement; inputs: SketchRowCard } {
  const element = document.createElement('div');
  Object.assign(element.style, { margin: '0 8px 6px', padding: '4px 0 2px', borderRadius: '6px' });
  modifierStackUiPaint(element, 'card');
  const header = document.createElement('div');
  Object.assign(header.style, { display: 'flex', alignItems: 'center', padding: '0 4px 4px 8px' });
  const title = modifierStackUiText('span', `${index + 1}. ${SKETCH_ROW_TYPE_LABELS[shape.type]}`);
  title.style.flex = '1';
  header.append(
    title,
    modifierStackUiIconButton(SKETCH_ROW_REMOVE_GLYPH, `Remove Shape ${index + 1}`, () => actions.remove()),
  );
  element.appendChild(header);
  const numbers = new Map<string, InputNumeric>();
  for (const [key, label, step] of SKETCH_ROW_NUMBERS[shape.type]) {
    const input = inputNumericCreateUvField(step, `Shape ${index + 1} ${label}`);
    input.bindCommit(() => {
      const value = input.parseNumberOrNull();
      if (value !== null && Number.isFinite(value)) actions.edit({ ...shape, [key]: value } as SketchShape);
    });
    numbers.set(key, input);
    element.appendChild(modifierStackUiRow(label, input.getElement()));
  }
  const points = 'points' in shape ? sketchRowPoints(shape, index, actions, element) : [];
  return { element, inputs: { numbers, points } };
}

/**
 * Adds the point rows of an outline or line, and its Add Point button.
 *
 * @param shape Outline or line.
 * @param index Shape index.
 * @param actions Edit callback.
 * @param element Card element.
 * @returns U and V inputs per point.
 */
function sketchRowPoints(
  shape: Extract<SketchShape, { points: SketchPoint[] }>,
  index: number,
  actions: { edit: (shape: SketchShape) => void },
  element: HTMLElement,
): InputNumeric[][] {
  const least = shape.type === 'polygon' ? 3 : 2;
  const inputs = shape.points.map((_, at) => {
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '3px', padding: '0 4px 3px 8px' });
    const number = modifierStackUiText('span', String(at + 1), true);
    Object.assign(number.style, { width: '14px', textAlign: 'right', flexShrink: '0' });
    row.appendChild(number);
    const pair = (['u', 'v'] as const).map((axis) => {
      const input = inputNumericCreateUvField(0.25, `Shape ${index + 1} Point ${at + 1} ${axis.toUpperCase()}`);
      input.bindCommit(() => {
        const value = input.parseNumberOrNull();
        if (value === null || !Number.isFinite(value)) return;
        actions.edit({
          ...shape,
          points: shape.points.map((point, k) => (k === at ? { ...point, [axis]: value } : point)),
        });
      });
      Object.assign(input.getElement().style, { flex: '1', minWidth: '0', width: 'auto', maxWidth: 'none' });
      row.appendChild(input.getElement());
      return input;
    });
    const remove = modifierStackUiIconButton(SKETCH_ROW_REMOVE_GLYPH, `Remove Shape ${index + 1} Point ${at + 1}`, () =>
      actions.edit({ ...shape, points: shape.points.filter((_, k) => k !== at) }),
    );
    remove.disabled = shape.points.length <= least;
    remove.style.opacity = remove.disabled ? '0.35' : '1';
    row.appendChild(remove);
    element.appendChild(row);
    return pair;
  });
  const add = modifierStackUiTextButton('Add Point', `Add Point to Shape ${index + 1}`, () => {
    const last = shape.points[shape.points.length - 1]!;
    const before = shape.points[shape.points.length - 2] ?? last;
    const step =
      Math.hypot(last.u - before.u, last.v - before.v) > 1e-6
        ? { u: last.u - before.u, v: last.v - before.v }
        : { u: 1, v: 0 };
    actions.edit({ ...shape, points: [...shape.points, { u: last.u + step.u, v: last.v + step.v }] });
  });
  add.disabled = shape.points.length >= SKETCH_MAX_POINTS;
  const holder = document.createElement('div');
  Object.assign(holder.style, { display: 'flex', padding: '2px 8px 4px' });
  holder.appendChild(add);
  element.appendChild(holder);
  return inputs;
}
