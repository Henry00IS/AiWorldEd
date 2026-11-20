import type { MenuContext } from '@/ui/menu/menu_context.js';
import { SOLID_SCRIPT_COMMAND_CATALOG } from '@/solid_script/commands/solid_script_command_catalog.js';
import type { SolidScriptCommandCatalog } from '@/solid_script/commands/solid_script_command_catalog_base.js';
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
  solidScriptDocumentBlockOpeners,
  solidScriptDocumentClosedBlocks,
} from '@/solid_script/document/solid_script_document_listing.js';
import {
  VIRTUAL_LIST_SCROLLBAR_BIND_SCROLLER_CLASS,
  virtualListScrollbarBind,
  virtualListScrollbarBindHorizontal,
  virtualListScrollbarBindStylesEnsure,
  type VirtualListScrollbarBinding,
} from '@/ui/virtual_list/virtual_list_scrollbar_bind.js';
import type { SolidScriptLineProfile } from '@/solid_script/language/solid_script_machine_types.js';
import { SOLID_SCRIPT_EDITOR_CLASSES, SOLID_SCRIPT_EDITOR_INDENT_PX } from './solid_script_editor_css.js';
import { SolidScriptEditorDrop, type SolidScriptEditorDropTarget } from './solid_script_editor_drop.js';
import {
  solidScriptEditorLineConfigurable,
  solidScriptEditorRowBuild,
  type SolidScriptEditorRowHandlers,
  type SolidScriptEditorRowLook,
} from './solid_script_editor_row.js';
import { SolidScriptEditorLineKeys } from './solid_script_editor_line_keys.js';
import {
  solidScriptEditorLineMenuItems,
  solidScriptEditorMenuShow,
  type SolidScriptEditorLineMenuHost,
} from './solid_script_editor_line_menu.js';
import { solidScriptEditorShownCopy, type SolidScriptEditorShownCopy } from './solid_script_editor_copy.js';
import { SolidScriptEditorLinePaint } from './solid_script_editor_line_paint.js';
import { SelectionRowsRules } from '@/selection/rows/selection_rows_rules.js';
import { solidScriptEditorViewRead, type SolidScriptEditorView } from './solid_script_editor_view.js';

/** Lines the debugger and the last run point at, as 0-based indices. */
export interface SolidScriptEditorMarks {
  /** Line of the step shown, or null. */
  stepped: number | null;
  /** Line of the error, or null. */
  failed: number | null;
  /** Keys of the names the error points at, underlined on its line. */
  error: ReadonlySet<string>;
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

/** What kind of lines a line list shows. */
export interface SolidScriptEditorLinesOptions {
  /** Commands the lines are found in. */
  catalog: SolidScriptCommandCatalog;
  /** Accessible name of the list, such as Script. */
  label: string;
  /** True when lines can be turned off and hold breakpoints. */
  switches: boolean;
}

/** Line list of the script editor. */
export const SOLID_SCRIPT_EDITOR_LINES_SCRIPT: SolidScriptEditorLinesOptions = {
  catalog: SOLID_SCRIPT_COMMAND_CATALOG,
  label: 'Script',
  switches: true,
};

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
  readonly host = document.createElement('div');
  /** Line list element: the scroller. */
  readonly element = document.createElement('div');
  private readonly canvas = document.createElement('div');
  private document: SolidScriptDocument = solidScriptDocumentCreate([]);
  private depths: number[] = [];
  private closes: string[] = [];
  /** Line that opens the block, per End line; -1 for other lines. */
  private openers: number[] = [];
  /** True per line that is off. */
  private offs: boolean[] = [];
  private caretLine = 0;
  /** Start of a keyboard Shift range, or null. */
  private anchor: number | null = null;
  /** Lines picked with the mouse, in order, or null for the current line alone. */
  private picked: number[] | null = null;
  /** True while a press on a picked line waits to see whether it drags. */
  private pressKept = false;
  private layout = '';
  private widest = 0;
  private marks: SolidScriptEditorMarks = {
    stepped: null,
    failed: null,
    error: new Set(),
    traced: new Set(),
    breakpoints: new Set(),
    atBreak: false,
    runs: new Map(),
  };
  private readonly built = new Map<number, HTMLElement>();
  /** What every row does on keys, presses and focus. */
  private readonly rowHandlers: SolidScriptEditorRowHandlers = {
    key: (event, at) => this.keys.key(event, at),
    configure: (at) => this.configureLine(at),
    jump: (at) => this.focusLine(at),
    focus: (at) => this.focusArrived(at),
    press: (at, event) => this.press(at, event),
    release: (at) => this.release(at),
    breakpoint: (at) => this.handlers.breakpoint(at),
  };
  /**
   * Line whose focused row was dropped to be built again; its new row takes the
   * focus.
   */
  private refocus: number | null = null;
  private view: SolidScriptEditorView = solidScriptEditorViewRead();
  private unknown: ReadonlyMap<number, ReadonlySet<string>> = new Map();
  private readonly keys: SolidScriptEditorLineKeys;
  private readonly paint: SolidScriptEditorLinePaint;
  /** Drops of palette commands and dragged lines. */
  private readonly drop: SolidScriptEditorDrop;
  private readonly vertical: VirtualListScrollbarBinding;
  private readonly horizontal: VirtualListScrollbarBinding;

