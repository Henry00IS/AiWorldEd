import { CURVE_UI_STRIP_HEIGHT_PX } from '@/curve/ui/curve_ui_style.js';
import { afterEach, describe, expect, it } from 'vitest';
import { curveDecode, curveEncode } from '@/curve/model/curve_codec.js';
import { curveFromPolyline } from '@/curve/model/curve_model.js';
import { curveEditorActiveFor, curveEditorCloseActive } from '@/curve/ui/curve_editor.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import type { ModifierStackValue } from '@/modifier/stack/modifier_stack_types.js';
import { ModifierStackFieldRows } from '@/modifier/stack/ui/modifier_stack_field_rows.js';

/**
 * Renders the Column card rows over a stored profile, writing commits back like
 * the scene does.
 *
 * @returns Rows, the stored parameters and the commits.
 */
function columnRows() {
  const column = modifierStackKindFind('column');
  if (!column) throw new Error('column kind missing');
  const commits: [string, ModifierStackValue][] = [];
  let parameters: Record<string, unknown> = {
    ...column.normalizeParameters(column.createParameters()),
    profile: curveEncode(
      curveFromPolyline([
        [0, 0.8],
        [1, 0.6],
      ]),
    ),
  };
  const undone: Record<string, unknown>[] = [];
  const history = {
    undo: () => {
      const previous = undone.pop();
      if (previous) rows.update((parameters = previous));
    },
    redo: () => undefined,
    state: () => ({ undo: undone.length > 0, redo: false }),
  };
  const rows = new ModifierStackFieldRows(
    column.fields,
    (key, value) => {
      commits.push([key, value]);
      undone.push(parameters);
      parameters = { ...parameters, [key]: value };
      rows.update(parameters);
    },
    () => [],
    { history },
  );
  document.body.appendChild(rows.getElement());
  rows.update(parameters);
  const button = (side: 'bottom' | 'top'): HTMLButtonElement => {
    const found = rows.getElement().querySelector<HTMLButtonElement>(`button[data-curve-marker="${side}"]`);
    if (!found) throw new Error(`no ${side} button`);
    return found;
  };
  const markers = () => curveDecode(parameters['profile'])?.markers;
  return { rows, commits, button, markers, set: (next: Record<string, unknown>) => rows.update((parameters = next)) };
}

describe('Column inspector Base and Top marker toggles', () => {
  afterEach(() => {
    curveEditorCloseActive();
    document.body.innerHTML = '';
  });

  it('switches markers like the editor toggles: one commit each, remembered places, state follows the value', () => {
    const { commits, button, markers, set } = columnRows();
    const base = button('bottom');
    const top = button('top');
    expect(base.textContent).toBe('Base');
    expect(top.textContent).toBe('Top');
    expect(base.title).toMatch(/Base marker/);
    expect(base.getAttribute('aria-pressed')).toBe('false');
    base.click();
    expect(commits).toHaveLength(1);
    expect(markers()).toEqual({ bottom: 0.2 });
    expect(base.getAttribute('aria-pressed')).toBe('true');
    top.click();
    expect(markers()).toEqual({ bottom: 0.2, top: 0.8 });
    const before = commits.at(-1)?.[1];
    const moved = curveDecode(before);
    if (!moved) throw new Error('no curve');
    set({ profile: curveEncode({ ...moved, markers: { bottom: 0.35, top: 0.8 } }) });
    base.click();
    expect(markers()).toEqual({ top: 0.8, parked: { bottom: 0.35 } });
    expect(base.getAttribute('aria-pressed')).toBe('false');
    base.click();
    expect(markers()).toEqual({ bottom: 0.35, top: 0.8 });
    set({ profile: before });
    expect(base.getAttribute('aria-pressed')).toBe('true');
    set({ profile: commits[0]?.[1] });
    expect(top.getAttribute('aria-pressed')).toBe('false');
  });

  it('puts Base and Top side by side in a full-width row under the preview, at Add modifier height', () => {
    const { button } = columnRows();
    const base = button('bottom');
    const top = button('top');
    const row = base.parentElement;
    expect(top.parentElement).toBe(row);
    const field = row?.parentElement;
    expect(field?.style.flexDirection).toBe('column');
    expect(field?.lastElementChild).toBe(row);
    const strip = field?.firstElementChild as HTMLElement | null;
    expect(strip?.getAttribute('role')).toBe('button');
    // The preview keeps the plain strip height instead of growing in the column.
    expect(strip?.style.height).toBe(`${CURVE_UI_STRIP_HEIGHT_PX}px`);
    expect(CURVE_UI_STRIP_HEIGHT_PX).toBe(48);
    expect(strip?.style.flexGrow).toBe('0');
    for (const each of [base, top]) {
      expect(each.style.flex).toMatch(/^1/);
      expect(each.style.height).toBe('26px');
    }
  });

  it('drives an open curve editor: it stays open, records an undo step and shows the change', () => {
    const { rows, button, markers } = columnRows();
    const strip = rows.getElement().querySelector<HTMLElement>('[role="button"]');
    if (!strip) throw new Error('no strip');
    strip.click();
    const editor = curveEditorActiveFor(strip);
    if (!editor) throw new Error('editor did not open');
    button('top').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    button('top').click();
    expect(curveEditorActiveFor(strip)).toBe(editor);
    expect(editor.session.curve.markers).toEqual({ top: 0.8 });
    expect(markers()).toEqual({ top: 0.8 });
    const editorTop = document.querySelector<HTMLButtonElement>('[data-curve-editor] button[data-curve-marker="top"]');
    expect(editorTop?.getAttribute('aria-pressed')).toBe('true');
    expect(button('top').getAttribute('aria-pressed')).toBe('true');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true }));
    expect(markers()).toBeUndefined();
    expect(button('top').getAttribute('aria-pressed')).toBe('false');
  });
});

describe('Column inspector fixed heights', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows the column height for older curves and stores an edited height in the curve as one commit', () => {
    const { rows, commits, button, markers } = columnRows();
    button('bottom').click();
    const input = rows.getElement().querySelector<HTMLInputElement>('input[aria-label="Fixed base height"]');
    if (!input) throw new Error('no base height input');
    expect(Number(input.value)).toBeCloseTo(0.5);
    commits.length = 0;
    input.value = '1.2';
    input.dispatchEvent(new Event('change'));
    expect(commits.map(([key]) => key)).toEqual(['profile']);
    expect(markers()?.heights).toEqual({ bottom: 1.2 });
    expect(Number(input.value)).toBeCloseTo(1.2);
  });
});
