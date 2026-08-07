import { TransformMode } from '@/types/transform_mode.js';
import { ShadingMode } from '@/types/shading_mode.js';
import { SelectionMode } from '@/types/selection_mode.js';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import type { KeyboardShortcutSettings } from '@/settings/store/settings_types.js';
import type {
  ActionCallback,
  KeyboardActionCallback,
  SelectionModeCallback,
  ShadingModeCallback,
  TransformModeCallback,
} from './handler_keyboard_shortcut_types.js';

/** Holds shortcut-matching helpers and optional action callbacks. */
export interface HandlerKeyboardShortcutActionHost {
  /**
   * Checks whether an event matches a configured shortcut.
   *
   * @param event Keyboard event to compare.
   * @param action Configured action identifier.
   * @returns True when the key and modifier state match exactly.
   */
  matchesShortcut(event: KeyboardEvent, action: keyof KeyboardShortcutSettings): boolean;

  /**
   * Invokes the given action callback three times for a large snap step.
   *
   * @param action Callback to invoke three times.
   */
  runSnapIntervalAction(action: ActionCallback): void;

  onTransformMode: TransformModeCallback | null;
  onDeleteSelected: ActionCallback | null;
  onUndo: ActionCallback | null;
  onRedo: ActionCallback | null;
  onDuplicateSelected: ActionCallback | null;
  onGroupSelected: ActionCallback | null;
  onUngroupSelected: ActionCallback | null;
  onAlignToOrigin: ActionCallback | null;
  onSolidOperationToggle: ActionCallback | null;
  onSaveScene: ActionCallback | null;
  onLoadScene: ActionCallback | null;
  onExportGlb: ActionCallback | null;
  onFitToSelection: KeyboardActionCallback | null;
  onFitAllViewports: ActionCallback | null;
  onShadingMode: ShadingModeCallback | null;
  onSelectionModeToggle: SelectionModeCallback | null;
  onInteractionModeToggle: ActionCallback | null;
  onComponentMode: ((mode: EditorComponentMode) => void) | null;
  onSnapIntervalForward: ActionCallback | null;
  onSnapIntervalBackward: ActionCallback | null;
  onExtrudeFaces: ActionCallback | null;
  onClipFlip: ActionCallback | null;
  onClipCommit: ActionCallback | null;
  onClipSplit: ActionCallback | null;
  onEscape: ActionCallback | null;
  isClipToolActive: (() => boolean) | null;
  isEditModeActive: (() => boolean) | null;
}

/**
 * Matches the escape shortcut, prevents the default browser action, and invokes
 * the host escape callback when present.
 *
 * @param host Action host.
 * @param event Keyboard event.
 * @returns True when the escape shortcut matched and was handled.
 */
export function handlerKeyboardShortcutHandleEscapeKey(
  host: HandlerKeyboardShortcutActionHost,
  event: KeyboardEvent,
): boolean {
  if (!host.matchesShortcut(event, 'escape')) {
    return false;
  }
  event.preventDefault();
  host.onEscape?.();
  return true;
}

/**
 * Handles clip plane tool keys when that tool is active.
 *
 * @param host Action host.
 * @param event Keyboard event.
 * @returns True when a clip shortcut consumed the event.
 */
export function handlerKeyboardShortcutHandleClipPlaneKeys(
  host: HandlerKeyboardShortcutActionHost,
  event: KeyboardEvent,
): boolean {
  if (!host.isClipToolActive || !host.isClipToolActive()) {
    return false;
  }
  if (host.matchesShortcut(event, 'clip_flip')) {
    event.preventDefault();
    host.onClipFlip?.();
    return true;
  }
  if (host.matchesShortcut(event, 'clip_commit')) {
    event.preventDefault();
    host.onClipCommit?.();
    return true;
  }
  if (host.matchesShortcut(event, 'clip_split')) {
    event.preventDefault();
    host.onClipSplit?.();
    return true;
  }
  return false;
}

/**
 * Handles the face extrude shortcut.
 *
 * @param host Action host.
 * @param event Keyboard event.
 */
