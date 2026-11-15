import type { EditMeshToolCommand } from './edit_mesh_tool_command.js';

/** Edit Mode modelling commands started by a single key without modifiers. */
const EDIT_MESH_PLAIN_KEY_COMMANDS: Readonly<Record<string, EditMeshToolCommand>> = {
  KeyE: 'extrude_faces',
  KeyI: 'inset_faces',
  KeyJ: 'connect_vertices',
};

/**
 * Returns the modelling command a plain key starts in Edit Mode.
 *
 * @param keyCode Key code.
 * @param event Keyboard event, when one is known.
 * @param modifierPressed Whether the editor reports a held modifier.
 * @returns Command, or null when the key or its modifiers start none.
 */
export function editMeshPlainKeyCommand(
  keyCode: string,
  event: KeyboardEvent | undefined,
  modifierPressed: boolean,
): EditMeshToolCommand | null {
  if (modifierPressed || event?.ctrlKey || event?.metaKey || event?.altKey || event?.shiftKey) return null;
  return EDIT_MESH_PLAIN_KEY_COMMANDS[keyCode] ?? null;
}
