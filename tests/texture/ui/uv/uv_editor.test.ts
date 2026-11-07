import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UV_LAYOUT, UV_PANEL_WIDTH_PX, UvEditor } from '@/texture/ui/uv/uv_editor.js';
import type { FaceTextureAlign, FaceTextureMappingTrs } from '@/texture/uv/face_texture_mapping.js';
import type { UvRelativeTrsOp } from '@/texture/uv/uv_trs_ops.js';

describe('UvEditor', () => {
  let host: HTMLElement;
  let onAlign: ReturnType<typeof vi.fn<(align: FaceTextureAlign) => void>>;
  let onApplyPartialTrs: ReturnType<typeof vi.fn<(fields: Partial<FaceTextureMappingTrs>) => void>>;
  let onRelativeOp: ReturnType<typeof vi.fn<(op: UvRelativeTrsOp) => void>>;
  let onReset: ReturnType<typeof vi.fn<() => void>>;
  let editor: UvEditor;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    onAlign = vi.fn<(align: FaceTextureAlign) => void>();
    onApplyPartialTrs = vi.fn<(fields: Partial<FaceTextureMappingTrs>) => void>();
    onRelativeOp = vi.fn<(op: UvRelativeTrsOp) => void>();
    onReset = vi.fn<() => void>();
    editor = new UvEditor(host, {
      onAlign,
      onApplyPartialTrs,
      onRelativeOp,
      onReset,
    });
  });

  afterEach(() => {
    editor.dispose();
    if (host.parentNode) host.parentNode.removeChild(host);
  });

  it('should start hidden', () => {
    expect(editor.isOpen()).toBe(false);
    expect(editor.isMountedInHost()).toBe(false);
    expect(host.contains(editor.getRootElement())).toBe(false);
  });

  it('should open and close without a pin control', () => {
    editor.show();
    expect(editor.isOpen()).toBe(true);
    expect(host.contains(editor.getRootElement())).toBe(true);
    expect(host.textContent).not.toContain('Pin');
    expect(host.textContent).toContain('UV Editor');
    editor.hide(true);
    expect(editor.isOpen()).toBe(false);
    expect(host.contains(editor.getRootElement())).toBe(false);
  });

  it('should toggle visibility', () => {
    editor.toggle();
    expect(editor.isOpen()).toBe(true);
    editor.toggle();
    expect(editor.isOpen()).toBe(false);
  });

  it('should update status text from field state', () => {
    editor.show();
    editor.setFromFieldState({
      scaleU: 1,
      scaleV: 1,
      offsetU: 0,
      offsetV: 0,
      rotationDeg: 0,
      align: 'auto',
      targetCount: 2,
    });
    expect(host.textContent).toContain('2 face region(s)');
  });

  it('should report no surfaces when target count is zero', () => {
    editor.show();
    editor.setFromFieldState({
      scaleU: null,
      scaleV: null,
      offsetU: null,
      offsetV: null,
      rotationDeg: null,
      align: null,
      targetCount: 0,
    });
    expect(host.textContent).toContain('No surfaces selected');
  });

  it('should show mixed dashes and keep nudge buttons for multi-select', () => {
    editor.show();
    editor.setFromFieldState({
      scaleU: null,
      scaleV: 1,
      offsetU: null,
      offsetV: 0,
      rotationDeg: null,
      align: null,
      targetCount: 3,
    });
    const inputs = Array.from(host.querySelectorAll('input')) as HTMLInputElement[];
    expect(inputs.some((input) => input.value === '—')).toBe(true);
    expect(host.textContent).toContain('×2');
    expect(host.textContent).toContain('½');
    expect(host.textContent).toContain('−¼');
    expect(host.textContent).toContain('+¼');
    expect(host.textContent).toContain('−90');
    expect(host.textContent).toContain('+90');
  });

  it('should fire relative ops from nudge buttons even when fields are mixed', () => {
    editor.show();
    editor.setFromFieldState({
      scaleU: null,
      scaleV: null,
      offsetU: null,
      offsetV: null,
      rotationDeg: null,
      align: null,
      targetCount: 2,
    });
    const doubleButton = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === '×2');
    expect(doubleButton).toBeDefined();
    doubleButton!.click();
    expect(onRelativeOp).toHaveBeenCalledWith({ kind: 'multiplyScale', axis: 'u', factor: 2 });
    const rotateButton = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === '+90');
    rotateButton!.click();
    expect(onRelativeOp).toHaveBeenCalledWith({ kind: 'addRotation', degrees: 90 });
  });

  it('should apply a typed field on change while leaving mixed axes alone', () => {
    editor.show();
    editor.setFromFieldState({
      scaleU: null,
      scaleV: null,
      offsetU: null,
      offsetV: null,
      rotationDeg: null,
      align: null,
      targetCount: 2,
    });
    const inputs = Array.from(host.querySelectorAll('input')) as HTMLInputElement[];
    const scaleU = inputs[0]!;
    scaleU.value = '2';
    scaleU.dispatchEvent(new Event('change'));
    expect(onApplyPartialTrs).toHaveBeenCalledWith({ scaleU: 2 });
  });

  it('should evaluate math expressions on UV field submit', () => {
    editor.show();
    editor.setFromFieldState({
      scaleU: null,
      scaleV: null,
      offsetU: null,
      offsetV: null,
      rotationDeg: null,
      align: null,
      targetCount: 2,
    });
    const inputs = Array.from(host.querySelectorAll('input')) as HTMLInputElement[];
    const scaleU = inputs[0]!;
    scaleU.value = '1+1';
    scaleU.dispatchEvent(new Event('change'));
    expect(onApplyPartialTrs).toHaveBeenCalledWith({ scaleU: 2 });
    onApplyPartialTrs.mockClear();
    editor.setFromFieldState({
      scaleU: null,
      scaleV: null,
      offsetU: null,
      offsetV: null,
      rotationDeg: null,
      align: null,
      targetCount: 2,
    });
    const rotation = inputs[4]!;
    rotation.value = '45*2';
    rotation.dispatchEvent(new Event('change'));
    expect(onApplyPartialTrs).toHaveBeenCalledWith({ rotationDeg: 90 });
  });

  it('should open at the bottom-left of the default anchor element', () => {
    const anchor = document.createElement('div');
    document.body.appendChild(anchor);
    Object.defineProperty(anchor, 'getBoundingClientRect', {
      value: () => ({
        left: 400,
        top: 300,
        right: 800,
        bottom: 600,
        width: 400,
        height: 300,
        x: 400,
        y: 300,
        toJSON: () => ({}),
      }),
    });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
    editor.setDefaultAnchor(anchor);
    editor.show();
    const panel = host.querySelector('div') as HTMLElement;
    const paddingPx = 8;
    const panelHeight = parseFloat(panel.style.height) || panel.getBoundingClientRect().height || 200;
    expect(panel.style.left).toBe(`${400 + paddingPx}px`);
    expect(panel.style.top).toBe(`${600 - panelHeight - paddingPx}px`);
    expect(panel.style.bottom).toBe('auto');
    expect(panel.style.right).toBe('auto');
    document.body.removeChild(anchor);
  });

  it('should keep the compact 148px window with 30px control cells', () => {
    editor.show();
    const panel = editor.getRootElement();
    expect(UV_PANEL_WIDTH_PX).toBe(148);
    expect(panel.style.width).toBe(`${UV_PANEL_WIDTH_PX}px`);
    const controls = uvEditorControlButtons(panel);
    expect(controls.length).toBe(4 + 10);
    expect(new Set(controls.map((button) => button.style.width))).toEqual(new Set(['30px']));
  });

  it('should fit the icon strip and every field row inside the panel padding and border', () => {
    editor.show();
    const panel = editor.getRootElement();
    const innerWidth = UV_PANEL_WIDTH_PX - 2 * UV_LAYOUT.panelBorderWidth - 2 * UV_LAYOUT.panelPaddingX;
    expect(uvEditorIconStripWidth(panel)).toBe(innerWidth);
    for (const row of uvEditorFieldRows(panel)) {
      expect(uvEditorGridColumnWidths(row).reduce((sum, width) => sum + width, 0) + 3 * UV_LAYOUT.rowGap).toBe(
        innerWidth,
      );
    }
  });

  it('should place the last two align icons exactly above the nudge button columns', () => {
    editor.show();
    const panel = editor.getRootElement();
    const iconStarts = uvEditorCellStarts(uvEditorIconButtons(panel).map(uvEditorPixelWidth));
    for (const row of uvEditorFieldRows(panel)) {
      const columnStarts = uvEditorCellStarts(uvEditorGridColumnWidths(row));
      expect(columnStarts.slice(2)).toEqual(iconStarts.slice(2));
      const nudges = Array.from(row.querySelectorAll('button')).map(uvEditorPixelWidth);
      expect(nudges).toEqual(uvEditorGridColumnWidths(row).slice(2));
    }
  });

  it('should size nudge labels at 10 to 11px so they fit their cells', () => {
    editor.show();
    for (const row of uvEditorFieldRows(editor.getRootElement())) {
      for (const button of Array.from(row.querySelectorAll('button'))) {
        const size = Number.parseFloat(button.style.fontSize);
        expect(size).toBeGreaterThanOrEqual(10);
        expect(size).toBeLessThanOrEqual(11);
      }
    }
  });
});

