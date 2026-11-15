import type { EditMeshToolCommand } from './edit_mesh_tool_command.js';

/** Edit Mode modelling commands started by a single key without modifiers. */
const EDIT_MESH_PLAIN_KEY_COMMANDS: Readonly<Record<string, EditMeshToolCommand>> = {
  KeyE: 'extrude_faces',
  KeyI: 'inset_faces',
  KeyJ: 'connect_vertices',
};

/**
 * Returns the modelling command a plain key, or Shift+D, starts in Edit Mode.
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
  if (!event) return modifierPressed ? null : (EDIT_MESH_PLAIN_KEY_COMMANDS[keyCode] ?? null);
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (event.shiftKey) return keyCode === 'KeyD' ? 'duplicate_faces' : null;
  return EDIT_MESH_PLAIN_KEY_COMMANDS[keyCode] ?? null;
}
