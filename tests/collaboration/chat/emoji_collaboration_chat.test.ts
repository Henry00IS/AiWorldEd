import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmojiCollaborationChatPicker } from '@/collaboration/chat/emoji_collaboration_chat.js';
import { FloatingPanelStack } from '@/ui/floating_panel/panel_floating_stack.js';
import {
  menuPopoverDismissProbeEscape,
  menuPopoverDismissProbePress,
  menuPopoverDismissProbeShortcutsInstall,
  menuPopoverDismissProbeViewportCreate,
} from '../../ui/menu/menu_popover_dismiss_probe.js';

describe('EmojiCollaborationChatPicker dismissal', () => {
  let composer: HTMLElement;
  let field: HTMLTextAreaElement;
  let toggle: HTMLButtonElement;
  let picker: EmojiCollaborationChatPicker;
  let picked: ReturnType<typeof vi.fn<(emoji: string) => void>>;

  beforeEach(() => {
    FloatingPanelStack.resetForTests();
    composer = document.createElement('div');
    field = document.createElement('textarea');
    toggle = document.createElement('button');
    picked = vi.fn<(emoji: string) => void>();
    picker = new EmojiCollaborationChatPicker(picked, toggle);
    composer.append(picker.element, field, toggle);
    document.body.appendChild(composer);
    picker.openSet(true);
  });

  afterEach(() => {
    picker.openSet(false);
    composer.remove();
    FloatingPanelStack.resetForTests();
  });

  it('closes on a viewport press that prevents the default mouse events', () => {
    const viewport = menuPopoverDismissProbeViewportCreate();
    menuPopoverDismissProbePress(viewport.canvas);
    expect(picker.isOpen()).toBe(false);
    viewport.remove();
  });

  it('closes on Escape without reaching editor shortcuts', () => {
    const shortcuts = menuPopoverDismissProbeShortcutsInstall();
    menuPopoverDismissProbeEscape();
    expect(picker.isOpen()).toBe(false);
    expect(shortcuts.keydown).not.toHaveBeenCalled();
    shortcuts.remove();
  });

  it('stays open for presses on an emoji or the toggle and lets the field type', () => {
    const cell = picker.element.querySelector('.editor-chat-emoji-cell');
    menuPopoverDismissProbePress(cell ?? picker.element);
    menuPopoverDismissProbePress(toggle);
    const typed = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    field.dispatchEvent(typed);
    expect(typed.defaultPrevented).toBe(false);
    expect(picker.isOpen()).toBe(true);
    expect(FloatingPanelStack.containsEventTarget(cell)).toBe(true);
  });
});
