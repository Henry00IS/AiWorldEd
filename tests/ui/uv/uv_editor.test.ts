import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { UvEditor } from '../../../src/ui/uv/uv_editor.js';
import type { FaceTextureAlign, FaceTextureMappingTrs } from '../../../src/texture/uv/face_texture_mapping.js';
import type { UvRelativeTrsOp } from '../../../src/texture/uv/uv_trs_ops.js';

describe('UvEditor', () => {
  let host: HTMLElement;
  let onAlign: Mock<(align: FaceTextureAlign) => void>;
  let onApplyPartialTrs: Mock<(fields: Partial<FaceTextureMappingTrs>) => void>;
  let onRelativeOp: Mock<(op: UvRelativeTrsOp) => void>;
  let onReset: Mock<() => void>;
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
  });

  it('should open and close without a pin control', () => {
    editor.show();
    expect(editor.isOpen()).toBe(true);
    expect(host.textContent).not.toContain('Pin');
    expect(host.textContent).toContain('UV Editor');
    editor.hide(true);
    expect(editor.isOpen()).toBe(false);
  });

  it('should toggle visibility', () => {
    editor.toggle();
    expect(editor.isOpen()).toBe(true);
    editor.toggle();
    expect(editor.isOpen()).toBe(false);
  });

  it('should update status text from field state', () => {
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

  it('should use a compact fixed panel width with aligned control columns', () => {
    editor.show();
    const panel = host.firstElementChild as HTMLElement;
    // 8 + (12+4+48+4+30+4+30) + 8 = 148
    expect(panel.style.width).toBe('148px');
    const nudgeButtons = Array.from(panel.querySelectorAll('button')).filter((button) => {
      const text = button.textContent ?? '';
      return text === '×2' || text === '½' || text === '−90' || text === '+90';
    }) as HTMLButtonElement[];
    expect(nudgeButtons.length).toBeGreaterThanOrEqual(4);
    const widths = new Set(nudgeButtons.map((button) => button.style.width));
    expect(widths.size).toBe(1);
    expect(widths.has('30px')).toBe(true);
  });
});
