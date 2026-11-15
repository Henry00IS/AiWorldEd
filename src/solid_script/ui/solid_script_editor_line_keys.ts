import type { SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptDocumentBlankInsert,
  solidScriptDocumentBlockRange,
  solidScriptDocumentLineRemove,
  solidScriptDocumentMove,
} from '@/solid_script/document/solid_script_document_edit.js';
import { solidScriptBlockNesting } from '@/solid_script/document/solid_script_document_indent.js';

/** What the line keys act on. */
export interface SolidScriptEditorLineKeysHost {
  /** Current script. */
  document: () => SolidScriptDocument;
  /** Stores an edited script, then focuses a line. */
  edit: (document: SolidScriptDocument, line: number) => void;
  /** Focuses a line. */
  focus: (line: number) => void;
  /** Opens the configurator of a line. */
  configure: (line: number) => void;
  /** Shows a short message. */
  notice: (text: string) => void;
}

/**
 * Keyboard handling of command lines: there is no typing, only navigation,
 * configuring, inserting blank lines, deleting and moving lines.
 */
export class SolidScriptEditorLineKeys {
  /**
   * Creates the key handling.
   *
   * @param host Editor callbacks.
   */
  constructor(private readonly host: SolidScriptEditorLineKeysHost) {}

  /**
   * Handles a key on a line: arrows move the focus (Ctrl+Shift+arrows move the
   * line), Enter, F2 or Space configure it, Shift+Enter or Insert add a blank
   * line below, Delete or Backspace remove it.
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
    if (arrow !== 0) return (line) => this.host.focus(line + arrow);
    if ((event.key === 'Enter' && event.shiftKey) || event.key === 'Insert') return (line) => this.blank(line);
    if (event.key === 'Enter' || event.key === 'F2' || event.key === ' ') return (line) => this.host.configure(line);
    if (event.key === 'Delete' || event.key === 'Backspace') return (line) => this.remove(line);
    if (event.key === 'Home' || event.key === 'End')
      return () => this.host.focus(event.key === 'Home' ? 0 : this.host.document().blocks.length - 1);
    return null;
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
   * Removes a line; an End line only goes with the line that opens its block.
   *
   * @param line Line index.
   */
  private remove(line: number): void {
    const document = this.host.document();
    if (solidScriptBlockNesting(document.blocks[line]) === 'close') {
      this.host.notice('Remove the line that opens this block to remove its End.');
      return;
    }
    const removed = solidScriptDocumentLineRemove(document, line);
    this.host.edit(removed, Math.min(line, removed.blocks.length - 1));
  }
}
