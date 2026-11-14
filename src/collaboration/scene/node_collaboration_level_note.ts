import type * as THREE from 'three';
import type { ObjectEntry } from '@/io/scene/io_types.js';
import { LevelNote } from '@/note/level_note.js';

/**
 * Returns the synced text of a level note, or an empty string for any other
 * object, for change fingerprints.
 *
 * @param object Scene object.
 * @returns Note text as JSON.
 */
export function nodeLevelNoteSyncText(object: THREE.Object3D): string {
  return LevelNote.is(object) ? JSON.stringify(LevelNote.read(object)) : '';
}

/**
 * Applies a received note text to an existing note marker.
 *
 * @param object Existing scene object.
 * @param entry Received entry.
 */
export function nodeLevelNoteApply(object: THREE.Object3D, entry: ObjectEntry): void {
  if (!LevelNote.is(object) || entry.levelNote === undefined) return;
  LevelNote.write(object, LevelNote.normalize(entry.levelNote));
}
