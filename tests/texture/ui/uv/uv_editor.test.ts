import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UvEditor } from '@/texture/ui/uv/uv_editor.js';
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

  it('should use a compact fixed panel width with aligned control columns', () => {
    editor.show();
    const panel = host.firstElementChild as HTMLElement;
    // 8 + (4*34+3*4) + 8 + 2 borders = 166
    expect(panel.style.width).toBe('166px');
    const nudgeButtons = Array.from(panel.querySelectorAll('button')).filter((button) => {
      const text = button.textContent ?? '';
      return text === '×2' || text === '½' || text === '−90' || text === '+90';
    }) as HTMLButtonElement[];
    expect(nudgeButtons.length).toBeGreaterThanOrEqual(4);
    const widths = new Set(nudgeButtons.map((button) => button.style.width));
    expect(widths.size).toBe(1);
    expect(widths.has('34px')).toBe(true);
    const iconButtons = Array.from(panel.querySelectorAll('button')).filter((button) =>
      ['Floor', 'Wall', 'Ceiling', 'Reset'].includes(button.getAttribute('aria-label') ?? ''),
    ) as HTMLButtonElement[];
    expect(iconButtons).toHaveLength(4);
    for (const button of iconButtons) {
      expect(button.style.width).toBe('34px');
      expect(button.style.maxWidth).toBe('34px');
      expect(button.style.overflow).toBe('hidden');
    }
  });
});
