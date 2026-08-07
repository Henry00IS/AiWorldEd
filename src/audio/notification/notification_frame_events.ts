/**
 * Double-buffered frame events for cheap editor feedback. Booleans gate
 * playback; floats carry pitch hints (move/rotate speed EMA, resize travel
 * distance).
 */
export class NotificationFrameEvents {
  private selectionMovedWithSnappingPending: boolean;
  private selectionMovedWithSnappingSnapshot: boolean;
  private selectionScaledWithSnappingPending: boolean;
  private selectionScaledWithSnappingSnapshot: boolean;
  private selectionRotatedWithSnappingPending: boolean;
  private selectionRotatedWithSnappingSnapshot: boolean;
  private solidCsgOperationFlippedPending: boolean;
  private solidCsgOperationFlippedSnapshot: boolean;
  private moveSpeedEma: number;
  private moveSpeedSnapshot: number;
  private lastMoveRaiseMs: number;
  private rotateSpeedEma: number;
  private rotateSpeedSnapshot: number;
  private lastRotateRaiseMs: number;
  private resizeTravelPending: number;
  private resizeTravelSnapshot: number;

  /** Creates an empty event buffer with all flags cleared. */
  constructor() {
    this.selectionMovedWithSnappingPending = false;
    this.selectionMovedWithSnappingSnapshot = false;
    this.selectionScaledWithSnappingPending = false;
    this.selectionScaledWithSnappingSnapshot = false;
    this.selectionRotatedWithSnappingPending = false;
    this.selectionRotatedWithSnappingSnapshot = false;
    this.solidCsgOperationFlippedPending = false;
    this.solidCsgOperationFlippedSnapshot = false;
    this.moveSpeedEma = 0;
    this.moveSpeedSnapshot = 0;
    this.lastMoveRaiseMs = 0;
    this.rotateSpeedEma = 0;
    this.rotateSpeedSnapshot = 0;
    this.lastRotateRaiseMs = 0;
    this.resizeTravelPending = 0;
    this.resizeTravelSnapshot = 0;
  }

  /** Snapshots pending flags for this frame and clears the pending buffer. */
  beginFrame(): void {
    this.snapshotMoveChannel();
    this.snapshotScaleChannel();
    this.snapshotRotateChannel();
    this.snapshotCsgChannel();
  }

  /**
   * Raises move-snap and folds step length into a speed EMA (world units/sec).
   *
   * @param stepLength World-space length of this snap step (default 1).
   */
  raiseSelectionMovedWithSnapping(stepLength = 1): void {
    this.selectionMovedWithSnappingPending = true;
    const folded = foldSpeedEma(this.moveSpeedEma, stepLength, this.lastMoveRaiseMs, 64);
    this.moveSpeedEma = folded.ema;
    this.lastMoveRaiseMs = folded.nowMs;
  }

  /**
   * Raises selection-scaled-with-snapping and stores absolute travel for pitch.
   * Zero travel is default pitch; larger travel raises pitch.
   *
   * @param travelDistance Absolute travel magnitude. Defaults to 0 for default
   *   pitch.
   */
  raiseSelectionScaledWithSnapping(travelDistance = 0): void {
    this.selectionScaledWithSnappingPending = true;
    this.resizeTravelPending = Math.abs(travelDistance);
  }

  /**
   * Raises selection-resized-with-snapping and stores absolute face travel for
   * pitch.
   *
   * @param travelDistance Absolute applied face displacement from drag start.
   */
  raiseSelectionResizedWithSnapping(travelDistance: number): void {
    this.raiseSelectionScaledWithSnapping(travelDistance);
  }

