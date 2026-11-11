import { Theme } from '@/theme.js';
import { hexToRgb } from '@/utils/utils_color.js';

/** Minimum thumb height so the grip stays usable on long lists. */
const VIRTUAL_LIST_SCROLLBAR_THUMB_MIN_PX = 18;

/** Track width matching a compact vertical scrollbar. */
const VIRTUAL_LIST_SCROLLBAR_TRACK_WIDTH_PX = 12;

/** Height of each arrow button at the ends of the scrollbar. */
const VIRTUAL_LIST_SCROLLBAR_ARROW_HEIGHT_PX = 12;

/**
 * Callback invoked when the user drags or clicks the scrollbar track.
 *
 * @param scrollPercent Normalized scroll position in [0, 1].
 */
export type VirtualListScrollbarPercentCallback = (scrollPercent: number) => void;

/**
 * Callback invoked when the user clicks a scrollbar arrow.
 *
 * @param deltaPx Signed scroll delta in CSS pixels (positive scrolls down).
 */
export type VirtualListScrollbarStepCallback = (deltaPx: number) => void;

/**
 * Custom vertical scrollbar for a virtual list. Draws arrows, track, and thumb
 * and maps pointer input to scroll percent or step deltas without native
 * overflow.
 */
export class VirtualListScrollbar {
  private readonly rootElement: HTMLElement;
  private readonly trackElement: HTMLElement;
  private readonly thumbElement: HTMLElement;
  private readonly arrowUpElement: HTMLElement;
  private readonly arrowDownElement: HTMLElement;
  private onPercentChange: VirtualListScrollbarPercentCallback | null;
  private onStep: VirtualListScrollbarStepCallback | null;
  private isDragging: boolean;
  private dragPointerId: number;
  private dragGrabOffsetPx: number;
  private isDisposed: boolean;
  private stepRowHeightPx: number;
  private readonly pointerDownBound: (event: PointerEvent) => void;
  private readonly pointerMoveBound: (event: PointerEvent) => void;
  private readonly pointerUpBound: (event: PointerEvent) => void;

  /** Creates a detached custom scrollbar ready to attach under a host. */
  constructor() {
    this.rootElement = document.createElement('div');
    this.trackElement = document.createElement('div');
    this.thumbElement = document.createElement('div');
    this.arrowUpElement = document.createElement('div');
    this.arrowDownElement = document.createElement('div');
    this.onPercentChange = null;
    this.onStep = null;
    this.isDragging = false;
    this.dragPointerId = -1;
    this.dragGrabOffsetPx = 0;
    this.isDisposed = false;
    this.stepRowHeightPx = 22;
    this.pointerDownBound = (event) => this.pointerDownHandle(event);
    this.pointerMoveBound = (event) => this.pointerMoveHandle(event);
    this.pointerUpBound = (event) => this.pointerUpHandle(event);
    this.rootStylesApply();
    this.arrowStylesApply(this.arrowUpElement, '▲');
    this.arrowStylesApply(this.arrowDownElement, '▼');
    this.trackStylesApply();
    this.thumbStylesApply();
    this.trackElement.appendChild(this.thumbElement);
    this.rootElement.appendChild(this.arrowUpElement);
    this.rootElement.appendChild(this.trackElement);
    this.rootElement.appendChild(this.arrowDownElement);
    this.rootElement.addEventListener('pointerdown', this.pointerDownBound);
  }

  /**
   * Returns the root element to append into a host.
   *
   * @returns Scrollbar root DOM element.
   */
  getElement(): HTMLElement {
    return this.rootElement;
  }

  /**
   * Registers the scroll-percent change callback.
   *
   * @param callback Function receiving normalized percent in [0, 1].
   */
  onPercentChangeSet(callback: VirtualListScrollbarPercentCallback | null): void {
    this.onPercentChange = callback;
  }

  /**
   * Registers the arrow step callback.
   *
   * @param callback Function receiving a signed pixel delta.
   */
  onStepSet(callback: VirtualListScrollbarStepCallback | null): void {
    this.onStep = callback;
  }

  /**
   * Sets the pixel step used when an arrow button is clicked.
   *
   * @param rowHeightPx Height of one logical row in CSS pixels.
   */
  stepRowHeightPxSet(rowHeightPx: number): void {
    this.stepRowHeightPx = Math.max(1, rowHeightPx);
  }

