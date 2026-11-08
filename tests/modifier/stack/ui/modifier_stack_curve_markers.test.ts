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
  const rows = new ModifierStackFieldRows(column.fields, (key, value) => {
    commits.push([key, value]);
    parameters = { ...parameters, [key]: value };
    rows.update(parameters);
  });
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
    editor.session.undo();
    expect(markers()).toBeUndefined();
    expect(button('top').getAttribute('aria-pressed')).toBe('false');
  });
});
