import { SOLID_SCRIPT_COMMAND_END } from '@/solid_script/commands/solid_script_commands_logic.js';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import {
  SOLID_SCRIPT_DOCUMENT_VERSION,
  solidScriptBlockCodeCreate,
  type SolidScriptDocument,
} from '@/solid_script/document/solid_script_document.js';
import { solidScriptBlockSource } from '@/solid_script/document/solid_script_document_source.js';
import {
  solidScriptDocumentDepths,
  solidScriptLineBraces,
} from '@/solid_script/document/solid_script_document_indent.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';
import { SolidScriptEditorDrop, type SolidScriptEditorDropTarget } from './solid_script_editor_drop.js';
import { solidScriptEditorRowBuild, type SolidScriptEditorRowHandlers } from './solid_script_editor_row.js';
import { SolidScriptEditorLineKeys } from './solid_script_editor_line_keys.js';

/** Where the keyboard focus goes after an edit. */
export interface SolidScriptEditorFocus {
  /** Line index. */
  line: number;
  /** Caret position in a code line. */
  caret?: number;
}

/** Lines the debugger and the last run point at, as 0-based indices. */
export interface SolidScriptEditorMarks {
  /** Line of the step shown, or null. */
  stepped: number | null;
  /** Line of the error, or null. */
  failed: number | null;
}

/** What the line list asks of the editor. */
export interface SolidScriptEditorLinesHandlers {
  /** Stores an edited script, then focuses a line. */
  edit: (document: SolidScriptDocument, focus: SolidScriptEditorFocus | null) => void;
  /** Opens the configurator of a command line. */
  configure: (line: number) => void;
  /** Inserts a palette command at a drop target. */
  insert: (command: string, target: SolidScriptEditorDropTarget) => void;
  /** Shows a short message. */
  notice: (text: string) => void;
}

/** How long typing pauses before a code line is stored, in ms. */
const SOLID_SCRIPT_EDITOR_TYPING_MS = 700;

/**
 * The script itself: one row per line, code lines as text fields and command
 * lines as chips that open their configurator.
 */
export class SolidScriptEditorLines {
  /** Line list element. */
  readonly element: HTMLElement;
  private document: SolidScriptDocument = { version: SOLID_SCRIPT_DOCUMENT_VERSION, blocks: [] };
  private caretLine = 0;
  private layout = '';
  private pending: { line: number; code: string } | null = null;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly keys: SolidScriptEditorLineKeys;

  /**
   * Creates the line list.
   *
   * @param handlers Editor callbacks.
   */
  constructor(private readonly handlers: SolidScriptEditorLinesHandlers) {
    this.element = document.createElement('div');
    this.element.className = SOLID_SCRIPT_EDITOR_CLASSES.lines;
    this.element.setAttribute('role', 'list');
    this.element.setAttribute('aria-label', 'Script');
    this.keys = new SolidScriptEditorLineKeys({
      document: () => this.document,
      edit: (document, focus) => this.edit(document, focus),
      focus: (line, caret) => this.focusLine(line, caret),
      configure: handlers.configure,
      notice: handlers.notice,
    });
    new SolidScriptEditorDrop(this.element, {
      blank: (line) => this.blank(line),
      count: () => this.document.blocks.length,
      insert: (command, target) => this.edit(null, null) || handlers.insert(command, target),
      move: (from, target) => this.keys.move(from, target.line),
    });
    this.element.addEventListener('mousedown', (event) => this.backgroundDown(event));
  }

  /**
   * Shows a script, keeping the focused line and caret unless told otherwise.
   *
   * @param document Script.
   * @param focus Line to focus afterwards, or null to keep the current focus.
   */
  render(document: SolidScriptDocument, focus: SolidScriptEditorFocus | null): void {
    const kept = focus ?? this.focused();
    this.document = document;
    this.caretLine = Math.max(0, Math.min(this.caretLine, document.blocks.length - 1));
    const depths = solidScriptDocumentDepths(document);
    const closes = solidScriptEditorClosedBlocks(document);
    const layout = solidScriptEditorLayoutKey(document, depths, closes);
    const rebuilt = layout !== this.layout;
    this.layout = layout;
    if (rebuilt) this.rowsBuild(depths, closes);
    else this.codePatch();
    if (kept && (rebuilt || focus)) this.focusLine(kept.line, kept.caret);
    this.currentMark();
  }

