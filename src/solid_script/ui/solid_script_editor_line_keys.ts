import type { SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptDocumentBlankInsert,
  solidScriptDocumentLinesInsert,
  solidScriptDocumentRangeMove,
  solidScriptDocumentRangeRemove,
} from '@/solid_script/document/solid_script_document_edit.js';
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
   * Moves the selected lines, or one line, before another line. Lines move on
   * their own: an End stays where it is unless it is moved too.
   *
   * @param from Line index; the selection moves when it holds this line.
   * @param to Line index to move before.
   */
  move(from: number, to: number): void {
    const [first, last] = this.rangeOf(from);
    const moved = solidScriptDocumentRangeMove(this.host.document(), first, last, to);
    if (moved.document !== this.host.document()) this.host.edit(moved.document, moved.line + (from - first));
  }

  /**
   * Returns the selected lines when they hold a line, or the line alone.
   *
   * @param line Line index.
   * @returns First and last line index.
   */
  private rangeOf(line: number): [number, number] {
    const [first, last] = this.host.selection();
    return line >= first && line <= last ? [first, last] : [line, line];
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
   * Selects all, copies, cuts or pastes exactly the selected lines; pasted
   * lines go below the current line.
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
    const [from, to] = [first, last];
    solidScriptEditorClipboardWrite(document.blocks.slice(from, to + 1));
    const count = to - from + 1;
    if (letter === 'x') {
      const removed = solidScriptDocumentRangeRemove(document, from, to);
      this.host.edit(removed.document, removed.line);
    }
    this.host.notice(`${letter === 'x' ? 'Cut' : 'Copied'} ${count} ${count === 1 ? 'line' : 'lines'}.`);
  }

  /**
   * Moves the selected lines, or one line, one line up or down.
   *
   * @param line Line index.
   * @param up True moves up.
   */
  private moveStep(line: number, up: boolean): void {
    const [first, last] = this.rangeOf(line);
    if (up ? first > 0 : last + 1 < this.host.document().blocks.length) this.move(line, up ? first - 1 : last + 2);
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
   * Removes the selected lines, or the current line, exactly as selected: an
   * End goes alone too, and the script then names the line that misses it.
   *
   * @param line Line index.
   */
  private remove(line: number): void {
    const [first, last] = this.rangeOf(line);
    const removed = solidScriptDocumentRangeRemove(this.host.document(), first, last);
    this.host.edit(removed.document, removed.line);
  }
}