  /**
   * Raises rotation-snap and folds snap rate into a speed EMA (snaps/sec). Uses
   * unit steps so pitch tracks how fast snaps arrive, not angle size (avoids
   * nothing-or-extreme jumps from tiny Δt × large step radians).
   *
   * @param _stepRadians Absolute angle of this snap step (ignored for pitch).
   */
  raiseSelectionRotatedWithSnapping(_stepRadians = 0.1): void {
    this.selectionRotatedWithSnappingPending = true;
    const folded = foldSpeedEma(this.rotateSpeedEma, 1, this.lastRotateRaiseMs, 28);
    this.rotateSpeedEma = folded.ema;
    this.lastRotateRaiseMs = folded.nowMs;
  }

  /** Raises the solid CSG operation-changed event for the open frame interval. */
  raiseSolidCsgOperationFlipped(): void {
    this.solidCsgOperationFlippedPending = true;
  }

  /**
   * Returns whether selection-moved-with-snapping was raised before beginFrame.
   *
   * @returns True when the snapshot flag is set.
   */
  hasSelectionMovedWithSnappingSnapshot(): boolean {
    return this.selectionMovedWithSnappingSnapshot;
  }

  /**
   * Returns whether selection-scaled-with-snapping was raised before
   * beginFrame.
   *
   * @returns True when the snapshot flag is set.
   */
  hasSelectionScaledWithSnappingSnapshot(): boolean {
    return this.selectionScaledWithSnappingSnapshot;
  }

  /**
   * Returns whether selection-rotated-with-snapping was raised before
   * beginFrame.
   *
   * @returns True when the snapshot flag is set.
   */
  hasSelectionRotatedWithSnappingSnapshot(): boolean {
    return this.selectionRotatedWithSnappingSnapshot;
  }

  /**
   * Returns whether solid CSG operation flip was raised before beginFrame.
   *
   * @returns True when the snapshot flag is set.
   */
  hasSolidCsgOperationFlippedSnapshot(): boolean {
    return this.solidCsgOperationFlippedSnapshot;
  }

  /**
   * Returns the snapshotted move-speed EMA (world units per second).
   *
   * @returns Move-speed EMA, or 0 when no move was snapshotted this frame.
   */
  getSelectionMovedSpeedSnapshot(): number {
    return this.moveSpeedSnapshot;
  }

  /**
   * Returns the snapshotted rotate snap-rate EMA (snaps per second).
   *
   * @returns Rotate snap-rate EMA, or 0 when no rotate was snapshotted this
   *   frame.
   */
  getSelectionRotatedSpeedSnapshot(): number {
    return this.rotateSpeedSnapshot;
  }

  /**
   * Returns the snapshotted scale/resize travel magnitude (0 = default pitch).
   *
   * @returns Absolute travel snapshot, or 0 when none was snapshotted this
   *   frame.
   */
  getSelectionResizeTravelSnapshot(): number {
    return this.resizeTravelSnapshot;
  }

  /**
   * Returns whether any snap feedback snapshot flag is set this frame.
   *
   * @returns True when any snapshotted feedback flag is set.
   */
  hasAnySnapFeedbackSnapshot(): boolean {
    return (
      this.selectionMovedWithSnappingSnapshot ||
      this.selectionScaledWithSnappingSnapshot ||
      this.selectionRotatedWithSnappingSnapshot ||
      this.solidCsgOperationFlippedSnapshot
    );
  }

  /** Clears all pending flags, snapshot flags, speed EMAs, and travel values. */
  reset(): void {
    this.selectionMovedWithSnappingPending = false;
    this.selectionMovedWithSnappingSnapshot = false;
    this.selectionScaledWithSnappingPending = false;
    this.selectionScaledWithSnappingSnapshot = false;
    this.selectionRotatedWithSnappingPending = false;
    this.selectionRotatedWithSnappingSnapshot = false;
    this.solidCsgOperationFlippedPending = false;
    this.solidCsgOperationFlippedSnapshot = false;
    this.moveSpeedEma = 0;
    this.moveSpeedSnapshot = 0;
    this.lastMoveRaiseMs = 0;
    this.rotateSpeedEma = 0;
    this.rotateSpeedSnapshot = 0;
    this.lastRotateRaiseMs = 0;
    this.resizeTravelPending = 0;
    this.resizeTravelSnapshot = 0;
  }

