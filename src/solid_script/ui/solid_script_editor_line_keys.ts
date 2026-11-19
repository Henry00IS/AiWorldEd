import type { SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptBlockIsBlank,
  solidScriptDocumentBlankInsert,
  solidScriptDocumentLinesInsert,
  solidScriptDocumentLinesMove,
  solidScriptDocumentLinesRemove,
  solidScriptDocumentLinesToggle,
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
  /** Returns the selected lines in order: a Shift range or Ctrl-picked lines. */
  selected: () => number[];
  /** Selects every line. */
  selectAll: () => void;
  /** Selects lines from the first to the last, focusing the last. */
  selectRange: (first: number, last: number) => void;
  select: (lines: readonly number[]) => void;
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
   * Ctrl+Shift+arrows move the line), Enter or F2 configure it, Space adds a
   * blank line above, Shift+Enter or Insert add one below, Delete or Backspace
   * remove the selection, Ctrl+A selects all and Ctrl+D duplicates the
   * selection. Copy, cut and paste come as clipboard events, see copy and
   * paste.
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
    const lines = this.linesOf(from);
    const moved = solidScriptDocumentLinesMove(this.host.document(), lines, to);
    if (moved.document !== this.host.document()) this.host.edit(moved.document, moved.line + lines.indexOf(from));
  }

  /**
   * Lands dragged lines before another line: the selected lines, or the dragged
   * line alone. Every line moves on its own, openers and End lines too. The
   * moved lines stay selected, so they can be dragged again.
   *
   * @param from Dragged line; the selection moves when it holds this line.
   * @param to Line index to move before.
   */
  drag(from: number, to: number): void {
    const document = this.host.document();
    const lines = this.linesOf(from);
    const moved = solidScriptDocumentLinesMove(document, lines, to);
    if (moved.document === document) return;
    this.host.edit(moved.document, moved.line + lines.indexOf(from));
    if (lines.length > 1) this.host.select(lines.map((_, index) => moved.line + index));
  }

  /**
   * Returns the selected lines when they hold a line, or the line alone.
   *
   * @param line Line index.
   * @returns Line indexes in order.
   */
  private linesOf(line: number): number[] {
    const selected = this.host.selected();
    return selected.includes(line) ? selected : [line];
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
    if ((command && !event.altKey && event.key === '/') || (!command && event.key === 'F4'))
      return (line) => this.toggle(line);
    if (command || event.altKey) return null;
    if (event.key === ' ') return (line) => this.blank(line - 1, line + 1);
    if ((event.key === 'Enter' && event.shiftKey) || event.key === 'Insert') return (line) => this.blank(line);
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
    const selected = this.host.selected();
    solidScriptEditorClipboardWrite(
      selected.map((line) => document.blocks[line]!),
      (event as ClipboardEvent).clipboardData ?? null,
    );
    const count = selected.length;
    if (cut) {
      const removed = solidScriptDocumentLinesRemove(document, selected);
      this.host.edit(removed.document, removed.line);
    }
    this.host.notice(`${cut ? 'Cut' : 'Copied'} ${count} ${count === 1 ? 'line' : 'lines'}.`);
  }

  /**
   * Pastes lines above the selection, or into a selected blank line, with every
   * value they had, and selects them so they can be moved or copied again at
   * once.
   *
   * @param event Paste event.
   */
  paste(event: ClipboardEvent | Event): void {
    event.preventDefault();
    const lines = solidScriptEditorClipboardRead((event as ClipboardEvent).clipboardData ?? null);
    if (!lines || lines.length === 0) return this.host.notice('Copy lines with Ctrl+C first.');
    const first = this.host.selected()[0] ?? 0;
    const blank = solidScriptBlockIsBlank(this.host.document().blocks[first]);
    this.insertSelected(blank ? first : first - 1, lines, !blank);
    this.host.notice(`Pasted ${lines.length} ${lines.length === 1 ? 'line' : 'lines'}.`);
  }

  /**
   * Turns the selected lines, or one line, off or on again.
   *
   * @param line Line index.
   */
  toggle(line: number): void {
    const lines = this.linesOf(line);
    const toggled = solidScriptDocumentLinesToggle(this.host.document(), lines);
    if (toggled.count === 0) return this.host.notice('End and Else lines follow the line that opens their block.');
    const selected = this.host.selected();
    this.host.edit(toggled.document, line);
    if (selected.length > 1) this.host.select(selected);
    const count = `${toggled.count} ${toggled.count === 1 ? 'line' : 'lines'}`;
    this.host.notice(toggled.off ? `Turned ${count} off; F4 turns them on again.` : `Turned ${count} on.`);
  }

  /**
   * Copies the selected lines, or one line, right below themselves.
   *
   * @param line Line index.
   */
  duplicate(line: number): void {
    const picked = this.linesOf(line);
    const blocks = this.host.document().blocks;
    const lines = picked
      .map((at) => blocks[at]!)
      .map(({ command, values, off }) => ({ command, values: { ...values }, ...(off ? { off } : {}) }));
    this.insertSelected(picked.at(-1) ?? line, lines);
    this.host.notice(`Duplicated ${lines.length} ${lines.length === 1 ? 'line' : 'lines'}.`);
  }

  /**
   * Inserts lines below a line and selects them.
   *
   * @param below Line index; -1 inserts at the top.
   * @param lines Lines.
   * @param keepBlank True never fills a blank line at below.
   */
  private insertSelected(
    below: number,
    lines: readonly { command: string; values?: Record<string, string> }[],
    keepBlank = false,
  ): void {
    const inserted = solidScriptDocumentLinesInsert(this.host.document(), below, lines, keepBlank);
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
    const lines = this.linesOf(line);
    const first = lines[0] ?? line;
    const last = lines.at(-1) ?? line;
    if (up ? first > 0 : last + 1 < this.host.document().blocks.length) this.move(line, up ? first - 1 : last + 2);
  }

  /**
   * Adds a blank line below a line; -1 adds it as the first line, so Space
   * passes the line above its own. Shift+Enter moves down onto the new line,
   * Space moves down with its line, which the blank pushed one line down.
   *
   * @param line Line index.
   * @param focus Line to focus afterwards; the new line when left out.
   */
  private blank(line: number, focus?: number): void {
    const inserted = solidScriptDocumentBlankInsert(this.host.document(), line);
    this.host.edit(inserted.document, focus ?? inserted.line);
  }

  /**
   * Removes the selected lines, or the current line, exactly as selected: an
   * End goes alone too, and the script then names the line that misses it.
   *
   * @param line Line index.
   */
  remove(line: number): void {
    const removed = solidScriptDocumentLinesRemove(this.host.document(), this.linesOf(line));
    this.host.edit(removed.document, removed.line);
  }
}
