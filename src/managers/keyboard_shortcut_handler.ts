import { InputManager } from './input_manager.js';
import { TransformMode } from '../types/transform_mode.js';
import { ShadingMode } from '../types/shading_mode.js';
import { SelectionMode } from '../types/selection_mode.js';
import { createDefaultKeyboardShortcutSettings } from '../settings/settings_defaults.js';
import type { KeyboardShortcutSettings } from '../settings/settings_types.js';

/**
 * Callback for transform mode changes.
 * @param mode The new transform mode to activate.
 */
export type TransformModeCallback = (mode: TransformMode) => void;

/**
 * Callback for a generic action triggered by a keyboard shortcut.
 */
export type ActionCallback = () => void;

/**
 * Callback for shading mode changes.
 * @param mode The new shading mode to apply.
 */
export type ShadingModeCallback = (mode: ShadingMode) => void;

/**
 * Callback for selection mode toggle.
 * @param mode The new selection mode to activate.
 */
export type SelectionModeCallback = (mode: SelectionMode) => void;

/**
 * Optional guard that reports whether 3D fly navigation is active.
 * @returns True when tool keys must be suppressed for fly mode.
 */
export type NavigationActiveCallback = () => boolean;

/**
 * Configures keyboard shortcuts for editor operations.
 * Binds window-level keydown events to editor actions.
 * Tool keys (W/E/R/T, WASD-adjacent) are blocked while flying with RMB.
 */
export class KeyboardShortcutHandler {
  private inputManager: InputManager;
  private onTransformMode: TransformModeCallback | null;
  private onDeleteSelected: ActionCallback | null;
  private onUndo: ActionCallback | null;
  private onRedo: ActionCallback | null;
  private onDuplicateSelected: ActionCallback | null;
  private onGroupSelected: ActionCallback | null;
  private onUngroupSelected: ActionCallback | null;
  private onAlignToOrigin: ActionCallback | null;
  private onAxisCycle: ActionCallback | null;
  private onSaveScene: ActionCallback | null;
  private onLoadScene: ActionCallback | null;
  private onExportGlb: ActionCallback | null;
  private onFitToSelection: ActionCallback | null;
  private onFitAllViewports: ActionCallback | null;
  private onShadingMode: ShadingModeCallback | null;
  private onSelectionModeToggle: SelectionModeCallback | null;
  private onSnapIntervalForward: ActionCallback | null;
  private onSnapIntervalBackward: ActionCallback | null;
  private onExtrudeFaces: ActionCallback | null;
  private onClipFlip: ActionCallback | null;
  private onClipCommit: ActionCallback | null;
  private onClipSplit: ActionCallback | null;
  private onClipCancel: ActionCallback | null;
  private onEscape: ActionCallback | null;
  private isClipToolActive: (() => boolean) | null;
  private isNavigationActive: NavigationActiveCallback | null;
  private keydownListener: ((event: KeyboardEvent) => void) | null;
  private readonly getKeyboardShortcuts: () => KeyboardShortcutSettings;

  /**
   * Returns whether a keyboard code is currently held.
   * @param keyCode KeyboardEvent.code value (e.g. KeyG).
   * @returns True while the key is down.
   */
  isKeyDown(keyCode: string): boolean {
    return this.inputManager.isKeyDown(keyCode);
  }

  /**
   * Creates a new keyboard shortcut handler.
   * @param inputManager The input manager providing key state queries.
   */
  constructor(
    inputManager: InputManager,
    getKeyboardShortcuts: () => KeyboardShortcutSettings =
      createDefaultKeyboardShortcutSettings
  ) {
    this.inputManager = inputManager;
    this.getKeyboardShortcuts = getKeyboardShortcuts;
    this.onTransformMode = null;
    this.onDeleteSelected = null;
    this.onUndo = null;
    this.onRedo = null;
    this.onDuplicateSelected = null;
    this.onGroupSelected = null;
    this.onUngroupSelected = null;
    this.onAlignToOrigin = null;
    this.onAxisCycle = null;
    this.onSaveScene = null;
    this.onLoadScene = null;
    this.onExportGlb = null;
    this.onFitToSelection = null;
    this.onFitAllViewports = null;
    this.onShadingMode = null;
    this.onSelectionModeToggle = null;
    this.onSnapIntervalForward = null;
    this.onSnapIntervalBackward = null;
    this.onExtrudeFaces = null;
    this.onClipFlip = null;
    this.onClipCommit = null;
    this.onClipSplit = null;
    this.onClipCancel = null;
    this.onEscape = null;
    this.isClipToolActive = null;
    this.isNavigationActive = null;
    this.keydownListener = null;
  }