  /**
   * Rebuilds every row.
   *
   * @param depths Block depth per line.
   * @param closes Closed block name per line.
   */
  private rowsBuild(depths: readonly number[], closes: readonly string[]): void {
    const handlers = this.rowHandlers();
    this.element.replaceChildren(
      ...this.document.blocks.map((block, line) =>
        solidScriptEditorRowBuild(block, { line, depth: depths[line] ?? 0, closes: closes[line] ?? '' }, handlers),
      ),
    );
  }

  /**
   * Writes changed code into the existing text fields, leaving the focused one
   * alone.
   */
  private codePatch(): void {
    const active = this.element.ownerDocument.activeElement;
    this.document.blocks.forEach((block, line) => {
      const input = this.rowAt(line)?.querySelector<HTMLInputElement>(`.${SOLID_SCRIPT_EDITOR_CLASSES.code}`);
      if (block.type === 'code' && input && input !== active && input.value !== block.code) input.value = block.code;
    });
  }

  /**
   * Highlights the debugger step and the error line.
   *
   * @param marks Lines to highlight.
   */
  mark(marks: SolidScriptEditorMarks): void {
    for (const row of this.rows()) {
      const line = Number(row.dataset['line']);
      row.classList.toggle(SOLID_SCRIPT_EDITOR_CLASSES.stepped, line === marks.stepped);
      row.classList.toggle(SOLID_SCRIPT_EDITOR_CLASSES.failed, line === marks.failed);
    }
    if (marks.stepped !== null) this.rowAt(marks.stepped)?.scrollIntoView?.({ block: 'nearest' });
  }

  /**
   * Returns the line commands are inserted at.
   *
   * @returns Line index.
   */
  caret(): number {
    return this.caretLine;
  }

  /**
   * Returns whether typed text waits to be stored.
   *
   * @returns True while typing.
   */
  typing(): boolean {
    return this.pending !== null;
  }

  /** Stores typed text now. */
  flush(): void {
    this.edit(null, null);
  }

  /**
   * Focuses a line.
   *
   * @param line Line index, clamped to the script.
   * @param caret Caret position in a code line, or the end when omitted.
   */
  focusLine(line: number, caret?: number): void {
    const row = this.rowAt(Math.max(0, Math.min(line, this.document.blocks.length - 1)));
    const target = row?.querySelector<HTMLElement>(
      `.${SOLID_SCRIPT_EDITOR_CLASSES.code}, .${SOLID_SCRIPT_EDITOR_CLASSES.chip}`,
    );
    if (!target) return;
    target.focus();
    if (target instanceof HTMLInputElement) {
      const at = Math.min(caret ?? target.value.length, target.value.length);
      target.setSelectionRange(at, at);
    }
    row?.scrollIntoView?.({ block: 'nearest' });
  }

  /**
   * Stores typed text, then an optional edit of the stored script.
   *
   * @param document Edited script, or null to only store typed text.
   * @param focus Line to focus afterwards.
   * @returns False, so it chains before other handlers.
   */
  private edit(document: SolidScriptDocument | null, focus: SolidScriptEditorFocus | null): false {
    const typed = this.typedDocument();
    if (typed) this.handlers.edit(typed, document ? null : focus);
    if (document) this.handlers.edit(document, focus);
    return false;
  }

  /**
   * Applies typed text to the shown script and forgets it.
   *
   * @returns Script with the typed text, or null when nothing was typed.
   */
  private typedDocument(): SolidScriptDocument | null {
    if (this.pendingTimer !== null) clearTimeout(this.pendingTimer);
    this.pendingTimer = null;
    const pending = this.pending;
    this.pending = null;
    const block = pending ? this.document.blocks[pending.line] : undefined;
    if (!pending || block?.type !== 'code' || block.code === pending.code) return null;
    const blocks = this.document.blocks.map((current, line) =>
      line === pending.line ? { ...block, code: pending.code } : current,
    );
    this.document = { ...this.document, blocks };
    return this.document;
  }

  /**
   * Returns the callbacks every row uses.
   *
   * @returns Row handlers.
   */
  private rowHandlers(): SolidScriptEditorRowHandlers {
    return {
      codeKey: (event, input, line) => this.keys.codeKey(event, input, line, () => this.typedDocument()),
      codeInput: (line, code) => this.typed(line, code),
      codeBlur: () => this.flush(),
      chipKey: (event, line) => this.keys.chipKey(event, line),
      configure: (line) => this.edit(null, null) || this.handlers.configure(line),
      focus: (line) => this.caretSet(line),
    };
  }