export function handlerKeyboardShortcutHandleExtrudeKey(
  host: HandlerKeyboardShortcutActionHost,
  event: KeyboardEvent,
): void {
  if (!host.onExtrudeFaces) {
    return;
  }
  if (!host.matchesShortcut(event, 'extrude')) {
    return;
  }
  event.preventDefault();
  host.onExtrudeFaces();
}

/**
 * Handles file keyboard shortcuts (save, load, export).
 *
 * @param host Action host.
 * @param event Keyboard event.
 */
export function handlerKeyboardShortcutHandleFileKeys(
  host: HandlerKeyboardShortcutActionHost,
  event: KeyboardEvent,
): void {
  handlerKeyboardShortcutHandleSaveKey(host, event);
  handlerKeyboardShortcutHandleLoadKey(host, event);
  handlerKeyboardShortcutHandleExportKey(host, event);
}

/**
 * Handles the save keyboard shortcut.
 *
 * @param host Action host.
 * @param event Keyboard event.
 */
function handlerKeyboardShortcutHandleSaveKey(host: HandlerKeyboardShortcutActionHost, event: KeyboardEvent): void {
  if (!host.onSaveScene) {
    return;
  }
  if (host.matchesShortcut(event, 'save')) {
    event.preventDefault();
    host.onSaveScene();
  }
}

/**
 * Handles the load keyboard shortcut.
 *
 * @param host Action host.
 * @param event Keyboard event.
 */
function handlerKeyboardShortcutHandleLoadKey(host: HandlerKeyboardShortcutActionHost, event: KeyboardEvent): void {
  if (!host.onLoadScene) {
    return;
  }
  if (host.matchesShortcut(event, 'load')) {
    event.preventDefault();
    host.onLoadScene();
  }
}

/**
 * Handles the export GLB keyboard shortcut.
 *
 * @param host Action host.
 * @param event Keyboard event.
 */
function handlerKeyboardShortcutHandleExportKey(host: HandlerKeyboardShortcutActionHost, event: KeyboardEvent): void {
  if (!host.onExportGlb) {
    return;
  }
  if (host.matchesShortcut(event, 'export_glb')) {
    event.preventDefault();
    host.onExportGlb();
  }
}

/**
 * Handles configured transform mode shortcuts.
 *
 * @param host Action host.
 * @param event Keyboard event.
 */
export function handlerKeyboardShortcutHandleTransformModeKeys(
  host: HandlerKeyboardShortcutActionHost,
  event: KeyboardEvent,
): void {
  if (!host.onTransformMode) {
    return;
  }
  if (host.matchesShortcut(event, 'move')) {
    event.preventDefault();
    host.onTransformMode(TransformMode.TRANSLATE);
    return;
  }
  if (host.matchesShortcut(event, 'rotate')) {
    event.preventDefault();
    host.onTransformMode(TransformMode.ROTATE);
    return;
  }
  if (host.matchesShortcut(event, 'scale')) {
    event.preventDefault();
    host.onTransformMode(TransformMode.SCALE);
    return;
  }
  if (host.matchesShortcut(event, 'bounds')) {
    event.preventDefault();
    host.onTransformMode(TransformMode.BOUNDS);
  }
}

/**
 * Handles edit keyboard shortcuts (Delete).
 *
 * @param host Action host.
 * @param event Keyboard event.
 */
export function handlerKeyboardShortcutHandleEditKeys(
  host: HandlerKeyboardShortcutActionHost,
  event: KeyboardEvent,
): void {
  if (!host.onDeleteSelected) {
    return;
  }
  if (host.matchesShortcut(event, 'delete_selected')) {
    event.preventDefault();
    host.onDeleteSelected();
  }
}

/**
 * Handles undo and redo keyboard shortcuts.
 *
 * @param host Action host.
 * @param event Keyboard event.
 */
export function handlerKeyboardShortcutHandleUndoRedoKeys(
  host: HandlerKeyboardShortcutActionHost,
  event: KeyboardEvent,
): void {
  if (host.matchesShortcut(event, 'undo')) {
    event.preventDefault();
    host.onUndo?.();
    return;
  }
  if (host.matchesShortcut(event, 'redo') || host.matchesShortcut(event, 'redo_alternate')) {
    event.preventDefault();
    host.onRedo?.();
  }
}