  /**
   * Registers the callback for Escape (deselect / exit tool).
   * @param callback Function to call when Escape is pressed.
   */
  setOnEscape(callback: ActionCallback): void {
    this.onEscape = callback;
  }

  /**
   * Registers a guard that reports when 3D fly navigation is active.
   * @param callback Returns true while RMB fly mode should block tool keys.
   */
  setNavigationActiveCallback(callback: NavigationActiveCallback | null): void {
    this.isNavigationActive = callback;
  }

  /**
   * Registers the callback for transform mode changes.
   * @param callback The function to call when a transform mode key is pressed.
   */
  setOnTransformMode(callback: TransformModeCallback): void {
    this.onTransformMode = callback;
  }

  /**
   * Registers the callback for the delete action.
   * @param callback The function to call when Delete is pressed.
   */
  setOnDeleteSelected(callback: ActionCallback): void {
    this.onDeleteSelected = callback;
  }

  /**
   * Registers the callback for the undo action.
   * @param callback The function to call when the undo shortcut is pressed.
   */
  setOnUndo(callback: ActionCallback): void {
    this.onUndo = callback;
  }

  /**
   * Registers the callback for the redo action.
   * @param callback The function to call when the redo shortcut is pressed.
   */
  setOnRedo(callback: ActionCallback): void {
    this.onRedo = callback;
  }

  /**
   * Registers the callback for the duplicate action.
   * @param callback The function to call when the duplicate shortcut is pressed.
   */
  setOnDuplicateSelected(callback: ActionCallback): void {
    this.onDuplicateSelected = callback;
  }

  /**
   * Registers the callback for the group action.
   * @param callback The function to call when the group shortcut is pressed.
   */
  setOnGroupSelected(callback: ActionCallback): void {
    this.onGroupSelected = callback;
  }

  /**
   * Registers the callback for the ungroup action.
   * @param callback The function to call when the ungroup shortcut is pressed.
   */
  setOnUngroupSelected(callback: ActionCallback): void {
    this.onUngroupSelected = callback;
  }

  /**
   * Registers the callback for the align to origin action.
   * @param callback The function to call when the align to origin shortcut is pressed.
   */
  setOnAlignToOrigin(callback: ActionCallback): void {
    this.onAlignToOrigin = callback;
  }

  /**
   * Registers the callback for axis cycling.
   * @param callback The function to call when the axis cycle shortcut is pressed.
   */
  setOnAxisCycle(callback: ActionCallback): void {
    this.onAxisCycle = callback;
  }

  /**
   * Registers the callback for the save scene action.
   * @param callback The function to call when the save shortcut is pressed.
   */
  setOnSaveScene(callback: ActionCallback): void {
    this.onSaveScene = callback;
  }

  /**
   * Registers the callback for the load scene action.
   * @param callback The function to call when the load shortcut is pressed.
   */
  setOnLoadScene(callback: ActionCallback): void {
    this.onLoadScene = callback;
  }

  /**
   * Registers the callback for the export GLB action.
   * @param callback The function to call when the export shortcut is pressed.
   */
  setOnExportGlb(callback: ActionCallback): void {
    this.onExportGlb = callback;
  }

  /**
   * Registers the callback for the fit-to-selection action.
   * @param callback The function to call when F is pressed.
   */
  setOnFitToSelection(callback: ActionCallback): void {
    this.onFitToSelection = callback;
  }

  /**
   * Registers the callback for the fit-all-viewports action.
   * @param callback The function to call when Shift+F is pressed.
   */
  setOnFitAllViewports(callback: ActionCallback): void {
    this.onFitAllViewports = callback;
  }

  /**
   * Registers the callback for shading mode changes.
   * @param callback The function to call when a shading mode key is pressed.
   */
  setOnShadingMode(callback: ShadingModeCallback): void {
    this.onShadingMode = callback;
  }

  /**
   * Registers the callback for selection mode toggling via Tab key.
   * @param callback The function to call when Tab is pressed.
   */
  setOnSelectionModeToggle(callback: SelectionModeCallback): void {
    this.onSelectionModeToggle = callback;
  }

