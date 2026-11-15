import { SOLID_SCRIPT_COMMAND_END } from '@/solid_script/commands/solid_script_commands_logic.js';
import type { SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptDocumentBlockRange,
  solidScriptDocumentLineRemove,
  solidScriptDocumentLineSet,
  solidScriptDocumentLineSplit,
  solidScriptDocumentMove,
} from '@/solid_script/document/solid_script_document_edit.js';
import type { SolidScriptEditorFocus } from './solid_script_editor_lines.js';

/** What keyboard editing needs from the line list. */
export interface SolidScriptEditorLineKeysHost {
  /** Returns the shown script. */
  document: () => SolidScriptDocument;
  /** Stores an edited script, then focuses a line. */
  edit: (document: SolidScriptDocument, focus: SolidScriptEditorFocus | null) => void;
  /** Focuses a line. */
  focus: (line: number, caret?: number) => void;
  /** Opens the configurator of a command line. */
  configure: (line: number) => void;
  /** Shows a short message. */
  notice: (text: string) => void;
}

/**
 * Keyboard editing of script lines: Enter splits a code line, Backspace joins
 * it with the line above, arrows move between lines, and Ctrl+Shift with an
 * arrow moves a command line with its block, the line-move keys of the usual
 * modeller text editor.
 */
export class SolidScriptEditorLineKeys {
  /**
   * Creates the key handling.
   *
   * @param host Line list.
   */
  constructor(private readonly host: SolidScriptEditorLineKeysHost) {}

  /**
   * Handles a key in a code line.
   *
   * @param event Key event.
   * @param input Code field.
   * @param line Line index.
   * @param take Applies typed text to the shown script before an edit.
   */
  codeKey(event: KeyboardEvent, input: HTMLInputElement, line: number, take: () => void): void {
    const caret = input.selectionStart ?? 0;
    const collapsed = caret === input.selectionEnd;
    if (event.key === 'Enter') {
      event.preventDefault();
      take();
      this.host.edit(solidScriptDocumentLineSplit(this.host.document(), line, caret), { line: line + 1, caret: 0 });
    } else if (event.key === 'Backspace' && collapsed && caret === 0 && line > 0) {
      take();
      if (this.joinUp(line)) event.preventDefault();
    } else if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && !event.shiftKey) {
      event.preventDefault();
      this.host.focus(line + (event.key === 'ArrowUp' ? -1 : 1), caret);
    }
  }

  /**
   * Handles a key on a command line.
   *
   * @param event Key event.
   * @param line Line index.
   */
  chipKey(event: KeyboardEvent, line: number): void {
    if (event.key === 'Enter' || event.key === 'F2' || event.key === ' ') {
      event.preventDefault();
      this.host.configure(line);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.remove(line);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const up = event.key === 'ArrowUp';
      if ((event.ctrlKey || event.metaKey) && event.shiftKey) this.moveStep(line, up);
      else this.host.focus(line + (up ? -1 : 1));
    }
  }

  /**
   * Moves a line, with its block when it opens one, before another line.
   *
   * @param from Line index.
   * @param to Line index to move before.
   */
  move(from: number, to: number): void {
    const document = this.host.document();
    const [first, last] = solidScriptDocumentBlockRange(document, from);
    const moved = solidScriptDocumentMove(document, from, to);
    if (moved === document) return;
    this.host.edit(moved, { line: to > last ? to - (last - first + 1) : to });
  }

  /**
   * Moves a line one step up or down.
   *
   * @param line Line index.
   * @param up True to move up.
   */
  private moveStep(line: number, up: boolean): void {
    const [, last] = solidScriptDocumentBlockRange(this.host.document(), line);
    if (up ? line > 0 : last + 1 < this.host.document().blocks.length) this.move(line, up ? line - 1 : last + 2);
  }

  /**
   * Removes a command line, with its End line when it opens a block.
   *
   * @param line Line index.
   */
  private remove(line: number): void {
    const document = this.host.document();
    const block = document.blocks[line];
    if (block?.type === 'command' && block.command === SOLID_SCRIPT_COMMAND_END) {
      this.host.notice('Remove the line that opens this block to remove its End.');
      return;
    }
    const removed = solidScriptDocumentLineRemove(document, line);
    this.host.edit(removed, { line: Math.min(line, removed.blocks.length - 1) });
  }

  /**
   * Joins a code line with the line above it.
   *
   * @param line Line index.
   * @returns True when the lines were joined.
   */
  private joinUp(line: number): boolean {
    const document = this.host.document();
    const above = document.blocks[line - 1];
    const block = document.blocks[line];
    if (block?.type !== 'code' || (above?.type !== 'code' && block.code !== '')) return false;
    const blocks = document.blocks.filter((_, index) => index !== line);
    const joined = { ...document, blocks };
    if (above?.type !== 'code') this.host.edit(joined, { line: line - 1 });
    else
      this.host.edit(solidScriptDocumentLineSet(joined, line - 1, { ...above, code: above.code + block.code }), {
        line: line - 1,
        caret: above.code.length,
      });
    return true;
  }
}