/**
 * Handles the duplicate keyboard shortcut.
 *
 * @param host Action host.
 * @param event Keyboard event.
 */
export function handlerKeyboardShortcutHandleDuplicateKey(
  host: HandlerKeyboardShortcutActionHost,
  event: KeyboardEvent,
): void {
  if (!host.onDuplicateSelected) {
    return;
  }
  if (host.matchesShortcut(event, 'duplicate')) {
    event.preventDefault();
    host.onDuplicateSelected();
  }
}

/**
 * Handles group and ungroup keyboard shortcuts.
 *
 * @param host Action host.
 * @param event Keyboard event.
 */
export function handlerKeyboardShortcutHandleGroupKeys(
  host: HandlerKeyboardShortcutActionHost,
  event: KeyboardEvent,
): void {
  if (host.matchesShortcut(event, 'group') && host.onGroupSelected) {
    event.preventDefault();
    host.onGroupSelected();
  }
  if (host.matchesShortcut(event, 'ungroup') && host.onUngroupSelected) {
    event.preventDefault();
    host.onUngroupSelected();
  }
}

/**
 * Handles the align to origin keyboard shortcut.
 *
 * @param host Action host.
 * @param event Keyboard event.
 */
export function handlerKeyboardShortcutHandleAlignKeys(
  host: HandlerKeyboardShortcutActionHost,
  event: KeyboardEvent,
): void {
  if (!host.onAlignToOrigin) {
    return;
  }
  if (host.matchesShortcut(event, 'align_origin')) {
    event.preventDefault();
    host.onAlignToOrigin();
  }
}

/**
 * Handles the solid operation toggle keyboard shortcut.
 *
 * @param host Action host.
 * @param event Keyboard event.
 */
export function handlerKeyboardShortcutHandleSolidOperationKeys(
  host: HandlerKeyboardShortcutActionHost,
  event: KeyboardEvent,
): void {
  if (host.onSolidOperationToggle && host.matchesShortcut(event, 'solid_operation_toggle')) {
    event.preventDefault();
    host.onSolidOperationToggle();
  }
}

/**
 * Handles fit-to-selection and fit-all shortcuts.
 *
 * @param host Action host.
 * @param event Keyboard event.
 */
export function handlerKeyboardShortcutHandleFitKeys(
  host: HandlerKeyboardShortcutActionHost,
  event: KeyboardEvent,
): void {
  if (host.onFitToSelection && host.matchesShortcut(event, 'fit_selection')) {
    event.preventDefault();
    host.onFitToSelection(event);
  }
  if (host.onFitAllViewports && host.matchesShortcut(event, 'fit_all')) {
    event.preventDefault();
    host.onFitAllViewports();
  }
}

/**
 * Handles shading mode keyboard shortcuts.
 *
 * @param host Action host.
 * @param event Keyboard event.
 */
export function handlerKeyboardShortcutHandleShadingModeKeys(
  host: HandlerKeyboardShortcutActionHost,
  event: KeyboardEvent,
): void {
  if (host.isEditModeActive?.()) {
    return;
  }
  if (!host.onShadingMode) {
    return;
  }
  if (host.matchesShortcut(event, 'shading_solid')) {
    event.preventDefault();
    host.onShadingMode(ShadingMode.SOLID);
  }
  if (host.matchesShortcut(event, 'shading_wireframe')) {
    event.preventDefault();
    host.onShadingMode(ShadingMode.WIREFRAME);
  }
  if (host.matchesShortcut(event, 'shading_flat')) {
    event.preventDefault();
    host.onShadingMode(ShadingMode.FLAT);
  }
  if (host.matchesShortcut(event, 'shading_wireframe_overlay')) {
    event.preventDefault();
    host.onShadingMode(ShadingMode.WIREFRAME_OVERLAY);
  }
}

/**
 * Handles Edit Mode component mode digits (1 vertex, 2 edge, 3 face).
 *
 * @param host Action host.
 * @param event Keyboard event.
 */
