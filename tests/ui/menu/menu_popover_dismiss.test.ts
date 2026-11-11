import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FloatingPanelStack } from '@/ui/floating_panel/panel_floating_stack.js';
import { MenuPopoverDismiss } from '@/ui/menu/menu_popover_dismiss.js';
import {
  menuPopoverDismissProbeEscape,
  menuPopoverDismissProbePress,
  menuPopoverDismissProbeShortcutsInstall,
  menuPopoverDismissProbeViewportCreate,
} from './menu_popover_dismiss_probe.js';

describe('MenuPopoverDismiss', () => {
  let popover: HTMLElement;
  let toggle: HTMLButtonElement;
  let dismiss: MenuPopoverDismiss;
  let onDismiss: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    FloatingPanelStack.resetForTests();
    popover = document.createElement('div');
    popover.appendChild(document.createElement('button'));
    toggle = document.createElement('button');
    document.body.append(popover, toggle);
    onDismiss = vi.fn<() => void>();
    dismiss = new MenuPopoverDismiss();
    dismiss.begin({ popover, keepOpenSurfaces: [toggle], keyboardRoot: popover, onDismiss });
  });

  afterEach(() => {
    dismiss.end();
    popover.remove();
    toggle.remove();
    FloatingPanelStack.resetForTests();
  });

  it('dismisses on a viewport press that prevents the default mouse events', () => {
    const viewport = menuPopoverDismissProbeViewportCreate();
    expect(menuPopoverDismissProbePress(viewport.canvas)).toBe(false);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    viewport.remove();
  });

  it('keeps open for presses on the popover or its toggle', () => {
    menuPopoverDismissProbePress(popover.querySelector('button') ?? popover);
    menuPopoverDismissProbePress(toggle);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('dismisses on Escape without reaching editor shortcuts', () => {
    const shortcuts = menuPopoverDismissProbeShortcutsInstall();
    menuPopoverDismissProbeEscape();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(shortcuts.keydown).not.toHaveBeenCalled();
    shortcuts.remove();
  });

  it('blocks viewport presses under the popover only while active', () => {
    const inner = popover.querySelector('button');
    expect(FloatingPanelStack.containsEventTarget(inner)).toBe(true);
    dismiss.end();
    expect(dismiss.isActive()).toBe(false);
    expect(FloatingPanelStack.containsEventTarget(inner)).toBe(false);
  });

  it('stops listening after end', () => {
    dismiss.end();
    const viewport = menuPopoverDismissProbeViewportCreate();
    menuPopoverDismissProbePress(viewport.canvas);
    menuPopoverDismissProbeEscape();
    expect(onDismiss).not.toHaveBeenCalled();
    viewport.remove();
  });
});
