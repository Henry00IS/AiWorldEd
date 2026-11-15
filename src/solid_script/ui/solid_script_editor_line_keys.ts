import type { SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptDocumentBlankInsert,
  solidScriptDocumentBlockRange,
  solidScriptDocumentLineRemove,
  solidScriptDocumentLinesInsert,
  solidScriptDocumentMove,
  solidScriptDocumentRangeRemove,
  solidScriptDocumentRangeWhole,
} from '@/solid_script/document/solid_script_document_edit.js';
import { solidScriptBlockNesting } from '@/solid_script/document/solid_script_document_indent.js';
import { solidScriptEditorClipboardRead, solidScriptEditorClipboardWrite } from './solid_script_editor_clipboard.js';

/** What the line keys act on. */
export interface SolidScriptEditorLineKeysHost {
  /** Current script. */
  document: () => SolidScriptDocument;
  /** Stores an edited script, then focuses a line. */
  edit: (document: SolidScriptDocument, line: number) => void;
  /** Focuses a line; true grows the selection to it. */
  focus: (line: number, extend: boolean) => void;
  /** Selected lines, first and last. */
  selection: () => [number, number];
  /** Selects every line. */
  selectAll: () => void;
  /** Opens the configurator of a line. */
  configure: (line: number) => void;
  /** Shows a short message. */
  notice: (text: string) => void;
}

/**
 * Keyboard handling of command lines: there is no typing, only navigation,
 * selecting, configuring, inserting blank lines, copying, deleting and moving
 * lines.
 */
export class SolidScriptEditorLineKeys {
  /**
   * Creates the key handling.
   *
   * @param host Editor callbacks.
   */
  constructor(private readonly host: SolidScriptEditorLineKeysHost) {}

  /**
   * Handles a key on a line: arrows move the focus (Shift+arrows select,
   * Ctrl+Shift+arrows move the line), Enter or F2 configure it, Space,
   * Shift+Enter or Insert add a blank line below, Delete or Backspace remove
   * the selection, Ctrl+A selects all and Ctrl+C, Ctrl+X and Ctrl+V copy, cut
   * and paste lines.
   *
   * @param event Key event.
   * @param line Line index.
   */
  key(event: KeyboardEvent, line: number): void {
    const action = this.action(event);
    if (!action) return;
    event.preventDefault();
    action(line);
  }

  /**
   * Moves a line, or a block opener with its block, before another line.
   *
   * @param from Line index.
   * @param to Line index to move before.
   */
  move(from: number, to: number): void {
    const document = this.host.document();
    const [first, last] = solidScriptDocumentBlockRange(document, from);
    const moved = solidScriptDocumentMove(document, from, to);
    if (moved !== document) this.host.edit(moved, to > last ? to - (last - first + 1) : to);
  }

  /**
   * Picks what a key does.
   *
   * @param event Key event.
   * @returns Action on the line, or null for keys left alone.
   */
  private action(event: KeyboardEvent): ((line: number) => void) | null {
    const arrow = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (arrow !== 0 && (event.ctrlKey || event.metaKey) && event.shiftKey)
      return (line) => this.moveStep(line, arrow < 0);
    if (arrow !== 0) return (line) => this.host.focus(line + arrow, event.shiftKey);
    const command = event.ctrlKey || event.metaKey;
    const letter = event.key.toLowerCase();
    if (command && !event.altKey && ['a', 'c', 'x', 'v'].includes(letter)) return () => this.clipboard(letter);
    if (command || event.altKey) return null;
    if ((event.key === 'Enter' && event.shiftKey) || event.key === 'Insert' || event.key === ' ')
      return (line) => this.blank(line);
    if (event.key === 'Enter' || event.key === 'F2') return (line) => this.host.configure(line);
    if (event.key === 'Delete' || event.key === 'Backspace') return (line) => this.remove(line);
    if (event.key === 'Home' || event.key === 'End')
      return () => this.host.focus(event.key === 'Home' ? 0 : this.host.document().blocks.length - 1, event.shiftKey);
    return null;
  }

  /**
   * Selects all, copies, cuts or pastes. Copies and cuts take whole blocks, so
   * an opener comes with its End; pasted lines go below the current line.
   *
   * @param letter A, c, x or v.
   */
  private clipboard(letter: string): void {
    const document = this.host.document();
    if (letter === 'a') return this.host.selectAll();
    const [first, last] = this.host.selection();
    if (letter === 'v') {
      const lines = solidScriptEditorClipboardRead();
      if (!lines || lines.length === 0) return this.host.notice('Copy lines with Ctrl+C first.');
      const pasted = solidScriptDocumentLinesInsert(document, last, lines);
      this.host.edit(pasted.document, pasted.line);
      return this.host.notice(`Pasted ${lines.length} ${lines.length === 1 ? 'line' : 'lines'}.`);
    }
    if (document.blocks.length === 0) return;
    const [from, to] = solidScriptDocumentRangeWhole(document, first, last);
    solidScriptEditorClipboardWrite(document.blocks.slice(from, to + 1));
    const count = to - from + 1;
    if (letter === 'x') {
      const removed = solidScriptDocumentRangeRemove(document, from, to);
      this.host.edit(removed.document, removed.line);
    }
    this.host.notice(`${letter === 'x' ? 'Cut' : 'Copied'} ${count} ${count === 1 ? 'line' : 'lines'}.`);
  }

  /**
   * Moves a line or block one line up or down.
   *
   * @param line Line index.
   * @param up True moves up.
   */
  private moveStep(line: number, up: boolean): void {
    const [, last] = solidScriptDocumentBlockRange(this.host.document(), line);
    if (up ? line > 0 : last + 1 < this.host.document().blocks.length) this.move(line, up ? line - 1 : last + 2);
  }

  /**
   * Adds a blank line below a line.
   *
   * @param line Line index.
   */
  private blank(line: number): void {
    const inserted = solidScriptDocumentBlankInsert(this.host.document(), line);
    this.host.edit(inserted.document, inserted.line);
  }

  /**
   * Removes the selected lines with their whole blocks, or the current line
   * alone; a lone End line only goes with the line that opens its block.
   *
   * @param line Line index.
   */
  private remove(line: number): void {
    const document = this.host.document();
    const [first, last] = this.host.selection();
    if (last > first) {
      const removed = solidScriptDocumentRangeRemove(document, first, last);
      this.host.edit(removed.document, removed.line);
      return;
    }
    if (solidScriptBlockNesting(document.blocks[line]) === 'close') {
      this.host.notice('Remove the line that opens this block to remove its End.');
      return;
    }
    const removed = solidScriptDocumentLineRemove(document, line);
    this.host.edit(removed, Math.min(line, removed.blocks.length - 1));
  }
}