  /**
   * Updates thumb size and position from viewport and content metrics.
   *
   * @param viewportHeightPx Visible viewport height in CSS pixels.
   * @param contentHeightPx Total content height in CSS pixels.
   * @param scrollPercent Normalized scroll position in [0, 1].
   * @param overflowIs True when content overflows the viewport.
   */
  metricsSync(viewportHeightPx: number, contentHeightPx: number, scrollPercent: number, overflowIs: boolean): void {
    if (this.isDisposed) {
      return;
    }
    if (!overflowIs || contentHeightPx <= 0 || viewportHeightPx <= 0) {
      this.rootElement.style.display = 'none';
      return;
    }
    this.rootElement.style.display = 'flex';
    const trackHeight = this.trackHeightResolve(viewportHeightPx);
    const thumbHeight = this.thumbHeightResolve(trackHeight, viewportHeightPx, contentHeightPx);
    const maxThumbTop = Math.max(0, trackHeight - thumbHeight);
    const thumbTop = maxThumbTop * Math.max(0, Math.min(1, scrollPercent));
    this.thumbElement.style.height = `${Math.round(thumbHeight)}px`;
    this.thumbElement.style.top = `${Math.round(thumbTop)}px`;
  }

  /** Removes listeners and detaches the scrollbar from the DOM. */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    this.pointerDragEnd();
    this.rootElement.removeEventListener('pointerdown', this.pointerDownBound);
    if (this.rootElement.parentNode) {
      this.rootElement.parentNode.removeChild(this.rootElement);
    }
  }

  /** Applies base styles to the scrollbar root column. */
  private rootStylesApply(): void {
    this.rootElement.style.position = 'absolute';
    this.rootElement.style.top = '0';
    this.rootElement.style.right = '0';
    this.rootElement.style.bottom = '0';
    this.rootElement.style.width = `${VIRTUAL_LIST_SCROLLBAR_TRACK_WIDTH_PX}px`;
    this.rootElement.style.display = 'none';
    this.rootElement.style.flexDirection = 'column';
    this.rootElement.style.boxSizing = 'border-box';
    this.rootElement.style.zIndex = '15';
    this.rootElement.style.cursor = 'default';
    this.rootElement.style.userSelect = 'none';
    this.rootElement.style.background = 'rgba(0, 0, 0, 0.28)';
  }

  /**
   * Applies styles to an arrow button and sets its glyph.
   *
   * @param arrowElement Arrow button element.
   * @param glyph Arrow character to display.
   */
  private arrowStylesApply(arrowElement: HTMLElement, glyph: string): void {
    arrowElement.textContent = glyph;
    arrowElement.style.flex = `0 0 ${VIRTUAL_LIST_SCROLLBAR_ARROW_HEIGHT_PX}px`;
    arrowElement.style.height = `${VIRTUAL_LIST_SCROLLBAR_ARROW_HEIGHT_PX}px`;
    arrowElement.style.lineHeight = `${VIRTUAL_LIST_SCROLLBAR_ARROW_HEIGHT_PX}px`;
    arrowElement.style.textAlign = 'center';
    arrowElement.style.fontSize = '8px';
    arrowElement.style.color = 'rgba(210, 210, 210, 0.85)';
    arrowElement.style.cursor = 'default';
    arrowElement.style.boxSizing = 'border-box';
  }

  /** Applies base styles to the track between the arrows. */
  private trackStylesApply(): void {
    this.trackElement.style.position = 'relative';
    this.trackElement.style.flex = '1 1 auto';
    this.trackElement.style.minHeight = '0';
    this.trackElement.style.width = '100%';
    this.trackElement.style.cursor = 'default';
    this.trackElement.style.boxSizing = 'border-box';
  }

  /** Applies base styles to the thumb. */
  private thumbStylesApply(): void {
    this.thumbElement.style.position = 'absolute';
    this.thumbElement.style.left = '1px';
    this.thumbElement.style.right = '1px';
    this.thumbElement.style.top = '0';
    this.thumbElement.style.height = `${VIRTUAL_LIST_SCROLLBAR_THUMB_MIN_PX}px`;
    this.thumbElement.style.borderRadius = '3px';
    this.thumbElement.style.background = 'rgba(160, 160, 160, 0.75)';
    this.thumbElement.style.border = `1px solid ${hexToRgb(Theme.separatorColor)}`;
    this.thumbElement.style.boxSizing = 'border-box';
    this.thumbElement.style.cursor = 'default';
  }

  /**
   * Resolves usable track height after subtracting the arrow buttons.
   *
   * @param viewportHeightPx Host viewport height in CSS pixels.
   * @returns Track height in CSS pixels.
   */
  private trackHeightResolve(viewportHeightPx: number): number {
    const arrows = VIRTUAL_LIST_SCROLLBAR_ARROW_HEIGHT_PX * 2;
    return Math.max(0, viewportHeightPx - arrows);
  }

  /**
   * Resolves thumb height proportional to the viewport fraction of content.
   *
   * @param trackHeight Track height in CSS pixels.
   * @param viewportHeightPx Viewport height in CSS pixels.
   * @param contentHeightPx Content height in CSS pixels.
   * @returns Thumb height in CSS pixels.
   */
  private thumbHeightResolve(trackHeight: number, viewportHeightPx: number, contentHeightPx: number): number {
    const ratio = Math.min(1, viewportHeightPx / Math.max(1, contentHeightPx));
    return Math.max(VIRTUAL_LIST_SCROLLBAR_THUMB_MIN_PX, Math.round(trackHeight * ratio));
  }

  /**
   * Handles pointer down on arrows, track, or thumb.
   *
   * @param event Pointer event.
   */
  private pointerDownHandle(event: PointerEvent): void {
    if (this.isDisposed || event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (this.arrowHitHandle(event.target)) {
      return;
    }
    this.trackOrThumbPointerDownHandle(event);
  }

  /**
   * Handles a click on either arrow button.
   *
   * @param eventTarget Event target under the pointer.
   * @returns True when an arrow handled the event.
   */
  private arrowHitHandle(eventTarget: EventTarget | null): boolean {
    if (eventTarget === this.arrowUpElement || this.arrowUpElement.contains(eventTarget as Node)) {
      this.onStep?.(-this.stepRowHeightPx);
      return true;
    }
    if (eventTarget === this.arrowDownElement || this.arrowDownElement.contains(eventTarget as Node)) {
      this.onStep?.(this.stepRowHeightPx);
      return true;
    }
    return false;
  }

  /**
   * Handles pointer down on the track or thumb for jump or drag.
   *
   * @param event Pointer event.
   */
  private trackOrThumbPointerDownHandle(event: PointerEvent): void {
    const trackRect = this.trackElement.getBoundingClientRect();
    const thumbRect = this.thumbElement.getBoundingClientRect();
    const isOnThumb = event.target === this.thumbElement || this.thumbElement.contains(event.target as Node);
    if (isOnThumb) {
      this.dragStart(event, event.clientY - thumbRect.top);
      return;
    }
    this.trackJumpToClientY(event.clientY, trackRect);
    this.dragStart(event, thumbRect.height / 2);
  }

  /**
   * Begins a thumb drag session.
   *
   * @param event Pointer that started the drag.
   * @param grabOffsetPx Offset from thumb top to the pointer.
   */
  private dragStart(event: PointerEvent, grabOffsetPx: number): void {
    this.isDragging = true;
    this.dragPointerId = event.pointerId;
    this.dragGrabOffsetPx = grabOffsetPx;
    this.rootElement.setPointerCapture(event.pointerId);
    window.addEventListener('pointermove', this.pointerMoveBound);
    window.addEventListener('pointerup', this.pointerUpBound);
    window.addEventListener('pointercancel', this.pointerUpBound);
  }

  /**
   * Handles pointer move while dragging the thumb.
   *
   * @param event Pointer event.
   */
  private pointerMoveHandle(event: PointerEvent): void {
    if (!this.isDragging || event.pointerId !== this.dragPointerId) {
      return;
    }
    event.preventDefault();
    const trackRect = this.trackElement.getBoundingClientRect();
    const thumbHeight = this.thumbElement.getBoundingClientRect().height;
    const y = event.clientY - trackRect.top - this.dragGrabOffsetPx;
    this.percentFromThumbTopApply(y, trackRect.height, thumbHeight);
  }

  /**
   * Handles pointer up / cancel ending a thumb drag.
   *
   * @param event Pointer event.
   */
  private pointerUpHandle(event: PointerEvent): void {
    if (!this.isDragging || event.pointerId !== this.dragPointerId) {
      return;
    }
    this.pointerDragEnd();
  }

  /** Clears drag listeners and pointer capture. */
  private pointerDragEnd(): void {
    if (!this.isDragging) {
      return;
    }
    this.isDragging = false;
    if (this.dragPointerId >= 0) {
      try {
        this.rootElement.releasePointerCapture(this.dragPointerId);
      } catch {
        // ignore release failures when capture was already lost
      }
    }
    this.dragPointerId = -1;
    window.removeEventListener('pointermove', this.pointerMoveBound);
    window.removeEventListener('pointerup', this.pointerUpBound);
    window.removeEventListener('pointercancel', this.pointerUpBound);
  }

  /**
   * Jumps the scroll percent so the thumb centers under a track click.
   *
   * @param clientY Pointer Y in viewport coordinates.
   * @param trackRect Track bounding rect.
   */
  private trackJumpToClientY(clientY: number, trackRect: DOMRect): void {
    const thumbHeight = this.thumbElement.getBoundingClientRect().height;
    const y = clientY - trackRect.top - thumbHeight / 2;
    this.percentFromThumbTopApply(y, trackRect.height, thumbHeight);
  }

  /**
   * Converts a thumb top into a scroll percent and notifies listeners.
   *
   * @param thumbTopPx Thumb top relative to the track.
   * @param trackHeightPx Track height in CSS pixels.
   * @param thumbHeightPx Thumb height in CSS pixels.
   */
  private percentFromThumbTopApply(thumbTopPx: number, trackHeightPx: number, thumbHeightPx: number): void {
    const maxTop = Math.max(0, trackHeightPx - thumbHeightPx);
    if (maxTop <= 0) {
      this.onPercentChange?.(0);
      return;
    }
    const percent = Math.max(0, Math.min(1, thumbTopPx / maxTop));
    this.onPercentChange?.(percent);
  }
}