  /** Snapshots move flag and speed, then clears the move pending bit. */
  private snapshotMoveChannel(): void {
    this.selectionMovedWithSnappingSnapshot = this.selectionMovedWithSnappingPending;
    this.moveSpeedSnapshot = this.selectionMovedWithSnappingPending ? this.moveSpeedEma : 0;
    this.selectionMovedWithSnappingPending = false;
  }

  /** Snapshots scale/resize flag and travel distance. */
  private snapshotScaleChannel(): void {
    this.selectionScaledWithSnappingSnapshot = this.selectionScaledWithSnappingPending;
    this.resizeTravelSnapshot = this.selectionScaledWithSnappingPending ? this.resizeTravelPending : 0;
    this.selectionScaledWithSnappingPending = false;
    this.resizeTravelPending = 0;
  }

  /**
   * Snapshots rotate flag and snap-rate EMA, then clears the rotate pending
   * bit.
   */
  private snapshotRotateChannel(): void {
    this.selectionRotatedWithSnappingSnapshot = this.selectionRotatedWithSnappingPending;
    this.rotateSpeedSnapshot = this.selectionRotatedWithSnappingPending ? this.rotateSpeedEma : 0;
    this.selectionRotatedWithSnappingPending = false;
  }

  /** Snapshots CSG flag and clears the CSG pending bit. */
  private snapshotCsgChannel(): void {
    this.solidCsgOperationFlippedSnapshot = this.solidCsgOperationFlippedPending;
    this.solidCsgOperationFlippedPending = false;
  }
}

/** Smoothing time constant (ms) for move/rotate speed pitch. */
const SPEED_EMA_TAU_MS = 45;

/**
 * Folds one snap step into a wall-clock speed EMA (framerate-independent).
 * Instant sample is step/Δt (clamped); blend uses alpha = 1 - exp(-Δt/τ).
 *
 * @param previousEma Prior EMA value.
 * @param stepLength Non-negative step magnitude.
 * @param lastRaiseMs Previous raise time from performance.now, or 0.
 * @param maxSample Cap on instantaneous sample to blunt tiny-Δt spikes.
 * @returns Updated EMA and the now timestamp used for Δt.
 */
function foldSpeedEma(
  previousEma: number,
  stepLength: number,
  lastRaiseMs: number,
  maxSample: number,
): { ema: number; nowMs: number } {
  const nowMs = performance.now();
  return {
    ema: foldSnapSpeedEmaAtTime(previousEma, stepLength, lastRaiseMs, nowMs, maxSample),
    nowMs,
  };
}

/**
 * Folds one snap step into a time-constant speed EMA using supplied timestamps.
 *
 * @param previousEma Prior EMA value.
 * @param stepLength Non-negative step magnitude.
 * @param lastRaiseMs Previous raise time, or 0.
 * @param nowMs Current time in ms.
 * @param maxSample Cap on instantaneous sample; defaults to uncapped.
 * @returns Updated EMA in units per second.
 */
export function foldSnapSpeedEmaAtTime(
  previousEma: number,
  stepLength: number,
  lastRaiseMs: number,
  nowMs: number,
  maxSample = Number.POSITIVE_INFINITY,
): number {
  const dtMs = lastRaiseMs <= 0 ? SPEED_EMA_TAU_MS : Math.max(1, nowMs - lastRaiseMs);
  const rawSample = Math.max(0, stepLength) / (dtMs * 0.001);
  const sample = rawSample > maxSample ? maxSample : rawSample;
  if (lastRaiseMs <= 0 || previousEma <= 0) {
    return sample;
  }
  const alpha = 1 - Math.exp(-dtMs / SPEED_EMA_TAU_MS);
  return previousEma + alpha * (sample - previousEma);
}

/** Shared double-buffered NotificationFrameEvents instance. */
export const notificationFrameEvents = new NotificationFrameEvents();