  /**
   * Creates the line list.
   *
   * @param handlers Editor callbacks.
   * @param options Commands, name and switches of the lines.
   */
  constructor(
    private readonly handlers: SolidScriptEditorLinesHandlers,
    private readonly options: SolidScriptEditorLinesOptions = SOLID_SCRIPT_EDITOR_LINES_SCRIPT,
  ) {
    virtualListScrollbarBindStylesEnsure();
    this.domBuild(options.label);
    this.vertical = virtualListScrollbarBind(this.host, this.element, SOLID_SCRIPT_EDITOR_ROW_PX, [this.canvas]);
    this.horizontal = virtualListScrollbarBindHorizontal(this.host, this.element, 48, [this.canvas]);
    this.keys = this.keysCreate();
    this.paint = new SolidScriptEditorLinePaint({
      element: () => this.element,
      lineAt: (clientY) => this.lineAt(clientY),
      paint: (painted, base, subtractive, pointerLine) =>
        this.selectionApply(SelectionRowsRules.paintApply(base, painted, subtractive), pointerLine),
      rowPx: SOLID_SCRIPT_EDITOR_ROW_PX,
    });
    this.drop = this.dropCreate();
    this.listen();
  }

  /**
   * Builds the scrolling list inside its host.
   *
   * @param label Accessible name of the list.
   */
  private domBuild(label: string): void {
    this.host.className = SOLID_SCRIPT_EDITOR_CLASSES.linesHost;
    this.element.className = `${SOLID_SCRIPT_EDITOR_CLASSES.lines} ${VIRTUAL_LIST_SCROLLBAR_BIND_SCROLLER_CLASS}`;
    this.element.setAttribute('role', 'list');
    this.element.setAttribute('aria-label', label);
    this.element.tabIndex = -1;
    this.canvas.className = SOLID_SCRIPT_EDITOR_CLASSES.linesCanvas;
    this.element.append(this.canvas);
    this.host.append(this.element);
  }

  /**
   * Creates what the keys do to the lines.
   *
   * @returns Line keys.
   */
  private keysCreate(): SolidScriptEditorLineKeys {
    return new SolidScriptEditorLineKeys({
      document: () => this.document,
      edit: this.handlers.edit,
      focus: (line, extend) => this.focusLine(line, extend),
      selected: () => this.selected(),
      select: (lines) => this.select(lines),
      selectAll: () => this.selectAll(),
      selectRange: (first, last) => this.selectRange(first, last),
      configure: (line) => this.configureLine(line),
      notice: this.handlers.notice,
      catalog: this.options.catalog,
      switches: this.options.switches,
    });
  }

  /**
   * Creates what drops palette commands and dragged lines on the list.
   *
   * @returns Drop.
   */
  private dropCreate(): SolidScriptEditorDrop {
    return new SolidScriptEditorDrop(this.element, {
      blank: (line) => solidScriptBlockIsBlank(this.document.blocks[line]),
      count: () => this.document.blocks.length,
      insert: this.handlers.insert,
      move: (from, target) => {
        this.pressKept = false;
        this.keys.drag(from, target.line);
      },
      rowPx: SOLID_SCRIPT_EDITOR_ROW_PX,
    });
  }