  /**
   * Registers the callback for cycling snap interval forward.
   * @param callback The function to call when Period is pressed.
   */
  setOnSnapIntervalForward(callback: ActionCallback): void {
    this.onSnapIntervalForward = callback;
  }

  /**
   * Registers the callback for cycling snap interval backward.
   * @param callback The function to call when Comma is pressed.
   */
  setOnSnapIntervalBackward(callback: ActionCallback): void {
    this.onSnapIntervalBackward = callback;
  }

  /**
   * Registers the callback for face extrusion (Shift+E).
   * @param callback The function to call when extrude is triggered.
   */
  setOnExtrudeFaces(callback: ActionCallback): void {
    this.onExtrudeFaces = callback;
  }

  /**
   * Registers clip plane tool keyboard actions and an active-tool guard.
   * @param isActive Returns true while the clip plane tool should own keys.
   * @param onFlip Flip keep side callback.
   * @param onCommit Clip keep callback.
   * @param onSplit Split callback.
   * @param onCancel Cancel callback.
   */
  setClipPlaneShortcuts(
    isActive: () => boolean,
    onFlip: ActionCallback,
    onCommit: ActionCallback,
    onSplit: ActionCallback,
    onCancel: ActionCallback
  ): void {
    this.isClipToolActive = isActive;
    this.onClipFlip = onFlip;
    this.onClipCommit = onCommit;
    this.onClipSplit = onSplit;
    this.onClipCancel = onCancel;
  }

  /**
   * Registers the window keydown listener for all keyboard shortcuts.
   */
  register(): void {
    if (this.keydownListener) return;
    this.keydownListener = (event) => this.handleKeyDown(event);
    window.addEventListener('keydown', this.keydownListener);
  }

  /**
   * Removes the window keydown listener.
   */
  unregister(): void {
    if (!this.keydownListener) return;
    window.removeEventListener('keydown', this.keydownListener);
    this.keydownListener = null;
  }

  /**
   * Processes a keydown event and dispatches to the appropriate callback.
   * @param event The keyboard event to process.
   */
  private handleKeyDown(event: KeyboardEvent): void {
    if (this.isTypingInFormField(event)) return;
    if (this.handleEscapeKey(event)) return;
    this.handleFileKeys(event);
    this.handleUndoRedoKeys(event);
    this.handleDuplicateKey(event);
    if (this.isFlyNavigationBlockingTools()) return;
    if (this.handleClipPlaneKeys(event)) return;
    this.handleTransformModeKeys(event);
    this.handleEditKeys(event);
    this.handleGroupKeys(event);
    this.handleAlignKeys(event);
    this.handleAxisCycleKey(event);
    this.handleFitKeys(event);
    this.handleShadingModeKeys(event);
    this.handleSelectionModeToggleKey(event);
    this.handleSnapIntervalKeys(event);
    this.handleExtrudeKey(event);
  }

  /**
   * Handles Escape: deselect everything and return to object select.
   * @param event Keyboard event.
   * @returns True when Escape was handled.
   */
  private handleEscapeKey(event: KeyboardEvent): boolean {
    if (!this.matchesShortcut(event, 'escape')) return false;
    event.preventDefault();
    this.onEscape?.();
    return true;
  }

  /**
   * Handles clip plane tool keys when that tool is active.
   * @param event Keyboard event.
   * @returns True when a clip shortcut consumed the event.
   */
  private handleClipPlaneKeys(event: KeyboardEvent): boolean {
    if (!this.isClipToolActive || !this.isClipToolActive()) return false;
    if (this.matchesShortcut(event, 'clip_flip')) {
      event.preventDefault();
      this.onClipFlip?.();
      return true;
    }
    if (this.matchesShortcut(event, 'clip_commit')) {
      event.preventDefault();
      this.onClipCommit?.();
      return true;
    }
    if (this.matchesShortcut(event, 'clip_split')) {
      event.preventDefault();
      this.onClipSplit?.();
      return true;
    }
    return false;
  }

  /**
   * Handles the face extrude shortcut (Shift+E, Unity-style transform uses plain E).
   * @param event The keyboard event to check.
   */
  private handleExtrudeKey(event: KeyboardEvent): void {
    if (!this.onExtrudeFaces) return;
    if (!this.matchesShortcut(event, 'extrude')) return;
    event.preventDefault();
    this.onExtrudeFaces();
  }

