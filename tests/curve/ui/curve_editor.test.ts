import { afterEach, describe, expect, it } from 'vitest';
import { curveFromPolyline, type Curve } from '@/curve/model/curve_model.js';
import { CURVE_PRESETS_ARCHITECTURE } from '@/curve/model/curve_preset_architecture.js';
import { CurveEditor, curveEditorActiveFor, curveEditorCloseActive } from '@/curve/ui/curve_editor.js';
import { CurveField } from '@/curve/ui/curve_field.js';
import { FloatingPanelStack } from '@/ui/floating_panel/panel_floating_stack.js';
import { Theme } from '@/theme.js';
import { hexToRgb } from '@/utils/utils_color.js';

/**
 * Opens an editor under a fresh anchor.
 *
 * @returns Editor, anchor and the commits it made.
 */
function openEditor() {
  const anchor = document.createElement('div');
  document.body.appendChild(anchor);
  const commits: Curve[] = [];
  const editor = CurveEditor.open({
    title: 'Profile curve',
    anchor,
    curve: curveFromPolyline([
      [0, 1],
      [1, 1],
    ]),
    presets: CURVE_PRESETS_ARCHITECTURE,
    fileName: 'profile',
    onPreview: () => undefined,
    onCommit: (curve) => commits.push(curve),
  });
  return { editor, anchor, commits };
}

/**
 * Creates a curve field in the page.
 *
 * @param commits Receives the field's commits.
 * @param editorKey Identity of the edited value.
 * @returns Field.
 */
function curveField(commits: Curve[], editorKey?: string): CurveField {
  const field = new CurveField({
    label: 'Profile',
    presets: CURVE_PRESETS_ARCHITECTURE,
    fileName: 'profile',
    onPreview: () => undefined,
    onCommit: (curve) => commits.push(curve),
    ...(editorKey ? { editorKey } : {}),
  });
  document.body.appendChild(field.getElement());
  field.setCurve(
    curveFromPolyline([
      [0, 0.2],
      [1, 0.6],
    ]),
  );
  return field;
}

/**
 * Returns the editor element of a selector.
 *
 * @param selector Selector inside the window.
 * @returns Element.
 */
function editorPart(selector: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(`[data-curve-editor] ${selector}`);
  if (!found) throw new Error(`No ${selector}`);
  return found;
}

/**
 * Finds an editor button by caption.
 *
 * @param label Caption.
 * @returns Button.
 */
function editorButton(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>('[data-curve-editor] button')].find(
    (button) => button.textContent === label,
  );
  if (!found) throw new Error(`No ${label} button`);
  return found;
}

