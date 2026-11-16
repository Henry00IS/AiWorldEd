import { solidScriptDocumentCreate, type SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptDocumentDepths,
  solidScriptDocumentOffLines,
} from '@/solid_script/document/solid_script_document_indent.js';
import {
  solidScriptBlockIsBlank,
  solidScriptDocumentBlankInsert,
} from '@/solid_script/document/solid_script_document_edit.js';
import { solidScriptListingText } from '@/solid_script/commands/solid_script_command_listing.js';
import {
  solidScriptBlockListing,
  solidScriptDocumentClosedBlocks,
} from '@/solid_script/document/solid_script_document_listing.js';
import {
  VIRTUAL_LIST_SCROLLBAR_BIND_SCROLLER_CLASS,
  virtualListScrollbarBind,
  virtualListScrollbarBindHorizontal,
  virtualListScrollbarBindStylesEnsure,
  type VirtualListScrollbarBinding,
} from '@/ui/virtual_list/virtual_list_scrollbar_bind.js';
import type { SolidScriptLineProfile } from '@/solid_script/language/solid_script_machine.js';
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
  /** Lines that hold a breakpoint. */
  breakpoints: ReadonlySet<number>;
  /** True when the step shown is a pause at a breakpoint. */
  atBreak: boolean;
  /** How often each 1-based line ran in the last run, and its time. */
  runs: ReadonlyMap<number, SolidScriptLineProfile>;
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
  /** Sets or clears the breakpoint of a line. */
  breakpoint: (line: number) => void;
}

/** Height of every script row in pixels; fixed so only visible rows exist. */
export const SOLID_SCRIPT_EDITOR_ROW_PX = 24;

/** Space above the first row in pixels. */
const SOLID_SCRIPT_EDITOR_LINES_TOP_PX = 4;

/** Rows built beyond the visible ones on each side. */
const SOLID_SCRIPT_EDITOR_LINES_OVERSCAN = 8;

/** Width of the line number gutter in pixels. */
const SOLID_SCRIPT_EDITOR_GUTTER_PX = 44;

/**
 * Estimated width of one listing character in pixels, for the scroll width
 * before rows exist.
 */
const SOLID_SCRIPT_EDITOR_CHAR_PX = 7.3;

/** Indent per block level in pixels; matches the row indent. */
const SOLID_SCRIPT_EDITOR_LINES_INDENT_PX = 20;

/** Thickness of the custom scrollbars in pixels. */
const SOLID_SCRIPT_EDITOR_SCROLLBAR_PX = 12;

/**
 * The script itself: one row per command line, each on a single row that never
 * wraps. Nothing is typed; lines are inserted from the palette, configured,
 * moved and removed. Only the rows in view (and the current line) exist, so
 * long scripts stay fast; wide lines scroll sideways under a custom scrollbar
 * while the line numbers and breakpoints stay in place.
 */
export class SolidScriptEditorLines {
  /** Positioned box holding the scroller and its scrollbars. */
  readonly host: HTMLElement;
  /** Line list element: the scroller. */
  readonly element: HTMLElement;
  private readonly canvas: HTMLElement;
  private document: SolidScriptDocument = solidScriptDocumentCreate([]);
  private depths: number[] = [];
  private closes: string[] = [];
  /** True per line that is off. */
  private offs: boolean[] = [];
  private caretLine = 0;
  private anchor: number | null = null;
  private layout = '';
  private widest = 0;
  private marks: SolidScriptEditorMarks = {
    stepped: null,
    failed: null,
    traced: new Set(),
    breakpoints: new Set(),
    atBreak: false,
    runs: new Map(),
  };
  private readonly built = new Map<number, HTMLElement>();
  private readonly keys: SolidScriptEditorLineKeys;
  private readonly vertical: VirtualListScrollbarBinding;
  private readonly horizontal: VirtualListScrollbarBinding;

