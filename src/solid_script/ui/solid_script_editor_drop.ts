import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';
import { SOLID_SCRIPT_EDITOR_DRAG_COMMAND } from './solid_script_editor_palette.js';
import { SOLID_SCRIPT_EDITOR_DRAG_LINE } from './solid_script_editor_row.js';

/** Where a dragged command or line lands. */
export interface SolidScriptEditorDropTarget {
  /** Line index the drop lands before, or the blank line it replaces. */
  line: number;
  /** True when it replaces a blank line. */
  replaces: boolean;
}

/** What a drop does. */
export interface SolidScriptEditorDropHandlers {
  /** Returns whether a line is blank code. */
  blank: (line: number) => boolean;
  /** Returns the line count. */
  count: () => number;
  /** Inserts a palette command. */
  insert: (command: string, target: SolidScriptEditorDropTarget) => void;
  /** Moves a line. */
  move: (from: number, target: SolidScriptEditorDropTarget) => void;
}

/** Drop marker classes, cleared together. */
const SOLID_SCRIPT_EDITOR_DROP_CLASSES = [
  SOLID_SCRIPT_EDITOR_CLASSES.dropBefore,
  SOLID_SCRIPT_EDITOR_CLASSES.dropAfter,
  SOLID_SCRIPT_EDITOR_CLASSES.dropInto,
];

/**
 * Accepts commands dragged from the palette and command lines dragged inside
 * the script, showing where they land.
 */
export class SolidScriptEditorDrop {
  /**
   * Listens for drags over the line list.
   *
   * @param element Line list.
   * @param handlers Drop callbacks.
   */
  constructor(
    private readonly element: HTMLElement,
    private readonly handlers: SolidScriptEditorDropHandlers,
  ) {
    element.addEventListener('dragover', (event) => this.over(event));
    element.addEventListener('dragleave', (event) => event.target === element && this.clear());
    element.addEventListener('drop', (event) => this.drop(event));
    element.addEventListener('dragend', () => this.clear());
  }

  /**
   * Shows where a drag would land.
   *
   * @param event Drag event.
   */
  private over(event: DragEvent): void {
    const types = event.dataTransfer?.types ?? [];
    if (!types.includes(SOLID_SCRIPT_EDITOR_DRAG_COMMAND) && !types.includes(SOLID_SCRIPT_EDITOR_DRAG_LINE)) return;
    event.preventDefault();
    if (event.dataTransfer)
      event.dataTransfer.dropEffect = types.includes(SOLID_SCRIPT_EDITOR_DRAG_LINE) ? 'move' : 'copy';
    this.clear();
    const { row, mark } = this.locate(event);
    row?.classList.add(mark);
  }

  /**
   * Lands a drag.
   *
   * @param event Drag event.
   */
  private drop(event: DragEvent): void {
    this.clear();
    const command = event.dataTransfer?.getData(SOLID_SCRIPT_EDITOR_DRAG_COMMAND) ?? '';
    const line = event.dataTransfer?.getData(SOLID_SCRIPT_EDITOR_DRAG_LINE) ?? '';
    if (!command && !line) return;
    event.preventDefault();
    const target = this.target(event);
    if (command) this.handlers.insert(command, target);
    else this.handlers.move(Number(line), target);
  }

  /**
   * Returns where a drag lands.
   *
   * @param event Drag event.
   * @returns Target line.
   */
  target(event: MouseEvent): SolidScriptEditorDropTarget {
    const { line, mark } = this.locate(event);
    if (mark === SOLID_SCRIPT_EDITOR_CLASSES.dropInto) return { line, replaces: true };
    return { line: mark === SOLID_SCRIPT_EDITOR_CLASSES.dropAfter ? line + 1 : line, replaces: false };
  }

  /**
   * Finds the row under the pointer and which marker it shows.
   *
   * @param event Pointer event.
   * @returns Row, its line and the marker class.
   */
  private locate(event: MouseEvent): { row: HTMLElement | null; line: number; mark: string } {
    const row =
      (event.target as HTMLElement | null)?.closest?.<HTMLElement>(`.${SOLID_SCRIPT_EDITOR_CLASSES.row}`) ?? null;
    if (!row) {
      const line = Math.max(0, this.handlers.count() - 1);
      const last = this.element.querySelector<HTMLElement>(`.${SOLID_SCRIPT_EDITOR_CLASSES.row}[data-line="${line}"]`);
      return { row: last, line, mark: SOLID_SCRIPT_EDITOR_CLASSES.dropAfter };
    }
    const line = Number(row.dataset['line']);
    if (this.handlers.blank(line)) return { row, line, mark: SOLID_SCRIPT_EDITOR_CLASSES.dropInto };
    const box = row.getBoundingClientRect();
    const after = event.clientY > box.top + box.height / 2;
    return { row, line, mark: after ? SOLID_SCRIPT_EDITOR_CLASSES.dropAfter : SOLID_SCRIPT_EDITOR_CLASSES.dropBefore };
  }

  /** Hides the drop marker. */
  clear(): void {
    for (const row of this.element.querySelectorAll(`.${SOLID_SCRIPT_EDITOR_CLASSES.row}`))
      row.classList.remove(...SOLID_SCRIPT_EDITOR_DROP_CLASSES);
  }
}