  /**
   * Returns true when the event target is a text input that should own keys.
   * @param event The keyboard event.
   * @returns True if shortcuts must not run.
   */
  private isTypingInFormField(event: KeyboardEvent): boolean {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    return target.isContentEditable;
  }

  /**
   * Returns true when RMB fly mode should suppress tool keys like W/E/R/T/A.
   * @returns True if tool shortcuts must be ignored.
   */
  private isFlyNavigationBlockingTools(): boolean {
    if (this.inputManager.isRightMouseDown()) return true;
    if (this.isNavigationActive && this.isNavigationActive()) return true;
    return false;
  }

  /**
   * Handles file keyboard shortcuts (Ctrl+S, Ctrl+O, Ctrl+Shift+E).
   * @param event The keyboard event to check.
   */
  private handleFileKeys(event: KeyboardEvent): void {
    this.handleSaveKey(event);
    this.handleLoadKey(event);
    this.handleExportKey(event);
  }

  /**
   * Handles the save keyboard shortcut (Ctrl+S).
   * @param event The keyboard event to check.
   */
  private handleSaveKey(event: KeyboardEvent): void {
    if (!this.onSaveScene) return;
    if (this.matchesShortcut(event, 'save')) {
      event.preventDefault();
      this.onSaveScene();
    }
  }

  /**
   * Handles the load keyboard shortcut (Ctrl+O).
   * @param event The keyboard event to check.
   */
  private handleLoadKey(event: KeyboardEvent): void {
    if (!this.onLoadScene) return;
    if (this.matchesShortcut(event, 'load')) {
      event.preventDefault();
      this.onLoadScene();
    }
  }

  /**
   * Handles the export GLB keyboard shortcut (Ctrl+Shift+E).
   * @param event The keyboard event to check.
   */
  private handleExportKey(event: KeyboardEvent): void {
    if (!this.onExportGlb) return;
    if (this.matchesShortcut(event, 'export_glb')) {
      event.preventDefault();
      this.onExportGlb();
    }
  }

  /**
   * Handles configured transform mode shortcuts.
   * @param event The keyboard event to check.
   */
  private handleTransformModeKeys(event: KeyboardEvent): void {
    if (!this.onTransformMode) return;
    if (this.matchesShortcut(event, 'move')) {
      event.preventDefault();
      this.onTransformMode(TransformMode.TRANSLATE);
      return;
    }
    if (this.matchesShortcut(event, 'rotate')) {
      event.preventDefault();
      this.onTransformMode(TransformMode.ROTATE);
      return;
    }
    if (this.matchesShortcut(event, 'scale')) {
      event.preventDefault();
      this.onTransformMode(TransformMode.SCALE);
      return;
    }
    if (this.matchesShortcut(event, 'bounds')) {
      event.preventDefault();
      this.onTransformMode(TransformMode.BOUNDS);
    }
  }

  /**
   * Handles edit keyboard shortcuts (Delete).
   * @param event The keyboard event to check.
   */
  private handleEditKeys(event: KeyboardEvent): void {
    if (!this.onDeleteSelected) return;
    if (this.matchesShortcut(event, 'delete_selected')) {
      event.preventDefault();
      this.onDeleteSelected();
    }
  }

  /**
   * Handles undo and redo keyboard shortcuts.
   * Ctrl+Z undoes; Ctrl+Y (and Ctrl+Shift+Z) redo.
   * Uses event.key (not event.code) so QWERTZ/AZERTY layouts match the labeled letter.
   * @param event The keyboard event to check.
   */
  private handleUndoRedoKeys(event: KeyboardEvent): void {
    if (this.matchesShortcut(event, 'undo')) {
      event.preventDefault();
      if (this.onUndo) this.onUndo();
      return;
    }
    if (this.matchesShortcut(event, 'redo') || this.matchesShortcut(event, 'redo_alternate')) {
      event.preventDefault();
      if (this.onRedo) this.onRedo();
    }
  }

