import { describe, it, expect, beforeEach } from 'vitest';
import { ViewportToolChromeHost } from '@/tools/chrome/host/viewport_tool_chrome_host.js';
import { EditorToolId } from '@/types/editor_tool_id.js';
import { TransformMode } from '@/types/transform_mode.js';
import { EditorInteractionMode } from '@/types/editor_interaction_mode.js';
import { FloatingPanelStack } from '@/ui/floating_panel/panel_floating_stack.js';

/**
 * Builds default chrome handlers for host tests.
 *
 * @param onSelectTool Optional select-tool spy.
 * @param onInteractionMode Optional interaction-mode spy.
 * @returns Complete handler bag.
 */
function createHostHandlers(
  onSelectTool: (id: EditorToolId) => void = () => undefined,
  onInteractionMode: (mode: EditorInteractionMode) => void = () => undefined,
) {
  return {
    onSelectTool,
    onTransformMode: () => undefined,
    onFlipClipPlane: () => undefined,
    onCommitClip: () => undefined,
    onCommitSplit: () => undefined,
    onOpenUvEditor: () => undefined,
    onExtrudeFaces: () => undefined,
    onGridReset: () => undefined,
    onGridAlignToFace: () => undefined,
    onGridAlignAxis: () => undefined,
    onGridOriginVertex: () => undefined,
    onCameraReset: () => undefined,
    onCameraAlignToFace: () => undefined,
    onInteractionMode,
    onComponentMode: () => undefined,
  };
}

