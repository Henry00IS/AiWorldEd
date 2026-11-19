/** How fast a list scrolls while a drag lingers near its top or bottom edge. */
export interface DragEdgeScrollTuning {
  /**
   * Pointer distance from the top or bottom edge that starts scrolling. HTML5
   * drags get no wheel events, so edge scrolling is the reliable way to reach
   * rows out of view. A wide band keeps early motion subtle before the ease
   * ramps up near the rim.
   */
  edgePx: number;
  /** Rows scrolled per animation frame at the inner edge of the band. */
  minRows: number;
  /** Rows scrolled per animation frame at the outer edge after a full hold. */
  maxRows: number;
  /**
   * Ease exponent for depth into the band; higher keeps speed low until the
   * rim.
   */
  easePower: number;
  /**
   * Time in the band before full speed, so grabbing an edge row does not fling
   * the list.
   */
  holdRampMs: number;
  /** Row height the row counts are measured in, in CSS pixels. */
  rowHeightPx: number;
}

/** The outliner's tuning, shared by every list that scrolls during a drag. */
export const DRAG_EDGE_SCROLL_TUNING: Readonly<DragEdgeScrollTuning> = {
  edgePx: 96,
  minRows: 0.02,
  maxRows: 8,
  easePower: 6,
  holdRampMs: 2000,
  rowHeightPx: 22,
};

/**
 * Scroll step for a drag near a list edge, per animation frame. Combines a
 * high-power ease with depth into the band and a ramp with hold time.
 *
 * @param clientY Pointer Y in viewport coordinates.
 * @param top List top edge in viewport coordinates.
 * @param bottom List bottom edge in viewport coordinates.
 * @param holdMs How long the pointer has stayed in an edge band.
 * @param tuning Speeds and band size.
 * @returns Signed delta in CSS pixels (negative scrolls up), or 0.
 */
export function dragEdgeScrollDeltaResolve(
  clientY: number,
  top: number,
  bottom: number,
  holdMs: number = DRAG_EDGE_SCROLL_TUNING.holdRampMs,
  tuning: Readonly<DragEdgeScrollTuning> = DRAG_EDGE_SCROLL_TUNING,
): number {
  if (!Number.isFinite(clientY) || !Number.isFinite(top) || !Number.isFinite(bottom)) return 0;
  const hold = dragEdgeScrollHoldFactorResolve(holdMs, tuning);
  if (hold <= 0) return 0;
  const up = dragEdgeScrollBandDelta(clientY - top, -1, hold, tuning);
  if (up !== 0) return up;
  return dragEdgeScrollBandDelta(bottom - clientY, 1, hold, tuning);
}

/**
 * Returns whether the pointer is inside an edge band of a list.
 *
 * @param clientY Pointer Y in viewport coordinates.
 * @param top List top edge in viewport coordinates.
 * @param bottom List bottom edge in viewport coordinates.
 * @param tuning Band size.
 * @returns True when edge scrolling may run.
 */
export function dragEdgeScrollBandContains(
  clientY: number,
  top: number,
  bottom: number,
  tuning: Readonly<DragEdgeScrollTuning> = DRAG_EDGE_SCROLL_TUNING,
): boolean {
  if (!Number.isFinite(clientY) || !Number.isFinite(top) || !Number.isFinite(bottom)) return false;
  return clientY - top < tuning.edgePx || bottom - clientY < tuning.edgePx;
}

/**
 * Hold-time ramp, easing in over the tuning's hold time.
 *
 * @param holdMs Time spent continuously in an edge band.
 * @param tuning Hold time.
 * @returns Factor in [0, 1].
 */
export function dragEdgeScrollHoldFactorResolve(
  holdMs: number,
  tuning: Readonly<DragEdgeScrollTuning> = DRAG_EDGE_SCROLL_TUNING,
): number {
  if (!Number.isFinite(holdMs) || holdMs <= 0) return 0;
  const linear = Math.min(1, holdMs / tuning.holdRampMs);
  return linear * linear;
}