  /** Listens to scrolling, presses, the clipboard and the context menu. */
  private listen(): void {
    this.element.addEventListener('scroll', () => this.windowRender());
    this.element.addEventListener('mousedown', (event) => this.backgroundDown(event));
    this.element.addEventListener('copy', (event) => this.keys.copy(event, false));
    this.element.addEventListener('cut', (event) => this.keys.copy(event, true));
    this.element.addEventListener('paste', (event) => this.keys.paste(event));
    this.element.addEventListener('contextmenu', (event) => this.menuOpen(event));
  }

  /** Stops listening for drags on the page and closes the line menu. */
  dispose(): void {
    this.drop.dispose();
    this.paint.end();
    this.menu?.dispose();
    this.menu = null;
  }

  /** Turns the selected lines, or the current one, off or on again. */
  linesToggle(): void {
    if (this.document.blocks.length > 0) this.keys.toggle(this.caretLine);
  }

  /**
   * Opens the line menu at a row: the selection stays when it holds the clicked
   * line, otherwise the clicked line is selected alone.
   *
   * @param event Context menu event.
   */
  private menuOpen(event: MouseEvent): void {
    const row = (event.target as HTMLElement | null)?.closest<HTMLElement>(`.${SOLID_SCRIPT_EDITOR_CLASSES.row}`);
    if (!row) return;
    event.preventDefault();
    const line = Number(row.dataset['line']);
    const kept = SelectionRowsRules.contextApply(new Set(this.selected()), line);
    if (kept.size === 1 && kept.has(line)) this.focusLine(line);
    this.menu = solidScriptEditorMenuShow(this.menu, solidScriptEditorLineMenuItems(this.menuHost(), line), event);
  }

  /**
   * Tells whether a line has values to set; End lines and blocks without fields
   * have none.
   *
   * @param line Line index.
   * @returns True when it has.
   */
  private configurable(line: number): boolean {
    const block = this.document.blocks[line];
    return block !== undefined && solidScriptEditorLineConfigurable(block, this.options.catalog);
  }

  /**
   * Opens the configurator of a line, or does nothing for a line with nothing
   * to configure, from a double-click, Enter or the line menu alike.
   *
   * @param line Line index.
   */
  private configureLine(line: number): void {
    if (this.configurable(line)) this.handlers.configure(line);
  }

  /**
   * Tells the line menu what it works on.
   *
   * @returns Menu host.
   */
  private menuHost(): SolidScriptEditorLineMenuHost {
    return {
      switches: this.options.switches,
      off: (line) => this.offs[line] === true,
      configure: (line) => this.configureLine(line),
      configurable: (line) => this.configurable(line),
      breakpoint: (line) => this.handlers.breakpoint(line),
      notice: (text) => this.handlers.notice(text),
      keys: this.keys,
      shown: () => this.shown(),
    };
  }

  /**
   * Returns the selected lines as the code view shows them, from rows built the
   * way the view builds them.
   *
   * @returns Plain text and Markdown.
   */
  private shown(): SolidScriptEditorShownCopy {
    const lines = this.selected().flatMap((line) => {
      const block = this.document.blocks[line];
      if (!block) return [];
      const row = solidScriptEditorRowBuild(block, this.rowLook(line), this.rowHandlers);
      return [{ depth: this.depths[line] ?? 0, row }];
    });
    return solidScriptEditorShownCopy(lines);
  }

  /** Line menu while open. */
  private menu: MenuContext | null = null;

  /**
   * Shows a script; rows are rebuilt only when a line changed. Focusing a line
   * selects it alone, unless it is the current line and only lines changed in
   * place, such as by its configurator, which keeps the selection.
   *
   * @param document Script.
   * @param focus Line to focus afterwards, or null to keep the current focus.
   */
  render(document: SolidScriptDocument, focus: number | null): void {
    const kept = focus ?? this.focused();
    const inPlace = focus !== null && this.changedInPlace(document, focus);
    if (focus !== null && !inPlace) {
      this.anchor = null;
      this.picked = null;
    }
    this.caretLine = focus ?? this.caretLine;
    const rebuilt = this.documentSet(document);
    this.windowRender();
    if (kept !== null && (rebuilt || focus !== null)) this.focusLine(kept, inPlace);
  }

  /**
   * Tells whether a script only changed inside its lines: as many lines, and
   * the focused line is the current one with the same command.
   *
   * @param document Script.
   * @param focus Line to focus.
   * @returns True when the selection still fits.
   */
  private changedInPlace(document: SolidScriptDocument, focus: number): boolean {
    const same = document.blocks.length === this.document.blocks.length && focus === this.caretLine;
    return same && document.blocks[focus]?.command === this.document.blocks[focus]?.command;
  }

