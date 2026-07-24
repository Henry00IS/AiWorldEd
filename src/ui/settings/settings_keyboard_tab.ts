import type { EditorSettingsStore } from '../../settings/editor_settings_store.js';
import type {
  KeyboardShortcutAction,
  KeyboardShortcutSettings
} from '../../settings/settings_types.js';
import {
  createSettingsCategory,
  createSettingsControlRow,
  createSettingsTextInput
} from './settings_form_controls.js';

/** Keyboard settings rows shown in their editor order. */
const PRIMARY_SHORTCUT_ROWS: ReadonlyArray<readonly [KeyboardShortcutAction, string]> = [
  ['move', 'Move'],
  ['rotate', 'Rotate'],
  ['scale', 'Scale'],
  ['bounds', 'Bounds Scale'],
  ['selection_object', 'Object Selection'],
  ['face', 'Face Selection'],
  ['delete_selected', 'Delete Selected Object']
];

/** General editor command shortcuts. */
const EDITOR_SHORTCUT_ROWS: ReadonlyArray<readonly [KeyboardShortcutAction, string]> = [
  ['escape', 'Cancel / Deselect'], ['save', 'Save Scene'], ['load', 'Load Scene'],
  ['export_glb', 'Export GLB'], ['undo', 'Undo'], ['redo', 'Redo'], ['redo_alternate', 'Redo (Alternative)'],
  ['duplicate', 'Duplicate Selected'], ['group', 'Group Selected'],
  ['ungroup', 'Ungroup Selected'], ['align_origin', 'Align to Origin'],
  ['axis_cycle', 'Cycle Alignment Axis'], ['fit_selection', 'Frame Selection'],
  ['fit_all', 'Frame All Viewports'], ['extrude', 'Extrude Faces'],
  ['snap_forward', 'Increase Snap Interval'], ['snap_backward', 'Decrease Snap Interval'],
  ['snap_forward_large', 'Increase Snap Interval (3 Steps)'], ['snap_backward_large', 'Decrease Snap Interval (3 Steps)']
];

/** Viewport shading shortcuts. */
const SHADING_SHORTCUT_ROWS: ReadonlyArray<readonly [KeyboardShortcutAction, string]> = [
  ['shading_solid', 'Solid'], ['shading_wireframe', 'Wireframe'],
  ['shading_flat', 'Flat'], ['shading_wireframe_overlay', 'Wireframe Overlay']
];

/** Clip plane tool shortcuts. */
const CLIP_SHORTCUT_ROWS: ReadonlyArray<readonly [KeyboardShortcutAction, string]> = [
  ['clip_flip', 'Flip Keep Side'], ['clip_commit', 'Commit Clip'], ['clip_split', 'Split Clip']
];

/**
 * Keyboard tab content for rebinding primary editor actions.
 */
export class SettingsKeyboardTab {
  private readonly store: EditorSettingsStore;
  private readonly root: HTMLElement;

  /**
   * Creates the Keyboard tab panel.
   * @param store Shared settings store for persisted shortcuts.
   */
  constructor(store: EditorSettingsStore) {
    this.store = store;
    this.root = document.createElement('div');
    this.root.style.display = 'flex';
    this.root.style.flexDirection = 'column';
    this.rebuild();
  }

  /**
   * Returns the tab root element.
   * @returns Root panel element.
   */
  getElement(): HTMLElement {
    return this.root;
  }

  /** Rebuilds shortcut controls from persisted settings. */
  rebuild(): void {
    const settings = this.store.getKeyboardShortcutSettings();
    this.root.replaceChildren(
      this.buildCategory('Editor Actions', PRIMARY_SHORTCUT_ROWS, settings),
      this.buildCategory('Commands', EDITOR_SHORTCUT_ROWS, settings),
      this.buildCategory('Shading', SHADING_SHORTCUT_ROWS, settings),
      this.buildCategory('Clip Plane Tool', CLIP_SHORTCUT_ROWS, settings)
    );
  }

  /**
   * Builds one category from shortcut rows.
   * @param title Category heading.
   * @param rows Shortcut actions and labels.
   * @param settings Current configured shortcuts.
   * @returns Completed settings category.
   */
  private buildCategory(
    title: string,
    rows: ReadonlyArray<readonly [KeyboardShortcutAction, string]>,
    settings: KeyboardShortcutSettings
  ): HTMLElement {
    const { section, body } = createSettingsCategory(title);
    rows.forEach(([action, label]) => body.appendChild(this.createShortcutRow(action, label, settings)));
    return section;
  }

  /**
   * Creates a key-capture field for one editor action.
   * @param action Action receiving the shortcut.
   * @param label Display label for the action.
   * @param settings Current configured shortcuts.
   * @returns Labeled shortcut control row.
   */
  private createShortcutRow(
    action: KeyboardShortcutAction,
    label: string,
    settings: KeyboardShortcutSettings
  ): HTMLElement {
    const input = createSettingsTextInput(
      formatKeyboardShortcut(settings[action]),
      `${label} shortcut`,
      () => undefined
    );
    input.readOnly = true;
    input.dataset.settingsField = `keyboard-shortcut-${action}`;
    input.addEventListener('keydown', (event) => this.captureShortcut(event, action));
    return createSettingsControlRow(label, input);
  }

  /**
   * Stores a captured key and prevents it from reaching editor shortcuts.
   * @param event Keyboard event from a shortcut field.
   * @param action Action that receives the captured shortcut.
   */
  private captureShortcut(event: KeyboardEvent, action: KeyboardShortcutAction): void {
    event.preventDefault();
    event.stopPropagation();
    if (isModifierCode(event.code)) return;
    this.store.setKeyboardShortcut(action, {
      code: event.code,
      ctrl: event.ctrlKey,
      shift: event.shiftKey,
      alt: event.altKey,
      meta: event.metaKey
    });
  }
}

/**
 * Converts a shortcut binding to a short UI label.
 * @param shortcut Configured key and modifiers.
 * @returns User-facing shortcut label.
 */
function formatKeyboardShortcut(shortcut: KeyboardShortcutSettings[keyof KeyboardShortcutSettings]): string {
  const modifiers = [shortcut.ctrl ? 'Ctrl' : '', shortcut.shift ? 'Shift' : '', shortcut.alt ? 'Alt' : '', shortcut.meta ? 'Meta' : ''].filter(Boolean);
  return [...modifiers, formatKeyboardCode(shortcut.code)].join('+');
}

/**
 * Converts a KeyboardEvent.code value to a short UI label.
 * @param code Keyboard event code.
 * @returns User-facing key label.
 */
function formatKeyboardCode(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Delete') return 'Del';
  return code;
}

/**
 * Returns whether a code represents a modifier-only key.
 * @param code Keyboard event code.
 * @returns True when it cannot form a primary shortcut alone.
 */
function isModifierCode(code: string): boolean {
  return ['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(code);
}