  /**
   * Returns true when Ctrl (or Cmd on macOS) is held for this event.
   * @param event The keyboard event.
   * @returns True if the primary editor modifier is active.
   */
  /**
   * Handles the duplicate keyboard shortcut (Ctrl+D).
   * @param event The keyboard event to check.
   */
  private handleDuplicateKey(event: KeyboardEvent): void {
    if (!this.onDuplicateSelected) return;
    if (this.matchesShortcut(event, 'duplicate')) {
      event.preventDefault();
      this.onDuplicateSelected();
    }
  }

  /**
   * Handles group and ungroup keyboard shortcuts.
   * @param event The keyboard event to check.
   */
  private handleGroupKeys(event: KeyboardEvent): void {
    if (this.matchesShortcut(event, 'group') && this.onGroupSelected) {
      event.preventDefault();
      this.onGroupSelected();
    }
    if (this.matchesShortcut(event, 'ungroup') && this.onUngroupSelected) {
      event.preventDefault();
      this.onUngroupSelected();
    }
  }

  /**
   * Handles the align to origin keyboard shortcut (Alt+G).
   * @param event The keyboard event to check.
   */
  private handleAlignKeys(event: KeyboardEvent): void {
    if (!this.onAlignToOrigin) return;
    if (this.matchesShortcut(event, 'align_origin')) {
      event.preventDefault();
      this.onAlignToOrigin();
    }
  }

  /**
   * Handles the axis cycle keyboard shortcut (A).
   * @param event The keyboard event to check.
   */
  private handleAxisCycleKey(event: KeyboardEvent): void {
    if (!this.onAxisCycle) return;
    if (this.matchesShortcut(event, 'axis_cycle')) {
      event.preventDefault();
      this.onAxisCycle();
    }
  }

  /**
   * Returns true when Ctrl, Shift, or Alt is held.
   * @returns True if any common modifier is down.
   */
  /**
   * Handles the fit-to-selection keyboard shortcuts (F and Shift+F).
   * @param event The keyboard event to check.
   */
  private handleFitKeys(event: KeyboardEvent): void {
    this.handleFitToSelectionKey(event);
    this.handleFitAllViewportsKey(event);
  }

  /**
   * Handles the fit-to-selection keyboard shortcut (F).
   * @param event The keyboard event to check.
   */
  private handleFitToSelectionKey(event: KeyboardEvent): void {
    if (!this.onFitToSelection) return;
    if (this.matchesShortcut(event, 'fit_selection')) {
      event.preventDefault();
      this.onFitToSelection();
    }
  }

  /**
   * Handles the fit-all-viewports keyboard shortcut (Shift+F).
   * @param event The keyboard event to check.
   */
  private handleFitAllViewportsKey(event: KeyboardEvent): void {
    if (!this.onFitAllViewports) return;
    if (this.matchesShortcut(event, 'fit_all')) {
      event.preventDefault();
      this.onFitAllViewports();
    }
  }

  /**
   * Handles shading mode keyboard shortcuts (Digit1-Digit4).
   * @param event The keyboard event to check.
   */
  private handleShadingModeKeys(event: KeyboardEvent): void {
    if (!this.onShadingMode) return;
    if (this.matchesShortcut(event, 'shading_solid')) {
      event.preventDefault();
      this.onShadingMode(ShadingMode.SOLID);
    }
    if (this.matchesShortcut(event, 'shading_wireframe')) {
      event.preventDefault();
      this.onShadingMode(ShadingMode.WIREFRAME);
    }
    if (this.matchesShortcut(event, 'shading_flat')) {
      event.preventDefault();
      this.onShadingMode(ShadingMode.FLAT);
    }
    if (this.matchesShortcut(event, 'shading_wireframe_overlay')) {
      event.preventDefault();
      this.onShadingMode(ShadingMode.WIREFRAME_OVERLAY);
    }
  }

  /**
   * Handles the Tab key for toggling selection mode.
   * @param event The keyboard event to check.
   */
  private handleSelectionModeToggleKey(event: KeyboardEvent): void {
    if (!this.onSelectionModeToggle) return;
    if (this.matchesShortcut(event, 'face')) {
      event.preventDefault();
      this.onSelectionModeToggle(SelectionMode.FACE);
      return;
    }
    if (this.matchesShortcut(event, 'selection_object')) {
      event.preventDefault();
      this.onSelectionModeToggle(SelectionMode.OBJECT);
    }
  }

