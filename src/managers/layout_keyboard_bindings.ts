import { InputManager } from './input_manager.js';
import { KeyboardShortcutHandler } from './keyboard_shortcut_handler.js';
import { TransformMode } from '../types/transform_mode.js';
import { ObjectActionHandler } from './object_action_handler.js';
import { AlignmentHandler } from './alignment_handler.js';
import type { KeyboardShortcutSettings } from '../settings/settings_types.js';

/**
 * Callbacks required when registering layout keyboard shortcuts.
 */
export interface LayoutKeyboardBindingHost {
  isCameraNavigating: () => boolean;
  onTransformMode: (mode: TransformMode) => void;
  onDeleteSelected: () => void;
  onEscapeCancel: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onGroupSelected: () => void;
  onSaveScene: () => void;
  onLoadScene: () => void;
  onExportGlb: () => void;
  getObjectActionHandler: () => ObjectActionHandler;
  getAlignmentHandler: () => AlignmentHandler;
}

/**
 * Creates and registers the editor keyboard shortcut handler.
 * @param inputManager Shared input manager for key state.
 * @param host Layout callbacks and deferred handlers.
 * @returns Registered keyboard shortcut handler.
 */
export function createAndRegisterKeyboardShortcuts(
  inputManager: InputManager,
  host: LayoutKeyboardBindingHost,
  getKeyboardShortcuts: () => KeyboardShortcutSettings
): KeyboardShortcutHandler {
  const handler = new KeyboardShortcutHandler(inputManager, getKeyboardShortcuts);
  handler.setNavigationActiveCallback(() => host.isCameraNavigating());
  bindPrimaryKeyboardShortcuts(handler, host);
  handler.register();
  bindIoKeyboardShortcuts(handler, host);
  return handler;
}

/**
 * Binds transform, edit, and alignment keyboard shortcuts.
 * @param handler Keyboard shortcut handler being configured.
 * @param host Layout callbacks and deferred handlers.
 */
function bindPrimaryKeyboardShortcuts(
  handler: KeyboardShortcutHandler,
  host: LayoutKeyboardBindingHost
): void {
  handler.setOnTransformMode((mode) => host.onTransformMode(mode));
  handler.setOnDeleteSelected(() => host.onDeleteSelected());
  handler.setOnEscape(() => host.onEscapeCancel());
  handler.setOnUndo(() => host.onUndo());
  handler.setOnRedo(() => host.onRedo());
  handler.setOnDuplicateSelected(
    () => host.getObjectActionHandler().onDuplicateSelected()
  );
  handler.setOnGroupSelected(() => host.onGroupSelected());
  handler.setOnUngroupSelected(
    () => host.getObjectActionHandler().onUngroupSelected()
  );
  handler.setOnAlignToOrigin(() => host.getAlignmentHandler().onAlignToOrigin());
  handler.setOnAxisCycle(() => host.getAlignmentHandler().onAxisCycle());
}

/**
 * Binds scene IO keyboard shortcuts.
 * @param handler Keyboard shortcut handler being configured.
 * @param host Layout callbacks for save/load/export.
 */
function bindIoKeyboardShortcuts(
  handler: KeyboardShortcutHandler,
  host: LayoutKeyboardBindingHost
): void {
  handler.setOnSaveScene(() => host.onSaveScene());
  handler.setOnLoadScene(() => host.onLoadScene());
  handler.setOnExportGlb(() => host.onExportGlb());
}