export function handlerKeyboardShortcutHandleComponentModeKeys(
  host: HandlerKeyboardShortcutActionHost,
  event: KeyboardEvent,
): void {
  if (!host.isEditModeActive?.() || !host.onComponentMode) {
    return;
  }
  if (event.code === 'Digit1' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
    event.preventDefault();
    host.onComponentMode(EditorComponentMode.VERTEX);
    return;
  }
  if (event.code === 'Digit2' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
    event.preventDefault();
    host.onComponentMode(EditorComponentMode.EDGE);
    return;
  }
  if (event.code === 'Digit3' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
    event.preventDefault();
    host.onComponentMode(EditorComponentMode.FACE);
  }
}

/**
 * Handles the interaction mode toggle keyboard shortcut.
 *
 * @param host Action host.
 * @param event Keyboard event.
 */
export function handlerKeyboardShortcutHandleInteractionModeToggleKey(
  host: HandlerKeyboardShortcutActionHost,
  event: KeyboardEvent,
): void {
  if (!host.onInteractionModeToggle) {
    return;
  }
  if (!host.matchesShortcut(event, 'interaction_mode')) {
    return;
  }
  event.preventDefault();
  host.onInteractionModeToggle();
}

/**
 * Handles face and object selection mode keyboard shortcuts.
 *
 * @param host Action host.
 * @param event Keyboard event.
 */
export function handlerKeyboardShortcutHandleSelectionModeToggleKey(
  host: HandlerKeyboardShortcutActionHost,
  event: KeyboardEvent,
): void {
  if (!host.onSelectionModeToggle) {
    return;
  }
  if (host.matchesShortcut(event, 'face')) {
    event.preventDefault();
    host.onSelectionModeToggle(SelectionMode.FACE);
    return;
  }
  if (host.matchesShortcut(event, 'selection_object')) {
    event.preventDefault();
    host.onSelectionModeToggle(SelectionMode.OBJECT);
  }
}

/**
 * Handles snap interval cycling keyboard shortcuts.
 *
 * @param host Action host.
 * @param event Keyboard event.
 */
export function handlerKeyboardShortcutHandleSnapIntervalKeys(
  host: HandlerKeyboardShortcutActionHost,
  event: KeyboardEvent,
): void {
  if (host.onSnapIntervalForward && host.matchesShortcut(event, 'snap_forward')) {
    event.preventDefault();
    host.onSnapIntervalForward();
  }
  if (host.onSnapIntervalBackward && host.matchesShortcut(event, 'snap_backward')) {
    event.preventDefault();
    host.onSnapIntervalBackward();
  }
  if (host.onSnapIntervalForward && host.matchesShortcut(event, 'snap_forward_large')) {
    event.preventDefault();
    host.runSnapIntervalAction(host.onSnapIntervalForward);
  }
  if (host.onSnapIntervalBackward && host.matchesShortcut(event, 'snap_backward_large')) {
    event.preventDefault();
    host.runSnapIntervalAction(host.onSnapIntervalBackward);
  }
}

/**
 * Processes tool keyboard shortcuts for transform, edit, grouping, align, solid
 * operation, fit, component and interaction modes, selection modes, shading,
 * snap intervals, and extrude.
 *
 * @param host Action host.
 * @param event Keyboard event.
 */
export function handlerKeyboardShortcutDispatchToolKeys(
  host: HandlerKeyboardShortcutActionHost,
  event: KeyboardEvent,
): void {
  handlerKeyboardShortcutHandleTransformModeKeys(host, event);
  handlerKeyboardShortcutHandleEditKeys(host, event);
  handlerKeyboardShortcutHandleGroupKeys(host, event);
  handlerKeyboardShortcutHandleAlignKeys(host, event);
  handlerKeyboardShortcutHandleSolidOperationKeys(host, event);
  handlerKeyboardShortcutHandleFitKeys(host, event);
  handlerKeyboardShortcutHandleComponentModeKeys(host, event);
  handlerKeyboardShortcutHandleShadingModeKeys(host, event);
  handlerKeyboardShortcutHandleInteractionModeToggleKey(host, event);
  handlerKeyboardShortcutHandleSelectionModeToggleKey(host, event);
  handlerKeyboardShortcutHandleSnapIntervalKeys(host, event);
  handlerKeyboardShortcutHandleExtrudeKey(host, event);
}