describe('ViewportToolChromeHost', () => {
  let container: HTMLElement;
  let selectToolId: EditorToolId | null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    selectToolId = null;
  });

  it('creates rail and top options bar, both hidden until hover-owned', () => {
    const host = new ViewportToolChromeHost(
      container,
      createHostHandlers((id) => {
        selectToolId = id;
      }),
      () => undefined,
    );
    const rail = container.querySelector('.editor-viewport-tool-rail') as HTMLElement;
    const options = container.querySelector('.editor-viewport-tool-options-bar') as HTMLElement;
    expect(rail).not.toBeNull();
    expect(options).not.toBeNull();
    expect(rail.style.display).toBe('none');
    expect(options.style.display).toBe('none');
    host.setHoverOwned(true);
    expect(rail.style.display).toBe('flex');
    expect(options.style.display).toBe('flex');
    host.setActiveTool(EditorToolId.FACE);
    host.setActiveTransformMode(TransformMode.TRANSLATE);
    host.setClipActionsEnabled(true);
    host.dispose();
  });

  it('registers chrome as pointer-block surfaces for the input bridge', () => {
    const host = new ViewportToolChromeHost(container, createHostHandlers(), () => undefined);
    const rail = container.querySelector('.editor-viewport-tool-rail') as HTMLElement;
    const options = container.querySelector('.editor-viewport-tool-options-bar') as HTMLElement;
    const faceButton = Array.from(rail.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-label') === 'Face Select',
    ) as HTMLButtonElement;
    expect(FloatingPanelStack.containsEventTarget(faceButton)).toBe(true);
    expect(FloatingPanelStack.containsEventTarget(options)).toBe(true);
    host.dispose();
    expect(FloatingPanelStack.containsEventTarget(faceButton)).toBe(false);
  });

  it('invokes select tool from rail click', () => {
    const host = new ViewportToolChromeHost(
      container,
      createHostHandlers((id) => {
        selectToolId = id;
      }),
      () => undefined,
    );
    const faceButton = Array.from(container.querySelectorAll('.editor-viewport-tool-rail button')).find(
      (button) => button.getAttribute('aria-label') === 'Face Select',
    ) as HTMLButtonElement;
    faceButton.click();
    expect(selectToolId).toBe(EditorToolId.FACE);
    host.dispose();
  });

  it('invokes interaction mode from the Object Mode / Edit Mode dropdown', () => {
    let selectedMode: EditorInteractionMode | null = null;
    const host = new ViewportToolChromeHost(
      container,
      createHostHandlers(
        () => undefined,
        (mode) => {
          selectedMode = mode;
        },
      ),
      () => undefined,
    );
    host.setHoverOwned(true);
    const modeButtons = Array.from(
      container.querySelectorAll('.editor-viewport-tool-options-bar button'),
    ) as HTMLButtonElement[];
    const trigger = modeButtons.find(
      (button) => button.getAttribute('aria-haspopup') === 'menu' && (button.title ?? '').includes('Object Mode'),
    );
    expect(trigger).toBeDefined();
    Object.defineProperty(trigger!, 'getBoundingClientRect', {
      value: () => ({ left: 10, bottom: 40, top: 16, right: 110, width: 100, height: 24 }),
    });
    trigger!.click();
    const menus = Array.from(document.body.querySelectorAll('.editor-toolbar-dropdown-menu')) as HTMLElement[];
    const menu = menus.find((entry) => entry.parentElement === document.body && entry.style.display !== 'none');
    expect(menu).toBeDefined();
    const editRow = Array.from(menu!.querySelectorAll('button')).find((button) =>
      (button.textContent ?? '').includes('Edit Mode'),
    ) as HTMLButtonElement;
    expect(editRow).toBeDefined();
    editRow.click();
    expect(selectedMode).toBe(EditorInteractionMode.EDIT_MODE);
    host.dispose();
  });

  it('hides Face Select and Clip rail buttons in Edit Mode', () => {
    const host = new ViewportToolChromeHost(container, createHostHandlers(), () => undefined);
    host.setHoverOwned(true);
    const rail = container.querySelector('.editor-viewport-tool-rail') as HTMLElement;
    const faceButton = Array.from(rail.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-label') === 'Face Select',
    ) as HTMLButtonElement;
    const clipButton = Array.from(rail.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-label') === 'Clip Plane',
    ) as HTMLButtonElement;
    expect(faceButton.style.display).not.toBe('none');
    expect(clipButton.style.display).not.toBe('none');
    host.setActiveInteractionMode(EditorInteractionMode.EDIT_MODE);
    expect(faceButton.style.display).toBe('none');
    expect(clipButton.style.display).toBe('none');
    host.setActiveInteractionMode(EditorInteractionMode.OBJECT_MODE);
    expect(faceButton.style.display).not.toBe('none');
    expect(clipButton.style.display).not.toBe('none');
    host.dispose();
  });

  it('hides Bounds transform button in Edit Mode options', () => {
    const host = new ViewportToolChromeHost(container, createHostHandlers(), () => undefined);
    host.setHoverOwned(true);
    host.setActiveInteractionMode(EditorInteractionMode.EDIT_MODE);
    host.setActiveTool(EditorToolId.OBJECT);
    const options = container.querySelector('.editor-viewport-tool-options-bar') as HTMLElement;
    const boundsButton = Array.from(options.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-label') === 'Bounds',
    );
    const moveButton = Array.from(options.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-label') === 'Move',
    );
    expect(boundsButton).toBeUndefined();
    expect(moveButton).toBeDefined();
    host.dispose();
  });

  it('shows Object menu only in Object Mode', () => {
    const host = new ViewportToolChromeHost(container, createHostHandlers(), () => undefined);
    host.setHoverOwned(true);
    host.setActiveInteractionMode(EditorInteractionMode.OBJECT_MODE);
    host.setActiveTool(EditorToolId.OBJECT);
    const options = container.querySelector('.editor-viewport-tool-options-bar') as HTMLElement;
    const objectButton = Array.from(options.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-label') === 'Object',
    );
    expect(objectButton).toBeDefined();
    host.setActiveInteractionMode(EditorInteractionMode.EDIT_MODE);
    const objectButtonInEdit = Array.from(options.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-label') === 'Object',
    );
    expect(objectButtonInEdit).toBeUndefined();
    host.dispose();
  });

  it('shows Align menu only in Object Mode', () => {
    const host = new ViewportToolChromeHost(container, createHostHandlers(), () => undefined);
    host.setHoverOwned(true);
    host.setActiveInteractionMode(EditorInteractionMode.OBJECT_MODE);
    host.setActiveTool(EditorToolId.OBJECT);
    const options = container.querySelector('.editor-viewport-tool-options-bar') as HTMLElement;
    expect(findOptionsButton(options, 'Align')).toBeDefined();
    host.setActiveInteractionMode(EditorInteractionMode.EDIT_MODE);
    expect(findOptionsButton(options, 'Align')).toBeUndefined();
    expect(findOptionsButton(options, 'Face Align')).toBeUndefined();
    expect(findOptionsButton(options, 'Hinge')).toBeUndefined();
    expect(findOptionsButton(options, 'Seat')).toBeUndefined();
    host.dispose();
  });
});

/**
 * Finds an options-bar button by its accessible label.
 *
 * @param options Options bar element.
 * @param label Accessible label.
 * @returns Button, or undefined when it is not mounted.
 */
function findOptionsButton(options: HTMLElement, label: string): HTMLButtonElement | undefined {
  return Array.from(options.querySelectorAll('button')).find((button) => button.getAttribute('aria-label') === label);
}
