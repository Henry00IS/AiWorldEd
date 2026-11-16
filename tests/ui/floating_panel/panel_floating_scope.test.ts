import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ManagerInput } from '@/input/manager_input.js';
import { HandlerKeyboardShortcut } from '@/input/handler_keyboard_shortcut.js';
import { clipboardEventsListen } from '@/clipboard/clipboard_event_target.js';
import type { PanelFloating } from '@/ui/floating_panel/panel_floating.js';
import { TextureBrowser } from '@/texture/ui/browser/texture_browser.js';
import { UvEditor } from '@/texture/ui/uv/uv_editor.js';
import { DialogAbout } from '@/ui/about/dialog_about.js';
import { panelFloatingScopeMark } from '@/ui/floating_panel/panel_floating_scope.js';
import { FloatingPanelStack } from '@/ui/floating_panel/panel_floating_stack.js';
import * as fetcher from '@/ui/about/about_contributor_fetcher.js';

/** Scene-side shortcut and clipboard spies, wired like the editor wires them. */
interface SceneSpies {
  deleted: ReturnType<typeof vi.fn<() => void>>;
  duplicated: ReturnType<typeof vi.fn<() => void>>;
  undone: ReturnType<typeof vi.fn<() => void>>;
  copied: ReturnType<typeof vi.fn<() => void>>;
  pasted: ReturnType<typeof vi.fn<() => void>>;
}

/**
 * Presses a key on an element, the way the browser sends it to the focused
 * element.
 *
 * @param target Focused element.
 * @param init Key event options.
 */
function press(target: Element, init: KeyboardEventInit): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
}

/**
 * Sends a native copy or paste from an element.
 *
 * @param target Focused element.
 * @param type Copy or paste.
 */
function clip(target: Element, type: 'copy' | 'paste'): void {
  target.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
}

/**
 * Clicks an element: pointer down, as the window and the viewport see it.
 *
 * @param target Clicked element.
 */
function click(target: Element): void {
  target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
}

/**
 * Presses every scene shortcut and clipboard key on an element.
 *
 * @param target Focused element.
 */
function pressAll(target: Element): void {
  press(target, { code: 'Delete', key: 'Delete' });
  press(target, { code: 'KeyD', key: 'd', ctrlKey: true });
  press(target, { code: 'KeyZ', key: 'z', ctrlKey: true });
  clip(target, 'copy');
  clip(target, 'paste');
}

describe('floating window keyboard scope', () => {
  let host: HTMLElement;
  let canvas: HTMLCanvasElement;
  let input: ManagerInput;
  let handler: HandlerKeyboardShortcut;
  let stopClipboard: () => void;
  let spies: SceneSpies;
  let windows: PanelFloating[];

  beforeEach(() => {
    vi.spyOn(fetcher, 'fetchGitHubContributors').mockResolvedValue([]);
    host = document.createElement('div');
    canvas = document.createElement('canvas');
    document.body.append(canvas, host);
    input = new ManagerInput();
    handler = new HandlerKeyboardShortcut(input);
    handler.register();
    spies = {
      deleted: vi.fn<() => void>(),
      duplicated: vi.fn<() => void>(),
      undone: vi.fn<() => void>(),
      copied: vi.fn<() => void>(),
      pasted: vi.fn<() => void>(),
    };
    handler.setOnDeleteSelected(spies.deleted);
    handler.setOnDuplicateSelected(spies.duplicated);
    handler.setOnUndo(spies.undone);
    stopClipboard = clipboardEventsListen(document, {
      copy: () => (spies.copied(), true),
      paste: () => (spies.pasted(), true),
    });
    windows = [];
  });

  afterEach(() => {
    for (const panel of windows) panel.dispose();
    stopClipboard();
    handler.unregister();
    input.dispose();
    host.remove();
    canvas.remove();
    vi.restoreAllMocks();
  });

  const kinds: [string, (parent: HTMLElement) => PanelFloating][] = [
    ['Texture Browser', (parent) => new TextureBrowser(parent, { onOpenProject: vi.fn(), onSelectTexture: vi.fn() })],
    [
      'UV Editor',
      (parent) =>
        new UvEditor(parent, { onAlign: vi.fn(), onApplyPartialTrs: vi.fn(), onRelativeOp: vi.fn(), onReset: vi.fn() }),
    ],
    ['About dialog', (parent) => new DialogAbout(parent)],
  ];

  it.each(kinds)(
    'keeps the shortcuts pressed inside the %s away from the scene, but undo where it changes the scene',
    (name, make) => {
      const panel = make(host);
      windows.push(panel);
      panel.show();
      const root = panel.getRootElement();
      click(root);
      expect(root.contains(document.activeElement)).toBe(true);
      pressAll(document.activeElement ?? root);
      expect(spies.deleted).not.toHaveBeenCalled();
      expect(spies.duplicated).not.toHaveBeenCalled();
      expect(spies.undone).toHaveBeenCalledTimes(name === 'About dialog' ? 0 : 1);
      expect(spies.copied).not.toHaveBeenCalled();
      expect(spies.pasted).not.toHaveBeenCalled();
    },
  );

  it.each(kinds)('gives the keys back to the scene once a viewport is clicked after the %s', (_name, make) => {
    const panel = make(host);
    windows.push(panel);
    panel.show();
    click(panel.getRootElement());
    click(canvas);
    expect(panel.getRootElement().contains(document.activeElement)).toBe(false);
    pressAll(document.activeElement ?? document.body);
    expect(spies.deleted).toHaveBeenCalledOnce();
    expect(spies.duplicated).toHaveBeenCalledOnce();
    expect(spies.undone).toHaveBeenCalledOnce();
    expect(spies.copied).toHaveBeenCalledOnce();
    expect(spies.pasted).toHaveBeenCalledOnce();
  });

  it('keeps keys inside a popup a window hangs on the page, outside its own frame', async () => {
    const panel = kinds[0]?.[1](host);
    if (!panel) throw new Error('Expected a window');
    windows.push(panel);
    panel.show();
    const popup = document.createElement('div');
    panelFloatingScopeMark(popup);
    const item = document.createElement('button');
    popup.append(item);
    document.body.append(popup);
    click(panel.getRootElement());
    click(item);
    item.focus();
    pressAll(item);
    popup.remove();
    expect(spies.deleted).not.toHaveBeenCalled();
    expect(spies.copied).not.toHaveBeenCalled();
  });

  it('counts a popup a window hangs on the page as part of the window, so viewports do not take the click', () => {
    const popup = document.createElement('div');
    const row = document.createElement('span');
    popup.append(row);
    document.body.append(popup);
    expect(FloatingPanelStack.containsEventTarget(row)).toBe(false);
    panelFloatingScopeMark(popup);
    expect(FloatingPanelStack.containsEventTarget(row)).toBe(true);
    popup.remove();
  });
});
