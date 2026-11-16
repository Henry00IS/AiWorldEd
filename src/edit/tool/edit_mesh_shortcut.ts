import type { EditMeshToolCommand } from './edit_mesh_tool_command.js';

/** Modifier set that starts an Edit Mode modelling command. */
export type EditMeshShortcutModifiers = 'none' | 'shift' | 'ctrl';

/** Keyboard reminder and command binding for one Edit Mode modelling key. */
export interface EditMeshShortcutReminder {
  /** Stable reminder id used by the Keyboard settings tab. */
  readonly id: string;
  /** User-facing reminder label. */
  readonly label: string;
  /** User-facing key or key combination. */
  readonly shortcut: string;
  /** Modelling command started by this binding. */
  readonly command: EditMeshToolCommand;
  /** Layout-stable key code. */
  readonly keyCode: string;
  /** Required modifiers for this binding. */
  readonly modifiers: EditMeshShortcutModifiers;
}

/**
 * Edit Mode modelling shortcuts handled by {@link editMeshPlainKeyCommand}. The
 * Keyboard settings tab reads the same list so reminders cannot drift.
 */
export const EDIT_MESH_SHORTCUT_REMINDERS: readonly EditMeshShortcutReminder[] = [
  {
    id: 'edit-extrude',
    label: 'Extrude Faces (Edit Mode)',
    shortcut: 'E',
    command: 'extrude_faces',
    keyCode: 'KeyE',
    modifiers: 'none',
  },
  {
    id: 'edit-inset',
    label: 'Inset Faces (Edit Mode)',
    shortcut: 'I',
    command: 'inset_faces',
    keyCode: 'KeyI',
    modifiers: 'none',
  },
  {
    id: 'edit-connect',
    label: 'Connect Vertices (Edit Mode)',
    shortcut: 'J',
    command: 'connect_vertices',
    keyCode: 'KeyJ',
    modifiers: 'none',
  },
  {
    id: 'edit-split',
    label: 'Split Faces (Edit Mode)',
    shortcut: 'Y',
    command: 'split_faces',
    keyCode: 'KeyY',
    modifiers: 'none',
  },
  {
    id: 'edit-bevel',
    label: 'Bevel Edges (Edit Mode)',
    shortcut: 'Ctrl+B',
    command: 'bevel_edges',
    keyCode: 'KeyB',
    modifiers: 'ctrl',
  },
  {
    id: 'edit-duplicate-faces',
    label: 'Duplicate Faces (Edit Mode)',
    shortcut: 'Shift+D',
    command: 'duplicate_faces',
    keyCode: 'KeyD',
    modifiers: 'shift',
  },
];

/**
 * Returns the modelling command a plain key, Shift+D or Ctrl+B starts in Edit
 * Mode.
 *
 * @param keyCode Key code.
 * @param event Keyboard event, when one is known.
 * @param modifierPressed Whether the editor reports a held modifier; only used
 *   when no event is known, since the editor counts Shift as one.
 * @returns Command, or null when the key or its modifiers start none.
 */
export function editMeshPlainKeyCommand(
  keyCode: string,
  event: KeyboardEvent | undefined,
  modifierPressed: boolean,
): EditMeshToolCommand | null {
  const modifiers = event ? editMeshShortcutModifiersFromEvent(event) : modifierPressed ? null : 'none';
  if (modifiers === null) {
    return null;
  }
  for (const reminder of EDIT_MESH_SHORTCUT_REMINDERS) {
    if (reminder.keyCode === keyCode && reminder.modifiers === modifiers) {
      return reminder.command;
    }
  }
  return null;
}

/**
 * Classifies the modifiers that distinguish Edit Mode modelling shortcuts.
 *
 * Ctrl+B is accepted without checking Meta, matching the previous handler. Any
 * other mix of Ctrl, Meta, Alt, or Shift is ignored.
 *
 * @param event Keyboard event.
 * @returns Binding modifiers, or null when the combination starts no command.
 */
function editMeshShortcutModifiersFromEvent(event: KeyboardEvent): EditMeshShortcutModifiers | null {
  if (event.ctrlKey && !event.shiftKey && !event.altKey) {
    return 'ctrl';
  }
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return null;
  }
  if (event.shiftKey) {
    return 'shift';
  }
  return 'none';
}
