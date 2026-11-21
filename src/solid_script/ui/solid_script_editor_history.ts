import type { Object3D } from 'three';
import type { SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentLinesCarry } from '@/solid_script/document/solid_script_document_lines.js';

/** Most script edits one history keeps. */
const SOLID_SCRIPT_EDITOR_HISTORY_LIMIT = 200;

/** One script edit: the script before and after it. */
interface SolidScriptEditorHistoryStep {
  before: SolidScriptDocument;
  after: SolidScriptDocument;
}

/**
 * Histories by generator node id, then by modifier id. The id outlives the node
 * object, so a level undo that brings the generator back keeps them.
 */
const solidScriptEditorHistories = new Map<string, Map<string, SolidScriptEditorHistory>>();

/**
 * Undo and redo of one generator's script, apart from the level's undo history,
 * or of the blocks of one formula window. A step only moves the lines it
 * changed, so lines other users edited since stay as they are.
 */
export class SolidScriptEditorHistory {
  private readonly undoSteps: SolidScriptEditorHistoryStep[] = [];
  private readonly redoSteps: SolidScriptEditorHistoryStep[] = [];

  /**
   * Returns the history of a script, made on first use; it outlives the editor
   * window so reopening it keeps the steps.
   *
   * @param node Generator node.
   * @param stepId Modifier id of the script.
   * @returns History.
   */
  static of(node: Object3D, stepId: string): SolidScriptEditorHistory {
    let byStep = solidScriptEditorHistories.get(node.uuid);
    if (!byStep) {
      byStep = new Map();
      solidScriptEditorHistories.set(node.uuid, byStep);
    }
    let history = byStep.get(stepId);
    if (!history) {
      history = new SolidScriptEditorHistory();
      byStep.set(stepId, history);
    }
    return history;
  }

  /**
   * Records an edit and forgets what could be redone.
   *
   * @param before Script before the edit.
   * @param after Script after the edit.
   */
  record(before: SolidScriptDocument, after: SolidScriptDocument): void {
    this.undoSteps.push({ before: structuredClone(before), after: structuredClone(after) });
    if (this.undoSteps.length > SOLID_SCRIPT_EDITOR_HISTORY_LIMIT) this.undoSteps.shift();
    this.redoSteps.length = 0;
  }

  /**
   * Takes back the last edit on top of the current script.
   *
   * @param current Script as it is now.
   * @returns Script to store, or null when there is nothing to undo.
   */
  undo(current: SolidScriptDocument): SolidScriptDocument | null {
    const step = this.undoSteps.pop();
    if (!step) return null;
    this.redoSteps.push(step);
    return solidScriptDocumentLinesCarry(current, step.after, step.before);
  }

  /**
   * Makes the last undone edit again on top of the current script.
   *
   * @param current Script as it is now.
   * @returns Script to store, or null when there is nothing to redo.
   */
  redo(current: SolidScriptDocument): SolidScriptDocument | null {
    const step = this.redoSteps.pop();
    if (!step) return null;
    this.undoSteps.push(step);
    return solidScriptDocumentLinesCarry(current, step.before, step.after);
  }
}
