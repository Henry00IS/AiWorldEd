import type * as THREE from 'three';
import type { UndoCommand } from '@/commands/command_undo.js';
import { LevelNote, type LevelNoteData } from './level_note.js';

/** Undoable edit of the text of a level note. */
export class CommandLevelNoteSet implements UndoCommand {
  private readonly note: THREE.Object3D;
  private readonly before: LevelNoteData;
  private readonly after: LevelNoteData;

  /**
   * Creates the command.
   *
   * @param note Note marker.
   * @param before Note before the edit.
   * @param after Note after the edit.
   */
  constructor(note: THREE.Object3D, before: LevelNoteData, after: LevelNoteData) {
    this.note = note;
    this.before = LevelNote.normalize(before);
    this.after = LevelNote.normalize(after);
  }

  /** Writes the edited note. */
  execute(): void {
    LevelNote.write(this.note, this.after);
  }

  /** Restores the previous note. */
  undo(): void {
    LevelNote.write(this.note, this.before);
  }
}
