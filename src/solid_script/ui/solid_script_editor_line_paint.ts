import { DRAG_EDGE_SCROLL_TUNING } from '@/ui/drag/drag_edge_scroll.js';
import { RowPaintDrag } from '@/ui/drag/row_paint_drag.js';

/** What a paint over script lines needs from the line list. */
export interface SolidScriptEditorLinePaintHost {
  /**
   * Returns the scrolling line list.
   *
   * @returns List element.
   */
  element: () => HTMLElement;
  /**
   * Returns the line under a pointer height, clamped to the script.
   *
   * @param clientY Pointer height in client pixels.
   * @returns Line index, or null when the script has no lines.
   */
  lineAt: (clientY: number) => number | null;
  /**
   * Paints the lines from the pressed line to the line under the pointer on top
   * of the selection the gesture started from.
   *
   * @param painted Painted line indexes in order.
   * @param base Selection when the gesture started.
   * @param subtractive True removes the painted lines, false adds them.
   * @param pointerLine Line under the pointer.
   */
  paint: (painted: number[], base: ReadonlySet<number>, subtractive: boolean, pointerLine: number) => void;
  /**
   * Height of one line row in CSS pixels, the unit the edge scroll speeds count
   * in.
   */
  rowPx: number;
}

/**
 * Modifier-drag paint over script lines: pressing Shift or Ctrl/Cmd on a line
 * and dragging over other lines selects (Shift) or deselects (Ctrl/Cmd) every
 * line from the pressed one to the one under the pointer. Holding the pointer
 * near the top or bottom of the script scrolls it like the outliner, painting
 * the lines that scroll by. Nothing is painted until the pointer reaches
 * another line, so a plain modifier click keeps its own behaviour.
 */
export class SolidScriptEditorLinePaint {
  private pressedLine: number | null = null;
  private base: ReadonlySet<number> = new Set();
  private subtractive = false;
  private readonly drag: RowPaintDrag;

  /**
   * Creates an idle paint.
   *
   * @param host Line list callbacks.
   */
  constructor(host: SolidScriptEditorLinePaintHost) {
    this.drag = new RowPaintDrag(
      {
        element: () => host.element(),
        scrollBy: (deltaY) => {
          const element = host.element();
          const before = element.scrollTop;
          element.scrollTop = before + deltaY;
          return element.scrollTop !== before;
        },
        rowAt: (clientY) => host.lineAt(clientY),
        anchorRow: () => this.pressedLine,
        paint: (first, last, pointerLine) =>
          host.paint(
            Array.from({ length: last - first + 1 }, (_, index) => first + index),
            this.base,
            this.subtractive,
            pointerLine,
          ),
      },
      { ...DRAG_EDGE_SCROLL_TUNING, rowHeightPx: host.rowPx },
    );
  }

  /**
   * Starts a paint from a pressed line.
   *
   * @param pressedLine Line the gesture started on.
   * @param base Selection when the gesture started.
   * @param subtractive True removes painted lines, false adds them.
   * @param event Press that started it.
   */
  begin(
    pressedLine: number,
    base: ReadonlySet<number>,
    subtractive: boolean,
    event: Pick<MouseEvent, 'clientX' | 'clientY'>,
  ): void {
    this.drag.end();
    this.pressedLine = pressedLine;
    this.base = new Set(base);
    this.subtractive = subtractive;
    this.drag.begin(event);
  }

  /** Ends the paint, keeping what it selected. */
  end(): void {
    this.drag.end();
    this.pressedLine = null;
  }
}