/**
 * Returns every fixed-size control button: align icons and nudge buttons.
 *
 * @param panel UV editor root.
 * @returns Control buttons.
 */
function uvEditorControlButtons(panel: HTMLElement): HTMLButtonElement[] {
  return [
    ...uvEditorIconButtons(panel),
    ...uvEditorFieldRows(panel).flatMap((row) => Array.from(row.querySelectorAll('button'))),
  ];
}

/**
 * Returns the Floor, Wall, Ceiling and Reset buttons in strip order.
 *
 * @param panel UV editor root.
 * @returns Align and reset buttons.
 */
function uvEditorIconButtons(panel: HTMLElement): HTMLButtonElement[] {
  return ['Floor', 'Wall', 'Ceiling', 'Reset'].map((title) => {
    const button = panel.querySelector<HTMLButtonElement>(`button[title="${title}"]`);
    if (button === null) throw new Error(`${title} button missing`);
    return button;
  });
}

/**
 * Returns the label, field and nudge rows laid out as a grid.
 *
 * @param panel UV editor root.
 * @returns Field rows.
 */
function uvEditorFieldRows(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>('div')).filter((row) => row.style.display === 'grid');
}

/**
 * Returns the width the icon strip occupies: its cells and the gaps between.
 *
 * @param panel UV editor root.
 * @returns Strip width in pixels.
 */
function uvEditorIconStripWidth(panel: HTMLElement): number {
  const widths = uvEditorIconButtons(panel).map(uvEditorPixelWidth);
  return widths.reduce((sum, width) => sum + width, 0) + (widths.length - 1) * UV_LAYOUT.rowGap;
}

/**
 * Parses a grid row's fixed column widths.
 *
 * @param row Field row.
 * @returns Column widths in pixels.
 */
function uvEditorGridColumnWidths(row: HTMLElement): number[] {
  return row.style.gridTemplateColumns.split(' ').map((column) => Number.parseFloat(column));
}

/**
 * Returns where each cell starts when cells are packed with the row gap.
 *
 * @param widths Cell widths in order.
 * @returns Start offsets in pixels.
 */
function uvEditorCellStarts(widths: readonly number[]): number[] {
  const starts: number[] = [];
  let offset = 0;
  for (const width of widths) {
    starts.push(offset);
    offset += width + UV_LAYOUT.rowGap;
  }
  return starts;
}

/**
 * Reads a button's fixed inline width.
 *
 * @param button Control button.
 * @returns Width in pixels.
 */
function uvEditorPixelWidth(button: HTMLElement): number {
  return Number.parseFloat(button.style.width);
}