  /**
   * Shows a script changed elsewhere, by another user, undo or redo, without
   * moving anything for the person working here: the top line in view, the
   * current line and the selection follow their lines by id, and the sideways
   * scroll stays. A line that is gone hands its place to the line now there.
   * The focus stays where it was.
   *
   * @param document Script.
   */
  renderKeeping(document: SolidScriptDocument): void {
    const before = this.document.blocks;
    const scroller = this.element;
    const offset = scroller.scrollTop - SOLID_SCRIPT_EDITOR_LINES_TOP_PX;
    const top = Math.max(0, Math.floor(offset / SOLID_SCRIPT_EDITOR_ROW_PX));
    const within = offset - top * SOLID_SCRIPT_EDITOR_ROW_PX;
    const left = scroller.scrollLeft;
    const focused = this.focused() !== null;
    const ids = new Map(document.blocks.map((block, line) => [block.id, line]));
    const follow = (line: number): number => {
      const id = before[line]?.id;
      return (id === undefined ? undefined : ids.get(id)) ?? line;
    };
    const caret = follow(this.caretLine);
    const anchor = this.anchor === null ? null : follow(this.anchor);
    const picked = this.picked?.map(follow) ?? null;
    const shifted = follow(top) - top;
    this.caretLine = caret;
    this.documentSet(document);
    this.anchor = anchor === null ? null : Math.max(0, Math.min(anchor, document.blocks.length - 1));
    this.picked = picked && [...new Set(picked.filter((line) => line < document.blocks.length))].sort((a, b) => a - b);
    if (offset > 0)
      scroller.scrollTop = SOLID_SCRIPT_EDITOR_LINES_TOP_PX + (top + shifted) * SOLID_SCRIPT_EDITOR_ROW_PX + within;
    scroller.scrollLeft = left;
    this.windowRender();
    if (focused)
      this.rowAt(this.caretLine)
        ?.querySelector<HTMLElement>(`.${SOLID_SCRIPT_EDITOR_CLASSES.chip}`)
        ?.focus({ preventScroll: true });
  }

  /**
   * Takes a script: the line depths, closed blocks and off lines, and the rows
   * when a line changed. The current line is kept inside the script.
   *
   * @param document Script.
   * @returns True when the rows were rebuilt.
   */
  private documentSet(document: SolidScriptDocument): boolean {
    this.document = document;
    this.caretLine = Math.max(0, Math.min(this.caretLine, document.blocks.length - 1));
    const catalog = this.options.catalog;
    const depths = solidScriptDocumentDepths(document, catalog);
    this.openers = solidScriptDocumentBlockOpeners(document, catalog);
    const closes = solidScriptDocumentClosedBlocks(document, this.openers, catalog);
    this.offs = solidScriptDocumentOffLines(document);
    const layout = JSON.stringify([document.blocks, depths, closes]);
    const rebuilt = layout !== this.layout;
    this.layout = layout;
    if (rebuilt) this.rowsReset(depths, closes);
    return rebuilt;
  }

  /**
   * Highlights the debugger step in its own green, the error line, traced lines
   * and breakpoints; each mark explains itself on hover. The step is scrolled
   * into view.
   *
   * @param marks Lines to highlight.
   */
  mark(marks: SolidScriptEditorMarks): void {
    const before = this.marks;
    if (before.failed !== marks.failed || [...before.error].join() !== [...marks.error].join())
      this.rowsForget([before.failed, marks.failed]);
    this.marks = marks;
    if (marks.stepped !== null) this.reveal(marks.stepped);
    this.windowRender();
  }

  /**
   * Shows the lines with other view switches.
   *
   * @param view View switches.
   */
  viewSet(view: SolidScriptEditorView): void {
    this.view = view;
    this.rowsForget([...this.built.keys()]);
    this.windowRender();
  }

  /**
   * Underlines the names and calls each line reads that nothing defines.
   *
   * @param unknown Unknown keys per line, from the idle check.
   */
  unknownSet(unknown: ReadonlyMap<number, ReadonlySet<string>>): void {
    const changed = [...new Set([...this.unknown.keys(), ...unknown.keys()])];
    this.unknown = unknown;
    this.rowsForget(changed);
    this.windowRender();
  }