  /**
   * Remembers typed text and stores it once typing pauses.
   *
   * @param line Line index.
   * @param code Line text.
   */
  private typed(line: number, code: string): void {
    if (this.pending && this.pending.line !== line) this.flush();
    this.pending = { line, code };
    if (this.pendingTimer !== null) clearTimeout(this.pendingTimer);
    this.pendingTimer = setTimeout(() => this.flush(), SOLID_SCRIPT_EDITOR_TYPING_MS);
  }

  /**
   * Moves the caret line.
   *
   * @param line Line index.
   */
  private caretSet(line: number): void {
    this.caretLine = line;
    this.currentMark();
  }

  /** Highlights the caret line. */
  private currentMark(): void {
    for (const row of this.rows())
      row.classList.toggle(SOLID_SCRIPT_EDITOR_CLASSES.current, Number(row.dataset['line']) === this.caretLine);
  }

  /**
   * Adds a blank line when the empty space below the script is clicked.
   *
   * @param event Mouse event.
   */
  private backgroundDown(event: MouseEvent): void {
    if (event.target !== this.element) return;
    event.preventDefault();
    const last = this.document.blocks.length - 1;
    if (this.blank(last)) return this.focusLine(last);
    this.edit(
      { ...this.document, blocks: [...this.document.blocks, solidScriptBlockCodeCreate('')] },
      { line: last + 1 },
    );
  }

  /**
   * Returns the focused line and caret.
   *
   * @returns Focus, or null when no line is focused.
   */
  private focused(): SolidScriptEditorFocus | null {
    const active = this.element.ownerDocument.activeElement as HTMLElement | null;
    const row =
      active && this.element.contains(active)
        ? active.closest<HTMLElement>(`.${SOLID_SCRIPT_EDITOR_CLASSES.row}`)
        : null;
    if (!row) return null;
    const line = Number(row.dataset['line']);
    return active instanceof HTMLInputElement ? { line, caret: active.selectionStart ?? 0 } : { line };
  }

  /**
   * Returns whether a line is blank code.
   *
   * @param line Line index.
   * @returns True when blank.
   */
  private blank(line: number): boolean {
    const block = this.document.blocks[line];
    return block?.type === 'code' && block.code.trim() === '';
  }

  /**
   * Returns the rows.
   *
   * @returns Row elements.
   */
  private rows(): HTMLElement[] {
    return [...this.element.querySelectorAll<HTMLElement>(`.${SOLID_SCRIPT_EDITOR_CLASSES.row}`)];
  }

  /**
   * Returns the row of a line.
   *
   * @param line Line index.
   * @returns Row, or null.
   */
  private rowAt(line: number): HTMLElement | null {
    return this.element.querySelector<HTMLElement>(`.${SOLID_SCRIPT_EDITOR_CLASSES.row}[data-line="${line}"]`);
  }
}

/**
 * Names the block every End line closes, such as "Difference".
 *
 * @param document Script.
 * @returns Name per line, empty for other lines.
 */
function solidScriptEditorClosedBlocks(document: SolidScriptDocument): string[] {
  const open: string[] = [];
  return document.blocks.map((block) => {
    const braces = solidScriptLineBraces(solidScriptBlockSource(block));
    const closed = braces.leadingClose ? (open.pop() ?? '') : '';
    const label = block.type === 'command' ? (solidScriptCommandFind(block.command)?.label ?? 'Block') : 'Block';
    for (let count = 0; count < braces.balance + (braces.leadingClose ? 1 : 0); count++) open.push(label);
    return block.type === 'command' && block.command === SOLID_SCRIPT_COMMAND_END ? closed : '';
  });
}

/**
 * Describes everything about a script's rows except the text of code lines, so
 * typing does not rebuild them.
 *
 * @param document Script.
 * @param depths Block depth per line.
 * @param closes Closed block name per line.
 * @returns Layout text.
 */
function solidScriptEditorLayoutKey(
  document: SolidScriptDocument,
  depths: readonly number[],
  closes: readonly string[],
): string {
  const rows = document.blocks.map((block) => (block.type === 'code' ? ['code', block.id] : block));
  return JSON.stringify([rows, depths, closes]);
}
