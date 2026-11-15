import { solidScriptDocumentCreate, type SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentDepths } from '@/solid_script/document/solid_script_document_indent.js';
import {
  solidScriptBlockIsBlank,
  solidScriptDocumentBlankInsert,
} from '@/solid_script/document/solid_script_document_edit.js';
import { solidScriptDocumentClosedBlocks } from '@/solid_script/document/solid_script_document_listing.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';
import { SolidScriptEditorDrop, type SolidScriptEditorDropTarget } from './solid_script_editor_drop.js';
import { solidScriptEditorRowBuild, type SolidScriptEditorRowHandlers } from './solid_script_editor_row.js';
import { SolidScriptEditorLineKeys } from './solid_script_editor_line_keys.js';

/** Lines the debugger and the last run point at, as 0-based indices. */
export interface SolidScriptEditorMarks {
  /** Line of the step shown, or null. */
  stepped: number | null;
  /** Line of the error, or null. */
  failed: number | null;
  /** Lines the run has passed when tracing, empty otherwise. */
  traced: ReadonlySet<number>;
}

/** What the line list asks of the editor. */
export interface SolidScriptEditorLinesHandlers {
  /** Stores an edited script, then focuses a line. */
  edit: (document: SolidScriptDocument, line: number) => void;
  /** Opens the configurator of a line. */
  configure: (line: number) => void;
  /** Inserts a palette command at a drop target. */
  insert: (command: string, target: SolidScriptEditorDropTarget) => void;
  /** The current line changed. */
  select: (line: number) => void;
  /** Shows a short message. */
  notice: (text: string) => void;
}

/**
 * The script itself: one row per command line. Nothing is typed; lines are
 * inserted from the palette, configured, moved and removed.
 */
export class SolidScriptEditorLines {
  /** Line list element. */
  readonly element: HTMLElement;
  private document: SolidScriptDocument = solidScriptDocumentCreate([]);
  private caretLine = 0;
  private layout = '';
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
      edit: handlers.edit,
      focus: (line) => this.focusLine(line),
      configure: handlers.configure,
      notice: handlers.notice,
    });
    new SolidScriptEditorDrop(this.element, {
      blank: (line) => solidScriptBlockIsBlank(this.document.blocks[line]),
      count: () => this.document.blocks.length,
      insert: handlers.insert,
      move: (from, target) => this.keys.move(from, target.line),
    });
    this.element.addEventListener('mousedown', (event) => this.backgroundDown(event));
  }

  /**
   * Shows a script; rows are rebuilt only when a line changed.
   *
   * @param document Script.
   * @param focus Line to focus afterwards, or null to keep the current focus.
   */
  render(document: SolidScriptDocument, focus: number | null): void {
    const kept = focus ?? this.focused();
    this.document = document;
    this.caretLine = Math.max(0, Math.min(focus ?? this.caretLine, document.blocks.length - 1));
    const depths = solidScriptDocumentDepths(document);
    const closes = solidScriptDocumentClosedBlocks(document);
    const layout = JSON.stringify([document.blocks, depths, closes]);
    const rebuilt = layout !== this.layout;
    this.layout = layout;
    if (rebuilt) this.rowsBuild(depths, closes);
    if (kept !== null && (rebuilt || focus !== null)) this.focusLine(kept);
    this.currentMark();
  }

  /**
   * Highlights the debugger step in its own green, the error line and traced
   * lines; each mark explains itself on hover.
   *
   * @param marks Lines to highlight.
   */
  mark(marks: SolidScriptEditorMarks): void {
    for (const row of this.rows()) {
      const line = Number(row.dataset['line']);
      row.classList.toggle(SOLID_SCRIPT_EDITOR_CLASSES.stepped, line === marks.stepped);
      row.classList.toggle(SOLID_SCRIPT_EDITOR_CLASSES.failed, line === marks.failed);
      row.classList.toggle(SOLID_SCRIPT_EDITOR_CLASSES.traced, marks.traced.has(line));
      if (line === marks.stepped) row.title = 'Debugger step: the script is built up to this line';
      else if (marks.traced.has(line)) row.title = 'Traced: the debugger has passed this line';
      else row.removeAttribute('title');
    }
    if (marks.stepped !== null) this.rowAt(marks.stepped)?.scrollIntoView?.({ block: 'nearest' });
  }

  /**
   * Returns the current line, where palette commands are inserted.
   *
   * @returns Line index.
   */
  caret(): number {
    return this.caretLine;
  }

  /**
   * Focuses a line.
   *
   * @param line Line index, clamped to the script.
   */
  focusLine(line: number): void {
    const row = this.rowAt(Math.max(0, Math.min(line, this.document.blocks.length - 1)));
    row?.querySelector<HTMLElement>(`.${SOLID_SCRIPT_EDITOR_CLASSES.chip}`)?.focus();
    row?.scrollIntoView?.({ block: 'nearest' });
  }

  /**
   * Rebuilds every row.
   *
   * @param depths Block depth per line.
   * @param closes Closed block name per line.
   */
  private rowsBuild(depths: readonly number[], closes: readonly string[]): void {
    const handlers: SolidScriptEditorRowHandlers = {
      key: (event, line) => this.keys.key(event, line),
      configure: this.handlers.configure,
      focus: (line) => this.caretSet(line),
    };
    this.element.replaceChildren(
      ...this.document.blocks.map((block, line) =>
        solidScriptEditorRowBuild(block, { line, depth: depths[line] ?? 0, closes: closes[line] ?? '' }, handlers),
      ),
    );
  }

  /**
   * Moves the current line.
   *
   * @param line Line index.
   */
  private caretSet(line: number): void {
    this.caretLine = line;
    this.currentMark();
    this.handlers.select(line);
  }

  /** Highlights the current line. */
  private currentMark(): void {
    for (const row of this.rows())
      row.classList.toggle(SOLID_SCRIPT_EDITOR_CLASSES.current, Number(row.dataset['line']) === this.caretLine);
  }

  /**
   * Adds a blank line, or focuses the last one, when the empty space below the
   * script is clicked.
   *
   * @param event Mouse event.
   */
  private backgroundDown(event: MouseEvent): void {
    if (event.target !== this.element) return;
    event.preventDefault();
    const last = this.document.blocks.length - 1;
    if (solidScriptBlockIsBlank(this.document.blocks[last])) return this.focusLine(last);
    const inserted = solidScriptDocumentBlankInsert(this.document, last);
    this.handlers.edit(inserted.document, inserted.line);
  }

  /**
   * Returns the focused line.
   *
   * @returns Line index, or null when no line is focused.
   */
  private focused(): number | null {
    const active = this.element.ownerDocument.activeElement as HTMLElement | null;
    const row =
      active && this.element.contains(active)
        ? active.closest<HTMLElement>(`.${SOLID_SCRIPT_EDITOR_CLASSES.row}`)
        : null;
    return row ? Number(row.dataset['line']) : null;
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