describe('curve editor window', () => {
  afterEach(() => {
    curveEditorCloseActive();
    document.body.replaceChildren();
  });

  it('closes on Escape like a menu', () => {
    const { anchor } = openEditor();
    expect(document.querySelector('[data-curve-editor]')).not.toBeNull();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));
    expect(document.querySelector('[data-curve-editor]')).toBeNull();
    expect(curveEditorActiveFor(anchor)).toBeNull();
  });

  it('closes on a press outside but not inside or on its field', () => {
    const { anchor } = openEditor();
    anchor.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    document.querySelector('[data-curve-editor]')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(curveEditorActiveFor(anchor)).not.toBeNull();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(curveEditorActiveFor(anchor)).toBeNull();
  });

  it('closes when the selection changes and keeps only one editor open', () => {
    const first = openEditor();
    const second = openEditor();
    expect(curveEditorActiveFor(first.anchor)).toBeNull();
    expect(curveEditorActiveFor(second.anchor)).toBe(second.editor);
    curveEditorCloseActive();
    expect(document.querySelectorAll('[data-curve-editor]')).toHaveLength(0);
  });

  it('applies presets and tools as committed, locally undoable edits', () => {
    const { commits, editor } = openEditor();
    const select = document.querySelector<HTMLSelectElement>('[data-curve-editor] select');
    if (!select) throw new Error('Expected the preset menu');
    select.value = 'baluster';
    select.dispatchEvent(new Event('change'));
    expect(commits).toHaveLength(1);
    expect(editor.session.curve.points.length).toBeGreaterThan(2);
    editorButton('Flip').click();
    expect(commits).toHaveLength(2);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true }));
    expect(commits).toHaveLength(3);
    expect(editorButton('Redo').disabled).toBe(false);
  });

  it('opens from a curve field strip and reports commits to the field owner', () => {
    const commits: Curve[] = [];
    const field = new CurveField({
      label: 'Profile',
      presets: CURVE_PRESETS_ARCHITECTURE,
      fileName: 'profile',
      onPreview: () => undefined,
      onCommit: (curve) => commits.push(curve),
    });
    document.body.appendChild(field.getElement());
    field.setCurve(
      curveFromPolyline([
        [0, 0.2],
        [1, 0.6],
      ]),
    );
    field.getElement().click();
    expect(curveEditorActiveFor(field.getElement())).not.toBeNull();
    editorButton('Mirror').click();
    expect(commits).toHaveLength(1);
    expect(commits[0]?.points[0]?.y).toBeCloseTo(0.6);
    field.getElement().click();
    expect(curveEditorActiveFor(field.getElement())).toBeNull();
  });

  it('keeps presses inside away from the viewport and stays open when the app loses focus', () => {
    const { anchor } = openEditor();
    const canvas = editorPart('canvas');
    expect(FloatingPanelStack.containsEventTarget(canvas)).toBe(true);
    expect(FloatingPanelStack.containsEventTarget(editorPart('select'))).toBe(true);
    window.dispatchEvent(new Event('blur'));
    canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    editorButton('Frame').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(curveEditorActiveFor(anchor)).not.toBeNull();
    curveEditorCloseActive();
    expect(FloatingPanelStack.containsEventTarget(canvas)).toBe(false);
  });

  it('closes on Escape from a focused dropdown or field unless the control used the key', () => {
    const { anchor } = openEditor();
    const field = editorPart('input[aria-label="Curve file name"]');
    field.addEventListener('keydown', (event) => event.preventDefault(), { once: true });
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(curveEditorActiveFor(anchor)).not.toBeNull();
    editorPart('select').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(curveEditorActiveFor(anchor)).toBeNull();
  });

  it('hands the open window to a rebuilt field of the same value and keeps inside presses inside', () => {
    const first: Curve[] = [];
    const old = curveField(first, 'volume/step/profile');
    old.getElement().click();
    old.getElement().remove();
    const rebuilt: Curve[] = [];
    const field = curveField(rebuilt, 'volume/step/profile');
    editorPart('canvas').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(curveEditorActiveFor(field.getElement())).not.toBeNull();
    editorButton('Mirror').click();
    expect(first).toHaveLength(0);
    expect(rebuilt).toHaveLength(1);
    curveField([], 'volume/other/profile');
    expect(curveEditorActiveFor(field.getElement())).not.toBeNull();
  });

  it('is a standard tool window: title bar drag, status bar and resize grip', () => {
    const { editor, anchor } = openEditor();
    const root = editor.getRootElement();
    expect(root.querySelector('[aria-label="Resize panel"]')).not.toBeNull();
    expect(root.lastElementChild?.previousElementSibling?.textContent).toContain('Double-click');
    const bar = root.firstElementChild as HTMLElement;
    const left = parseFloat(root.style.left);
    bar.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 60, clientY: 30 }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 60, clientY: 30 }));
    expect(parseFloat(root.style.left)).not.toBe(left);
    expect(curveEditorActiveFor(anchor)).toBe(editor);
  });

  it('shows only the active segment type highlighted, the others as normal dark buttons', () => {
    const { editor } = openEditor();
    editor.session.select({ kind: 'segment', index: 0 });
    editorButton('Bezier').click();
    const normal = hexToRgb(Theme.buttonBackground);
    for (const [label, pressed] of [
      ['Linear', 'false'],
      ['Quadratic', 'false'],
      ['Bezier', 'true'],
    ] as const) {
      const button = editorButton(label);
      expect(button.getAttribute('aria-pressed')).toBe(pressed);
      if (pressed === 'false') expect(button.style.background).toBe(normal);
      else expect(button.style.background).not.toBe(normal);
    }
  });
});