  /**
   * Handles the snap interval cycling keyboard shortcuts (Comma, Period).
   * @param event The keyboard event to check.
   */
  private handleSnapIntervalKeys(event: KeyboardEvent): void {
    this.handleSnapIntervalForwardKey(event);
    this.handleSnapIntervalBackwardKey(event);
    this.handleLargeSnapIntervalForwardKey(event);
    this.handleLargeSnapIntervalBackwardKey(event);
  }

  /**
   * Handles the snap interval forward shortcut (Period, Shift+Period).
   * @param event The keyboard event to check.
   */
  private handleSnapIntervalForwardKey(event: KeyboardEvent): void {
    if (!this.onSnapIntervalForward) return;
    if (this.matchesShortcut(event, 'snap_forward')) {
      event.preventDefault();
      this.onSnapIntervalForward();
    }
  }

  /**
   * Handles the snap interval backward shortcut (Comma, Shift+Comma).
   * @param event The keyboard event to check.
   */
  private handleSnapIntervalBackwardKey(event: KeyboardEvent): void {
    if (!this.onSnapIntervalBackward) return;
    if (this.matchesShortcut(event, 'snap_backward')) {
      event.preventDefault();
      this.onSnapIntervalBackward();
    }
  }

  /**
   * Handles the configured large snap interval forward shortcut.
   * @param event Keyboard event to check.
   */
  private handleLargeSnapIntervalForwardKey(event: KeyboardEvent): void {
    if (!this.onSnapIntervalForward || !this.matchesShortcut(event, 'snap_forward_large')) return;
    event.preventDefault();
    this.runSnapIntervalAction(this.onSnapIntervalForward);
  }

  /**
   * Handles the configured large snap interval backward shortcut.
   * @param event Keyboard event to check.
   */
  private handleLargeSnapIntervalBackwardKey(event: KeyboardEvent): void {
    if (!this.onSnapIntervalBackward || !this.matchesShortcut(event, 'snap_backward_large')) return;
    event.preventDefault();
    this.runSnapIntervalAction(this.onSnapIntervalBackward);
  }

  /**
   * Runs a large snap interval change.
   * @param action Callback to invoke three times.
   */
  private runSnapIntervalAction(action: ActionCallback): void {
    for (let stepIndex = 0; stepIndex < 3; stepIndex++) action();
  }

  /**
   * Checks whether an event matches a configured shortcut.
   * @param event Keyboard event to compare.
   * @param action Configured action identifier.
   * @returns True when the key and modifier state match exactly.
   */
  private matchesShortcut(event: KeyboardEvent, action: keyof KeyboardShortcutSettings): boolean {
    const shortcut = this.getKeyboardShortcuts()[action];
    return this.matchesShortcutCode(event, action, shortcut.code) && this.isCtrlDown(event) === shortcut.ctrl &&
      this.isShiftDown(event) === shortcut.shift && this.isAltDown(event) === shortcut.alt &&
      event.metaKey === shortcut.meta;
  }

  /**
   * Matches a shortcut code, using displayed letters for undo and redo.
   * @param event Keyboard event to inspect.
   * @param action Shortcut action identifier.
   * @param code Configured keyboard event code.
   * @returns True when the event matches the configured key.
   */
  private matchesShortcutCode(
    event: KeyboardEvent,
    action: keyof KeyboardShortcutSettings,
    code: string
  ): boolean {
    if (action !== 'undo' && action !== 'redo' && action !== 'redo_alternate') {
      return event.code === code;
    }
    const letter = code.startsWith('Key') ? code.slice(3).toLowerCase() : '';
    return letter.length === 1 ? event.key.toLowerCase() === letter : event.code === code;
  }

  /**
   * Returns whether Control is active for an event.
   * @param event Keyboard event to inspect.
   * @returns True when Control is active.
   */
  private isCtrlDown(event: KeyboardEvent): boolean {
    return event.ctrlKey || this.inputManager.isCtrlDown();
  }

  /**
   * Returns whether Shift is active for an event.
   * @param event Keyboard event to inspect.
   * @returns True when Shift is active.
   */
  private isShiftDown(event: KeyboardEvent): boolean {
    return event.shiftKey || this.inputManager.isShiftDown();
  }

  /**
   * Returns whether Alt is active for an event.
   * @param event Keyboard event to inspect.
   * @returns True when Alt is active.
   */
  private isAltDown(event: KeyboardEvent): boolean {
    return event.altKey || this.inputManager.isAltDown();
  }
}
