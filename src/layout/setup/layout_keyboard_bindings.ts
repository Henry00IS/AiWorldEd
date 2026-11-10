import { ManagerInput } from '@/input/manager_input.js';
import { HandlerKeyboardShortcut } from '@/input/handler_keyboard_shortcut.js';
import { TransformMode } from '@/types/transform_mode.js';
import { HandlerObjectAction } from '@/outliner/hierarchy/handler_object_action.js';
import { HandlerAlignment } from '@/outliner/alignment/handler_alignment.js';
import type { SolidModelController } from '@/solid/controller/solid_model_controller.js';
import type { KeyboardShortcutSettings } from '@/settings/store/settings_types.js';
import { clipboardEventsListen } from '@/clipboard/clipboard_event_target.js';

/** Callbacks required when registering layout keyboard shortcuts. */
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
  onExportModel: () => void;
  getObjectActionHandler: () => HandlerObjectAction;
  getAlignmentHandler: () => HandlerAlignment;
  getSolidModelController: () => SolidModelController | null;
  /**
   * Optional modal transform keyboard sink during gizmo/bounds drags.
   *
   * @param event Browser keyboard event.
   * @returns True when consumed.
   */
  onModalTransformKeyDown?: (event: KeyboardEvent) => boolean;
}

/**
 * Creates and registers the editor keyboard shortcut handler, and sends native
 * copy and paste (Ctrl+C, Ctrl+V) to the scene clipboard.
 *
 * @param inputManager Shared input manager for key state.
 * @param host Layout callbacks and deferred handlers.
 * @returns Registered keyboard shortcut handler.
 */
export function createAndRegisterKeyboardShortcuts(
  inputManager: ManagerInput,
  host: LayoutKeyboardBindingHost,
  getKeyboardShortcuts: () => KeyboardShortcutSettings,
): HandlerKeyboardShortcut {
  const handler = new HandlerKeyboardShortcut(inputManager, getKeyboardShortcuts);
  handler.setNavigationActiveCallback(() => host.isCameraNavigating());
  bindPrimaryKeyboardShortcuts(handler, host);
  handler.register();
  bindIoKeyboardShortcuts(handler, host);
  clipboardEventsListen(document, {
    copy: (event) => host.getObjectActionHandler().copySelected(event),
    paste: (event) => host.getObjectActionHandler().pasteClipboard(event),
  });
  return handler;
}

/**
 * Binds transform, edit, and alignment keyboard shortcuts.
 *
 * @param handler Keyboard shortcut handler being configured.
 * @param host Layout callbacks and deferred handlers.
 */
function bindPrimaryKeyboardShortcuts(handler: HandlerKeyboardShortcut, host: LayoutKeyboardBindingHost): void {
  handler.setOnTransformMode((mode) => host.onTransformMode(mode));
  handler.setOnDeleteSelected(() => host.onDeleteSelected());
  handler.setOnEscape(() => host.onEscapeCancel());
  handler.setOnUndo(() => host.onUndo());
  handler.setOnRedo(() => host.onRedo());
  handler.setOnDuplicateSelected(() => host.getObjectActionHandler().onDuplicateSelected());
  handler.setOnGroupSelected(() => host.onGroupSelected());
  handler.setOnUngroupSelected(() => host.getObjectActionHandler().onUngroupSelected());
  handler.setOnAlignToOrigin(() => host.getAlignmentHandler().onAlignToOrigin());
  handler.setOnSolidOperationToggle(() => host.getSolidModelController()?.toggleAdditiveSubtractiveOnSelection());
  if (host.onModalTransformKeyDown) {
    handler.setOnModalTransformKeyDown((event) => host.onModalTransformKeyDown!(event));
  }
}

/**
 * Binds scene IO keyboard shortcuts.
 *
 * @param handler Keyboard shortcut handler being configured.
 * @param host Layout callbacks for save/load/export.
 */
function bindIoKeyboardShortcuts(handler: HandlerKeyboardShortcut, host: LayoutKeyboardBindingHost): void {
  handler.setOnSaveScene(() => host.onSaveScene());
  handler.setOnLoadScene(() => host.onLoadScene());
  handler.setOnExportModel(() => host.onExportModel());
}