/**
 * High-power ease for depth into the band: early motion stays subtle and high
 * speed is kept for the outer rim.
 *
 * @param depth Depth in [0, 1] (0 = inner edge of the band, 1 = list edge).
 * @param tuning Ease exponent.
 * @returns Eased depth in [0, 1].
 */
export function dragEdgeScrollEaseInPower(
  depth: number,
  tuning: Readonly<DragEdgeScrollTuning> = DRAG_EDGE_SCROLL_TUNING,
): number {
  if (!Number.isFinite(depth) || depth <= 0) return 0;
  if (depth >= 1) return 1;
  return Math.pow(depth, tuning.easePower);
}

/**
 * Turns the distance into one edge band into a signed step.
 *
 * @param distance Distance from the list edge toward the middle.
 * @param sign Negative scrolls up, positive down.
 * @param hold Hold ramp in [0, 1].
 * @param tuning Speeds and band size.
 * @returns Signed delta in CSS pixels, or 0 outside the band.
 */
function dragEdgeScrollBandDelta(
  distance: number,
  sign: number,
  hold: number,
  tuning: Readonly<DragEdgeScrollTuning>,
): number {
  if (distance >= tuning.edgePx) return 0;
  const depth = 1 - Math.max(0, distance) / tuning.edgePx;
  const eased = dragEdgeScrollEaseInPower(depth, tuning) * hold;
  const rows = tuning.minRows + (tuning.maxRows - tuning.minRows) * eased;
  const pixels = Math.round(rows * tuning.rowHeightPx);
  return pixels <= 0 ? 0 : sign * pixels;
}

/** What edge scrolling needs from the drag that drives it. */
export interface DragEdgeAutoScrollHost {
  /** The scrolling list, whose top and bottom edges hold the bands. */
  element(): HTMLElement;
  /**
   * Scrolls the list.
   *
   * @param deltaY Delta in CSS pixels (positive scrolls down).
   * @returns True when the list moved.
   */
  scrollBy(deltaY: number): boolean;
  /** The last pointer position in viewport coordinates. */
  pointerGet(): { clientX: number; clientY: number };
  /** Whether the drag still runs and counts as over the list. */
  scrollWanted(): boolean;
  /** Called after an animation frame scrolled the list. */
  onFrameScrolled?(): void;
}

/**
 * Scrolls a list while a drag lingers near its top or bottom edge: one step per
 * call, plus an animation-frame loop so a still pointer keeps scrolling. Speed
 * eases in with depth into the band and with hold time.
 */
export class DragEdgeAutoScroll {
  private readonly frameBound = (): void => this.frameHandle();
  private frameId: number | null = null;
  private holdStartedAtMs: number | null = null;

  /**
   * Creates an idle edge scroll.
   *
   * @param host Drag that drives the scrolling.
   * @param tuning Speeds and band size.
   */
  constructor(
    private readonly host: DragEdgeAutoScrollHost,
    private readonly tuning: Readonly<DragEdgeScrollTuning> = DRAG_EDGE_SCROLL_TUNING,
  ) {}

  /**
   * Applies one step from the last pointer position and hold time.
   *
   * @returns True when the list moved.
   */
  tick(): boolean {
    const box = this.host.element().getBoundingClientRect();
    const { clientY } = this.host.pointerGet();
    if (!dragEdgeScrollBandContains(clientY, box.top, box.bottom, this.tuning)) {
      this.holdReset();
      return false;
    }
    this.holdStartedAtMs ??= performance.now();
    const delta = dragEdgeScrollDeltaResolve(
      clientY,
      box.top,
      box.bottom,
      performance.now() - this.holdStartedAtMs,
      this.tuning,
    );
    return delta !== 0 && this.host.scrollBy(delta);
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

  /** One animation frame of scrolling while the pointer stays in a band. */
  private frameHandle(): void {
    this.frameId = null;
    if (!this.host.scrollWanted()) return this.holdReset();
    const box = this.host.element().getBoundingClientRect();
    if (!dragEdgeScrollBandContains(this.host.pointerGet().clientY, box.top, box.bottom, this.tuning))
      return this.holdReset();
    if (this.tick()) this.host.onFrameScrolled?.();
    this.loopStart();
  }
}
