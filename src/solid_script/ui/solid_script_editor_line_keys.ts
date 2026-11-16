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
  /** Selects lines from the first to the last, focusing the last. */
  selectRange: (first: number, last: number) => void;
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
   * the selection, Ctrl+A selects all and Ctrl+D duplicates the selection.
   * Copy, cut and paste come as clipboard events, see copy and paste.
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
    // Copy, cut and paste arrive as clipboard events, so they reach the system clipboard.
    if (command && !event.altKey && letter === 'a') return () => this.host.selectAll();
    if (command && !event.altKey && letter === 'd') return (line) => this.duplicate(line);
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
   * Copies or cuts exactly the selected lines, onto the clipboard of the event.
   *
   * @param event Copy or cut event.
   * @param cut True removes the lines too.
   */
  copy(event: ClipboardEvent | Event, cut: boolean): void {
    const document = this.host.document();
    if (document.blocks.length === 0) return;
    event.preventDefault();
    const [from, to] = this.host.selection();
    solidScriptEditorClipboardWrite(
      document.blocks.slice(from, to + 1),
      (event as ClipboardEvent).clipboardData ?? null,
    );
    const count = to - from + 1;
    if (cut) {
      const removed = solidScriptDocumentRangeRemove(document, from, to);
      this.host.edit(removed.document, removed.line);
    }
    this.host.notice(`${cut ? 'Cut' : 'Copied'} ${count} ${count === 1 ? 'line' : 'lines'}.`);
  }

  /**
   * Pastes lines below the selection, with every value they had, and selects
   * them so they can be moved or copied again at once.
   *
   * @param event Paste event.
   */
  paste(event: ClipboardEvent | Event): void {
    event.preventDefault();
    const lines = solidScriptEditorClipboardRead((event as ClipboardEvent).clipboardData ?? null);
    if (!lines || lines.length === 0) return this.host.notice('Copy lines with Ctrl+C first.');
    this.insertSelected(this.host.selection()[1], lines);
    this.host.notice(`Pasted ${lines.length} ${lines.length === 1 ? 'line' : 'lines'}.`);
  }

  /**
   * Copies the selected lines, or one line, right below themselves.
   *
   * @param line Line index.
   */
  private duplicate(line: number): void {
    const [first, last] = this.rangeOf(line);
    const lines = this.host
      .document()
      .blocks.slice(first, last + 1)
      .map(({ command, values }) => ({ command, values: { ...values } }));
    this.insertSelected(last, lines);
    this.host.notice(`Duplicated ${lines.length} ${lines.length === 1 ? 'line' : 'lines'}.`);
  }

  /**
   * Inserts lines below a line and selects them.
   *
   * @param below Line index.
   * @param lines Lines.
   */
  private insertSelected(below: number, lines: readonly { command: string; values?: Record<string, string> }[]): void {
    const inserted = solidScriptDocumentLinesInsert(this.host.document(), below, lines);
    this.host.edit(inserted.document, inserted.line + lines.length - 1);
    this.host.selectRange(inserted.line, inserted.line + lines.length - 1);
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
