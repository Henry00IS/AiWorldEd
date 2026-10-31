/**
 * Decides whether a one-shot may call start() from movement of currentTime. A
 * running context whose currentTime is unchanged is not schedulable.
 */
export class AudioOutputClockGate {
  private sampledCurrentTime: number | null;
  private hasClockMoved: boolean;

  /** Creates a gate with no stored sample and no movement latch. */
  constructor() {
    this.sampledCurrentTime = null;
    this.hasClockMoved = false;
  }

  /**
   * Samples the context clock and reports whether a one-shot may start.
   *
   * @param context Audio context whose currentTime is sampled.
   * @returns True after the running clock has changed from the stored sample.
   */
  canScheduleOneShot(context: AudioContext): boolean {
    if (context.state !== 'running') {
      this.invalidate();
      return false;
    }
    return this.noteFiniteSample(context.currentTime);
  }

  /** Clears the stored sample and the movement latch. */
  invalidate(): void {
    this.sampledCurrentTime = null;
    this.hasClockMoved = false;
  }

  /**
   * Records a finite sample and latches when it differs from the stored one.
   *
   * @param currentTime Sample read from the running context.
   * @returns True when movement was already latched or this sample latches it.
   */
  private noteFiniteSample(currentTime: number): boolean {
    if (!Number.isFinite(currentTime)) {
      return false;
    }
    this.latchIfSampleMoved(currentTime);
    this.sampledCurrentTime = currentTime;
    return this.hasClockMoved;
  }

  /**
   * Latches movement when the sample differs from the stored finite sample.
   *
   * @param currentTime Finite sample from the running context.
   */
  private latchIfSampleMoved(currentTime: number): void {
    if (this.sampledCurrentTime === null) {
      return;
    }
    if (currentTime !== this.sampledCurrentTime) {
      this.hasClockMoved = true;
    }
  }
}