  /**
   * Creates the line list.
   *
   * @param handlers Editor callbacks.
   */
  constructor(private readonly handlers: SolidScriptEditorLinesHandlers) {
    virtualListScrollbarBindStylesEnsure();
    this.host = document.createElement('div');
    this.host.className = SOLID_SCRIPT_EDITOR_CLASSES.linesHost;
    this.element = document.createElement('div');
    this.element.className = `${SOLID_SCRIPT_EDITOR_CLASSES.lines} ${VIRTUAL_LIST_SCROLLBAR_BIND_SCROLLER_CLASS}`;
    this.element.setAttribute('role', 'list');
    this.element.setAttribute('aria-label', 'Script');
    this.canvas = document.createElement('div');
    this.canvas.className = SOLID_SCRIPT_EDITOR_CLASSES.linesCanvas;
    this.element.append(this.canvas);
    this.host.append(this.element);
    this.vertical = virtualListScrollbarBind(this.host, this.element, SOLID_SCRIPT_EDITOR_ROW_PX, [this.canvas]);
    this.horizontal = virtualListScrollbarBindHorizontal(this.host, this.element, 48, [this.canvas]);
    this.element.addEventListener('scroll', () => this.windowRender());
    this.keys = new SolidScriptEditorLineKeys({
      document: () => this.document,
      edit: handlers.edit,
      focus: (line, extend) => this.focusLine(line, extend),
      selection: () => this.selection(),
      selectAll: () => this.selectAll(),
      selectRange: (first, last) => this.selectRange(first, last),
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
    this.element.addEventListener('copy', (event) => this.keys.copy(event, false));
    this.element.addEventListener('cut', (event) => this.keys.copy(event, true));
    this.element.addEventListener('paste', (event) => this.keys.paste(event));
  }

  /**
   * Shows a script; rows are rebuilt only when a line changed.
   *
   * @param document Script.
   * @param focus Line to focus afterwards, or null to keep the current focus.
   */
  render(document: SolidScriptDocument, focus: number | null): void {
    const kept = focus ?? this.focused();
    if (focus !== null) this.anchor = null;
    this.document = document;
    this.caretLine = Math.max(0, Math.min(focus ?? this.caretLine, document.blocks.length - 1));
    const depths = solidScriptDocumentDepths(document);
    const closes = solidScriptDocumentClosedBlocks(document);
    this.offs = solidScriptDocumentOffLines(document);
    const layout = JSON.stringify([document.blocks, depths, closes]);
    const rebuilt = layout !== this.layout;
    this.layout = layout;
    if (rebuilt) this.rowsReset(depths, closes);
    this.windowRender();
    if (kept !== null && (rebuilt || focus !== null)) this.focusLine(kept);
  }

  /**
   * Highlights the debugger step in its own green, the error line, traced lines
   * and breakpoints; each mark explains itself on hover. The step is scrolled
   * into view.
   *
   * @param marks Lines to highlight.
   */
  mark(marks: SolidScriptEditorMarks): void {
    this.marks = marks;
    if (marks.stepped !== null) this.reveal(marks.stepped);
    this.windowRender();
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
   * Returns the selected lines: from the selection start to the current line,
   * or the current line alone.
   *
   * @returns First and last line index.
   */
  selection(): [number, number] {
    const anchor = this.anchor ?? this.caretLine;
    return [Math.min(anchor, this.caretLine), Math.max(anchor, this.caretLine)];
  }

  /**
   * Selects lines, keeping the focus on the last one.
   *
   * @param first First line index.
   * @param last Last line index.
   */
  selectRange(first: number, last: number): void {
    this.focusLine(last);
    this.anchor = Math.max(0, Math.min(first, this.document.blocks.length - 1));
    this.windowRender();
  }

  /** Selects every line, keeping the focus on the last one. */
  selectAll(): void {
    const last = this.document.blocks.length - 1;
    if (last < 0) return;
    this.focusLine(last);
    this.anchor = 0;
    this.windowRender();
  }

  /**
   * Focuses a line, scrolling it into view up and down and sideways.
   *
   * @param line Line index, clamped to the script.
   * @param extend True grows the selection to the line instead of starting a
   *   new one.
   */
  focusLine(line: number, extend = false): void {
    const clamped = Math.max(0, Math.min(line, this.document.blocks.length - 1));
    this.anchor = extend ? (this.anchor ?? this.caretLine) : null;
    this.caretLine = clamped;
    this.reveal(clamped);
    this.windowRender();
    this.rowAt(clamped)
      ?.querySelector<HTMLElement>(`.${SOLID_SCRIPT_EDITOR_CLASSES.chip}`)
      ?.focus({ preventScroll: true });
  }

  /**
   * Scrolls so a line shows: its row up and down, and the start of its text
   * sideways when that is out of view.
   *
   * @param line Line index.
   */
  private reveal(line: number): void {
    const scroller = this.element;
    const top = SOLID_SCRIPT_EDITOR_LINES_TOP_PX + line * SOLID_SCRIPT_EDITOR_ROW_PX;
    const height = scroller.clientHeight - SOLID_SCRIPT_EDITOR_SCROLLBAR_PX;
    if (top < scroller.scrollTop) scroller.scrollTop = top;
    else if (height > 0 && top + SOLID_SCRIPT_EDITOR_ROW_PX > scroller.scrollTop + height)
      scroller.scrollTop = top + SOLID_SCRIPT_EDITOR_ROW_PX - height;
    const text = (this.depths[line] ?? 0) * SOLID_SCRIPT_EDITOR_LINES_INDENT_PX;
    const width = scroller.clientWidth - SOLID_SCRIPT_EDITOR_GUTTER_PX - SOLID_SCRIPT_EDITOR_SCROLLBAR_PX;
    if (text < scroller.scrollLeft || (width > 0 && text > scroller.scrollLeft + width - 48))
      scroller.scrollLeft = Math.max(0, text - 16);
  }

  /**
   * Forgets the built rows after the script changed and sizes the scroll area
   * for every line.
   *
   * @param depths Block depth per line.
   * @param closes Closed block name per line.
   */
  private rowsReset(depths: number[], closes: string[]): void {
    this.depths = depths;
    this.closes = closes;
    this.built.clear();
    this.canvas.replaceChildren();
    const count = this.document.blocks.length;
    this.canvas.style.height = `${SOLID_SCRIPT_EDITOR_LINES_TOP_PX + count * SOLID_SCRIPT_EDITOR_ROW_PX + SOLID_SCRIPT_EDITOR_ROW_PX}px`;
    this.widest = Math.max(
      0,
      ...this.document.blocks.map(
        (block, line) =>
          SOLID_SCRIPT_EDITOR_GUTTER_PX +
          32 +
          (depths[line] ?? 0) * SOLID_SCRIPT_EDITOR_LINES_INDENT_PX +
          solidScriptListingText(solidScriptBlockListing(block, closes[line] ?? '')).length *
            SOLID_SCRIPT_EDITOR_CHAR_PX,
      ),
    );
    this.canvas.style.width = `${Math.ceil(this.widest)}px`;
  }

  /**
   * Builds the rows in view (all of them when the list has no size yet) and the
   * current line, removes the others, and updates every mark.
   */
  private windowRender(): void {
    const count = this.document.blocks.length;
    const scroller = this.element;
    let first = 0;
    let last = count - 1;
    if (scroller.clientHeight > 0) {
      const top = scroller.scrollTop - SOLID_SCRIPT_EDITOR_LINES_TOP_PX;
      first = Math.max(0, Math.floor(top / SOLID_SCRIPT_EDITOR_ROW_PX) - SOLID_SCRIPT_EDITOR_LINES_OVERSCAN);
      last = Math.min(
        count - 1,
        Math.ceil((top + scroller.clientHeight) / SOLID_SCRIPT_EDITOR_ROW_PX) + SOLID_SCRIPT_EDITOR_LINES_OVERSCAN,
      );
    }
    const wanted = new Set<number>();
    for (let line = first; line <= last; line++) wanted.add(line);
    if (count > 0) wanted.add(this.caretLine);
    const focused = this.focused();
    if (focused !== null) wanted.add(focused);
    for (const [line, row] of this.built)
      if (!wanted.has(line)) {
        row.remove();
        this.built.delete(line);
      }
    for (const line of [...wanted].sort((a, b) => a - b)) {
      const row = this.built.get(line) ?? this.rowBuild(line);
      if (!row) continue;
      this.rowMark(row, line);
    }
    let measured = this.widest;
    for (const row of this.built.values()) measured = Math.max(measured, row.scrollWidth);
    if (measured > this.widest + 1) {
      this.widest = measured;
      this.canvas.style.width = `${Math.ceil(measured)}px`;
    }
    this.vertical.sync();
    this.horizontal.scrollbar.getElement().style.right =
      scroller.scrollHeight > scroller.clientHeight + 1 ? `${SOLID_SCRIPT_EDITOR_SCROLLBAR_PX}px` : '0';
    this.horizontal.sync();
  }

  /**
   * Builds the row of a line and places it.
   *
   * @param line Line index.
   * @returns Row, or null past the end.
   */
  private rowBuild(line: number): HTMLElement | null {
    const block = this.document.blocks[line];
    if (!block) return null;
    const handlers: SolidScriptEditorRowHandlers = {
      key: (event, at) => this.keys.key(event, at),
      configure: this.handlers.configure,
      focus: (at) => this.caretSet(at),
      press: (at, extend) => {
        this.anchor = extend ? (this.anchor ?? this.caretLine) : null;
        this.caretSet(at);
      },
      breakpoint: (at) => this.handlers.breakpoint(at),
    };
    const row = solidScriptEditorRowBuild(
      block,
      { line, depth: this.depths[line] ?? 0, closes: this.closes[line] ?? '', off: this.offs[line] ?? false },
      handlers,
    );
    row.style.top = `${SOLID_SCRIPT_EDITOR_LINES_TOP_PX + line * SOLID_SCRIPT_EDITOR_ROW_PX}px`;
    const after = [...this.built.keys()].filter((other) => other > line).sort((a, b) => a - b)[0];
    this.canvas.insertBefore(row, after === undefined ? null : (this.built.get(after) ?? null));
    this.built.set(line, row);
    return row;
  }

  /**
   * Shows the current line and the debugger marks on one row.
   *
   * @param row Row.
   * @param line Its line.
   */
  private rowMark(row: HTMLElement, line: number): void {
    const marks = this.marks;
    const [first, last] = this.selection();
    row.classList.toggle(SOLID_SCRIPT_EDITOR_CLASSES.current, line === this.caretLine);
    row.classList.toggle(
      SOLID_SCRIPT_EDITOR_CLASSES.selected,
      line !== this.caretLine && line >= first && line <= last,
    );
    row.classList.toggle(SOLID_SCRIPT_EDITOR_CLASSES.stepped, line === marks.stepped);
    row.classList.toggle(SOLID_SCRIPT_EDITOR_CLASSES.failed, line === marks.failed);
    row.classList.toggle(SOLID_SCRIPT_EDITOR_CLASSES.traced, marks.traced.has(line));
    row.classList.toggle(SOLID_SCRIPT_EDITOR_CLASSES.breakpoint, marks.breakpoints.has(line));
    if (line === marks.stepped && marks.atBreak)
      row.title = 'Paused at this breakpoint: the line has not run yet. Step or Continue.';
    else if (line === marks.stepped) row.title = 'Debugger step: the script is built up to this line';
    else if (marks.breakpoints.has(line)) row.title = 'Breakpoint: Start and Debug pause before this line runs';
    else if (marks.traced.has(line)) row.title = 'Traced: the debugger has passed this line';
    else row.removeAttribute('title');
    solidScriptEditorRunsShow(row, marks.runs.get(line + 1));
  }

  /**
   * Moves the current line.
   *
   * @param line Line index.
   */
  private caretSet(line: number): void {
    this.caretLine = line;
    for (const [at, row] of this.built) this.rowMark(row, at);
    this.handlers.select(line);
  }

  /**
   * Adds a blank line, or focuses the last one, when the empty space below the
   * script is clicked.
   *
   * @param event Mouse event.
   */
  private backgroundDown(event: MouseEvent): void {
    if (event.target !== this.element && event.target !== this.canvas) return;
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
   * Returns the built row of a line.
   *
   * @param line Line index.
   * @returns Row, or null when it is out of view.
   */
  private rowAt(line: number): HTMLElement | null {
    return this.built.get(line) ?? null;
  }
}

/**
 * Shows at the end of a row how often its line ran when that was more than
 * once, with the time of the line and the lines inside it on hover.
 *
 * @param row Row.
 * @param profile Count and time of its line, or undefined when it did not run.
 */
function solidScriptEditorRunsShow(row: HTMLElement, profile: SolidScriptLineProfile | undefined): void {
  let runs = row.querySelector<HTMLElement>(`.${SOLID_SCRIPT_EDITOR_CLASSES.runs}`);
  if (!runs) {
    runs = document.createElement('span');
    runs.className = SOLID_SCRIPT_EDITOR_CLASSES.runs;
    row.append(runs);
  }
  if (!profile) {
    runs.textContent = '';
    runs.removeAttribute('title');
    return;
  }
  runs.textContent = profile.count > 1 ? `×${profile.count}` : '';
  const times = profile.count === 1 ? 'once' : `${profile.count} times`;
  runs.title = `Ran ${times} in the last run, ${solidScriptEditorRunsTime(profile.ms)} with the lines inside it`;
}

/**
 * Writes a run time for people.
 *
 * @param ms Milliseconds.
 * @returns Such as "under 0.1 ms" or "2.4 ms".
 */
function solidScriptEditorRunsTime(ms: number): string {
  return ms < 0.1 ? 'under 0.1 ms' : `${ms.toFixed(ms < 10 ? 1 : 0)} ms`;
}
