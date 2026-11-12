import { outlinerDragEdgeScrollBandContains, outlinerDragEdgeScrollDeltaResolve } from './outliner_drop_placement.js';

/** What the edge auto-scroll needs from the gesture that drives it. */
export interface OutlinerEdgeAutoScrollHost {
  /**
   * Returns the scrollable tree host element.
   *
   * @returns Tree DOM element.
   */
  getTreeElement(): HTMLElement;

  /**
   * Scrolls the tree by a pixel delta.
   *
   * @param deltaY Delta in CSS pixels (positive scrolls down).
   * @returns True when the scroll offset changed.
   */
  scrollByDeltaPx(deltaY: number): boolean;

  /**
   * Returns the last pointer position in viewport coordinates.
   *
   * @returns Pointer position.
   */
  pointerGet(): { clientX: number; clientY: number };

  /**
   * Returns whether the gesture still wants edge scrolling at the pointer.
   *
   * @returns True while the gesture runs and the pointer counts as over the
   *   tree.
   */
  scrollWanted(): boolean;

  /** Called after an animation frame scrolled the tree. */
  onFrameScrolled(): void;
}

/**
 * Scrolls the outliner while a pointer gesture lingers near its top or bottom
 * edge: one step per call, plus an animation-frame loop so a still pointer
 * keeps scrolling. Speed eases in with depth into the band and hold time.
 */
export class OutlinerEdgeAutoScroll {
  private readonly host: OutlinerEdgeAutoScrollHost;
  private readonly frameBound: () => void;
  private frameId: number | null;
  private holdStartedAtMs: number | null;

  /**
   * Creates an idle edge auto-scroll.
   *
   * @param host Gesture that drives the scrolling.
   */
  constructor(host: OutlinerEdgeAutoScrollHost) {
    this.host = host;
    this.frameBound = () => this.frameHandle();
    this.frameId = null;
    this.holdStartedAtMs = null;
  }

  /**
   * Applies one scroll step from the last pointer position and hold time.
   *
   * @returns True when the scroll offset changed.
   */
  tick(): boolean {
    const treeRect = this.host.getTreeElement().getBoundingClientRect();
    const { clientY } = this.host.pointerGet();
    if (!outlinerDragEdgeScrollBandContains(clientY, treeRect.top, treeRect.bottom)) {
      this.holdReset();
      return false;
    }
    if (this.holdStartedAtMs === null) this.holdStartedAtMs = performance.now();
    const holdDurationMs = performance.now() - this.holdStartedAtMs;
    const deltaY = outlinerDragEdgeScrollDeltaResolve(clientY, treeRect.top, treeRect.bottom, holdDurationMs);
    if (deltaY === 0) return false;
    return this.host.scrollByDeltaPx(deltaY);
  }

  /** Starts the animation-frame loop unless it already runs. */
  loopStart(): void {
    if (this.frameId !== null) return;
    this.frameId = requestAnimationFrame(this.frameBound);
  }

  /** Cancels the animation-frame loop. */
  loopStop(): void {
    if (this.frameId === null) return;
    cancelAnimationFrame(this.frameId);
    this.frameId = null;
  }

  /** Stops the loop and forgets the hold time. */
  stop(): void {
    this.loopStop();
    this.holdReset();
  }

  /** Forgets how long the pointer has stayed in an edge band. */
  holdReset(): void {
    this.holdStartedAtMs = null;
  }

  /** One animation frame of edge scrolling while the pointer stays in a band. */
  private frameHandle(): void {
    this.frameId = null;
    if (!this.host.scrollWanted()) {
      this.holdReset();
      return;
    }
    const treeRect = this.host.getTreeElement().getBoundingClientRect();
    if (!outlinerDragEdgeScrollBandContains(this.host.pointerGet().clientY, treeRect.top, treeRect.bottom)) {
      this.holdReset();
      return;
    }
    if (this.tick()) this.host.onFrameScrolled();
    this.loopStart();
  }
}
