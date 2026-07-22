import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ToolsPalette } from '../../src/ui/tools_palette.js';
import { EditorToolId } from '../../src/types/editor_tool_id.js';
import { FloatingPanelStack } from '../../src/ui/floating_panel_stack.js';
import { UvEditor } from '../../src/ui/uv_editor.js';

describe('ToolsPalette', () => {
  let host: HTMLElement;
  let onSelectTool: ReturnType<typeof vi.fn>;
  let onFlip: ReturnType<typeof vi.fn>;
  let onClip: ReturnType<typeof vi.fn>;
  let onSplit: ReturnType<typeof vi.fn>;
  let palette: ToolsPalette;

  beforeEach(() => {
    FloatingPanelStack.resetForTests();
    host = document.createElement('div');
    document.body.appendChild(host);
    onSelectTool = vi.fn();
    onFlip = vi.fn();
    onClip = vi.fn();
    onSplit = vi.fn();
    palette = new ToolsPalette(host, {
      onSelectTool,
      onFlipClipPlane: onFlip,
      onCommitClip: onClip,
      onCommitSplit: onSplit
    });
  });

  afterEach(() => {
    palette.dispose();
    if (host.parentNode) host.parentNode.removeChild(host);
  });

  it('should start hidden until shown', () => {
    expect(palette.isOpen()).toBe(false);
  });

  it('should open and close without a pin control', () => {
    palette.show();
    expect(palette.isOpen()).toBe(true);
    expect(host.textContent).not.toContain('Pin');
    palette.hide(true);
    expect(palette.isOpen()).toBe(false);
  });

  it('should open at the top-left of the default anchor under the viewport toolbar', () => {
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
        toJSON: () => ({})
      })
    });
    palette.setDefaultAnchor(anchor);
    palette.show();
    const panel = host.querySelector('div') as HTMLElement;
    expect(panel.style.left).toBe('408px');
    expect(panel.style.top).toBe(`${300 + 28 + 8}px`);
    document.body.removeChild(anchor);
  });

  it('should toggle visibility', () => {
    palette.toggle();
    expect(palette.isOpen()).toBe(true);
    palette.toggle();
    expect(palette.isOpen()).toBe(false);
  });

  it('should report tool selection when an icon is clicked', () => {
    palette.show();
    const clipButton = host.querySelector(
      'button[aria-label="Clip"]'
    ) as HTMLButtonElement;
    clipButton.click();
    expect(onSelectTool).toHaveBeenCalledWith(EditorToolId.CLIP_PLANE);
  });

  it('should only highlight one active tool at a time', () => {
    palette.setActiveTool(EditorToolId.FACE);
    expect(palette.getActiveTool()).toBe(EditorToolId.FACE);
    palette.setActiveTool(EditorToolId.CLIP_PLANE);
    expect(palette.getActiveTool()).toBe(EditorToolId.CLIP_PLANE);
  });

  it('should invoke clip context actions when enabled', () => {
    palette.show();
    palette.setClipActionsEnabled(true);
    const buttons = Array.from(host.querySelectorAll('button'));
    const flip = buttons.find((button) => button.textContent === 'Flip');
    const clip = buttons.find((button) => button.textContent === 'Clip');
    const split = buttons.find((button) => button.textContent === 'Split');
    flip?.click();
    clip?.click();
    split?.click();
    expect(onFlip).toHaveBeenCalled();
    expect(onClip).toHaveBeenCalled();
    expect(onSplit).toHaveBeenCalled();
  });

  it('should update context status text', () => {
    palette.setContextStatus('Click point 1');
    expect(host.textContent).toContain('Click point 1');
  });

  it('should bring the tools panel above the UV editor when clicked', () => {
    const uvEditor = new UvEditor(host, {
      onAlign: vi.fn(),
      onApplyMapping: vi.fn(),
      onReset: vi.fn()
    });
    palette.show();
    uvEditor.show();
    const toolsRoot = host.children[0] as HTMLElement;
    const uvEditorRoot = host.children[1] as HTMLElement;
    expect(Number(uvEditorRoot.style.zIndex)).toBeGreaterThan(
      Number(toolsRoot.style.zIndex)
    );
    toolsRoot.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(Number(toolsRoot.style.zIndex)).toBeGreaterThan(
      Number(uvEditorRoot.style.zIndex)
    );
    uvEditor.dispose();
  });
});
