import { DRAG_EDGE_SCROLL_TUNING, DragEdgeAutoScroll, type DragEdgeScrollTuning } from './drag_edge_scroll.js';

/** What a paint drag over a row list needs from the list. */
export interface RowPaintDragHost {
  /**
   * Returns the scrolling row list, whose top and bottom edges scroll it.
   *
   * @returns List element.
   */
  element(): HTMLElement;
  /**
   * Scrolls the list.
   *
   * @param deltaY Pixels down, or up when negative.
   * @returns True when the list moved.
   */
  scrollBy(deltaY: number): boolean;
  /**
   * Returns the row under a pointer height, clamped to the list.
   *
   * @param clientY Pointer height in client pixels.
   * @returns Row index, or null when the list has no rows.
   */
  rowAt(clientY: number): number | null;
  /**
   * Returns the row the drag started on now, since rows may move while it runs.
   *
   * @returns Row index, or null when it is gone.
   */
  anchorRow(): number | null;
  /**
   * Paints the rows from the anchor to the row under the pointer.
   *
   * @param first First painted row.
   * @param last Last painted row.
   * @param pointerRow Row under the pointer.
   * @param firstStep True for the first paint of the drag.
   */
  paint(first: number, last: number, pointerRow: number, firstStep: boolean): void;
}

/**
 * Modifier-drag paint over a row list, shared by the outliner and the script
 * editor: after a press on a row, moving with the button held paints every row
 * from that row to the one under the pointer. Holding the pointer near the top
 * or bottom edge scrolls the list, and the rows that scroll under the pointer
 * are painted too. Nothing is painted until the pointer reaches another row, so
 * a plain modifier click keeps its own behaviour.
 */
export class RowPaintDrag {
  private active = false;
  private paintedFirst: number | null = null;
  private paintedLast: number | null = null;
  private readonly pointer = { clientX: 0, clientY: 0 };
  private readonly edgeScroll: DragEdgeAutoScroll;
  private readonly mouseMoveBound = (event: MouseEvent): void => this.mouseMove(event);
  private readonly mouseUpBound = (): void => this.end();

  /**
   * Creates an idle paint drag.
   *
   * @param host Row list callbacks.
   * @param tuning Edge scroll speeds, in rows of the list.
   */
  constructor(
    private readonly host: RowPaintDragHost,
    tuning: Readonly<DragEdgeScrollTuning> = DRAG_EDGE_SCROLL_TUNING,
  ) {
    this.edgeScroll = new DragEdgeAutoScroll(
      {
        element: () => this.host.element(),
        scrollBy: (deltaY) => this.host.scrollBy(deltaY),
        pointerGet: () => this.pointer,
        scrollWanted: () => this.active,
        onFrameScrolled: () => this.paintedUpdate(),
      },
      tuning,
    );
  }

  /**
   * Returns whether a paint drag is running.
   *
   * @returns True between begin and end.
   */
  isActive(): boolean {
    return this.active;
  }

  /**
   * Starts a paint drag at the pressed pointer.
   *
   * @param event Press that started it.
   */
  begin(event: Pick<MouseEvent, 'clientX' | 'clientY'>): void {
    this.end();
    this.active = true;
    this.pointer.clientX = event.clientX;
    this.pointer.clientY = event.clientY;
    document.addEventListener('mousemove', this.mouseMoveBound, true);
    document.addEventListener('mouseup', this.mouseUpBound, true);
  }

  /** Ends the paint drag, keeping what it painted. */
  end(): void {
    this.active = false;
    this.paintedFirst = null;
    this.paintedLast = null;
    this.edgeScroll.stop();
    document.removeEventListener('mousemove', this.mouseMoveBound, true);
    document.removeEventListener('mouseup', this.mouseUpBound, true);
  }

  /**
   * Paints up to the row under the pointer and scrolls near an edge.
   *
   * @param event Mouse move anywhere on the page.
   */
  private mouseMove(event: MouseEvent): void {
    if ((event.buttons & 1) === 0) return this.end();
    event.preventDefault();
    this.pointer.clientX = event.clientX;
    this.pointer.clientY = event.clientY;
    this.paintedUpdate();
    this.edgeScroll.tick();
    this.edgeScroll.loopStart();
  }

  /**
   * Paints from the anchor to the row under the pointer when that range
   * changed.
   */
  private paintedUpdate(): void {
    if (!this.active) return;
    const anchor = this.host.anchorRow();
    const pointerRow = this.host.rowAt(this.pointer.clientY);
    if (anchor === null || pointerRow === null) return;
    if (this.paintedFirst === null && pointerRow === anchor) return;
    const first = Math.min(anchor, pointerRow);
    const last = Math.max(anchor, pointerRow);
    if (first === this.paintedFirst && last === this.paintedLast) return;
    const firstStep = this.paintedFirst === null;
    this.paintedFirst = first;
    this.paintedLast = last;
    this.host.paint(first, last, pointerRow, firstStep);
  }
}