  /**
   * Drops built rows so they are built again with new marks.
   *
   * @param lines Line indexes; null entries are skipped.
   */
  private rowsForget(lines: readonly (number | null)[]): void {
    const focused = this.focused();
    for (const line of lines) {
      if (line === null) continue;
      this.built.get(line)?.remove();
      this.built.delete(line);
      if (line === focused) this.refocus = line;
    }
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
   * Returns the selected lines in order: the lines picked with the mouse plus
   * the keyboard Shift range from its start to the current line, or the current
   * line alone.
   *
   * @returns Line indexes.
   */
  selected(): number[] {
    if (this.anchor === null) return this.picked ? [...this.picked] : [this.caretLine];
    const first = Math.min(this.anchor, this.caretLine);
    const range = Array.from({ length: Math.abs(this.anchor - this.caretLine) + 1 }, (_, index) => first + index);
    return [...new Set([...(this.picked ?? []), ...range])].sort((a, b) => a - b);
  }

  /**
   * Returns the selection as one run of lines, or null when Ctrl-picked lines
   * leave gaps.
   *
   * @returns First and last line index, or null.
   */
  selectedRun(): [number, number] | null {
    const lines = this.selected();
    const first = lines[0] ?? this.caretLine;
    const last = lines.at(-1) ?? this.caretLine;
    return last - first === lines.length - 1 ? [first, last] : null;
  }

  /**
   * Selects lines: a run as a range, others as picked lines.
   *
   * @param lines Line indexes in order.
   */
  select(lines: readonly number[]): void {
    const first = lines[0];
    const last = lines.at(-1);
    if (first === undefined || last === undefined) return;
    if (last - first === lines.length - 1) return this.selectRange(first, last);
    this.focusLine(last);
    this.picked = [...lines];
    this.windowRender();
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
   * @param extend True grows a Shift range from the current line to the line,
   *   keeping the lines picked with the mouse; false selects the line alone.
   */
  focusLine(line: number, extend = false): void {
    const clamped = Math.max(0, Math.min(line, this.document.blocks.length - 1));
    this.anchor = extend ? (this.anchor ?? this.caretLine) : null;
    if (!extend) this.picked = null;
    this.caretLine = clamped;
    this.reveal(clamped);
    this.windowRender();
    this.caretChipFocus();
  }

  /**
   * Gives the list the keyboard focus, on the current line, or on the list when
   * it has no lines, so keys and the clipboard reach it.
   */
  focusIn(): void {
    if (this.document.blocks.length > 0) this.focusLine(this.caretLine);
    else this.element.focus({ preventScroll: true });
  }

  /** Moves the keyboard focus to the current line without scrolling. */
  private caretChipFocus(): void {
    this.rowAt(this.caretLine)
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
    const text = (this.depths[line] ?? 0) * SOLID_SCRIPT_EDITOR_INDENT_PX;
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
          (depths[line] ?? 0) * SOLID_SCRIPT_EDITOR_INDENT_PX +
          solidScriptListingText(solidScriptBlockListing(block, closes[line] ?? '', this.options.catalog)).length *
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
    if (this.refocus !== null) wanted.add(this.refocus);
    for (const line of [...wanted].sort((a, b) => a - b)) {
      const row = this.built.get(line) ?? this.rowBuild(line);
      if (!row) continue;
      this.rowMark(row, line);
    }
    if (this.refocus !== null) {
      this.rowAt(this.refocus)
        ?.querySelector<HTMLElement>(`.${SOLID_SCRIPT_EDITOR_CLASSES.chip}`)
        ?.focus({ preventScroll: true });
      this.refocus = null;
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
   * Tells how the row of a line looks: its depth, group, marks and view.
   *
   * @param line Line index.
   * @returns Look.
   */
  private rowLook(line: number): SolidScriptEditorRowLook {
    const opener = this.openers[line] ?? -1;
    return {
      line,
      depth: this.depths[line] ?? 0,
      closes: this.closes[line] ?? '',
      opener,
      openerCommand: this.document.blocks[opener]?.command ?? '',
      off: this.offs[line] ?? false,
      view: this.view,
      unknown: this.unknown.get(line) ?? new Set(),
      error: line === this.marks.failed ? this.marks.error : new Set(),
      catalog: this.options.catalog,
      switches: this.options.switches,
    };
  }

  /**
   * Ends a press that kept the selection, making its line the current one.
   *
   * @param line Line index.
   */
  private release(line: number): void {
    if (!this.pressKept) return;
    this.pressKept = false;
    this.anchor = null;
    this.picked = null;
    this.caretSet(line);
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
    const row = solidScriptEditorRowBuild(block, this.rowLook(line), this.rowHandlers);
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
    row.classList.toggle(SOLID_SCRIPT_EDITOR_CLASSES.current, line === this.caretLine);
    row.classList.toggle(
      SOLID_SCRIPT_EDITOR_CLASSES.selected,
      line !== this.caretLine && this.selected().includes(line),
    );
    row.classList.toggle(SOLID_SCRIPT_EDITOR_CLASSES.stepped, line === marks.stepped);
    row.classList.toggle(SOLID_SCRIPT_EDITOR_CLASSES.failed, line === marks.failed);
    row.classList.toggle(SOLID_SCRIPT_EDITOR_CLASSES.traced, marks.traced.has(line));
    row.classList.toggle(SOLID_SCRIPT_EDITOR_CLASSES.breakpoint, marks.breakpoints.has(line));
    if (line === marks.stepped && marks.atBreak)
      row.title = 'Paused at this breakpoint: the line has not run yet. Step or Continue.';
    else if (line === marks.stepped) row.title = 'Debugger step: the script is built up to this line';
    else if (marks.breakpoints.has(line)) row.title = 'Breakpoint: Start and Debug pause before this line runs';
    else if (marks.traced.has(line)) row.title = 'Traced: the run passed this line';
    else row.removeAttribute('title');
    solidScriptEditorRunsShow(row, marks.runs.get(line + 1));
  }

  /**
   * Takes the keyboard focus arriving on a line and makes it the current line.
   * A line other than the current one, such as one reached by Tab, is selected
   * alone; focus that lands on the current line leaves the selection as it is.
   *
   * @param line Line index.
   */
  private focusArrived(line: number): void {
    if (line !== this.caretLine) {
      this.anchor = null;
      this.picked = null;
    }
    this.caretSet(line);
  }

  /**
   * Handles a left press on a row with the shared row rules: a plain press
   * selects the line alone, Shift adds it, Ctrl or Cmd toggles it, and a Shift
   * or Ctrl/Cmd drag paints from it. A plain press on a line of a larger
   * selection keeps the selection until the press ends without a drag, so
   * several lines can be dragged.
   *
   * @param line Line index.
   * @param event Mouse down event.
   */
  private press(line: number, event: MouseEvent): void {
    const modifiers = { shift: event.shiftKey, ctrl: event.ctrlKey || event.metaKey };
    const selected = new Set(this.selected());
    this.pressKept = !modifiers.shift && !modifiers.ctrl && selected.size > 1 && selected.has(line);
    if (modifiers.shift || modifiers.ctrl) this.paint.begin(line, selected, modifiers.ctrl, event);
    const next = this.pressKept ? selected : SelectionRowsRules.clickApply(selected, line, modifiers);
    this.selectionApply(next, line);
  }

  /**
   * Makes a set of lines the selection. The current line moves to the wanted
   * line when it is selected, otherwise to the nearest selected line; an empty
   * set selects the wanted line alone.
   *
   * @param lines Selected line indexes.
   * @param wanted Line that should become the current line.
   */
  private selectionApply(lines: ReadonlySet<number>, wanted: number): void {
    const sorted = [...lines].sort((a, b) => a - b);
    const nearest = sorted.reduce(
      (best, at) => (Math.abs(at - wanted) < Math.abs(best - wanted) ? at : best),
      sorted[0] ?? wanted,
    );
    this.anchor = null;
    this.picked = sorted.length > 1 ? sorted : null;
    this.caretSet(lines.has(wanted) ? wanted : nearest);
    this.caretChipFocus();
  }

  /**
   * Returns the line under a pointer height, clamped to the script.
   *
   * @param clientY Pointer height in client pixels.
   * @returns Line index, or null when the script has no lines.
   */
  private lineAt(clientY: number): number | null {
    const last = this.document.blocks.length - 1;
    if (last < 0) return null;
    const offset = clientY - this.element.getBoundingClientRect().top + this.element.scrollTop;
    const line = Math.floor((offset - SOLID_SCRIPT_EDITOR_LINES_TOP_PX) / SOLID_SCRIPT_EDITOR_ROW_PX);
    return Math.max(0, Math.min(line, last));
  }

  /**
   * Moves the current line and shows the selection on every built row.
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
