/**
 * Configuration values controlling camera fit animation behavior.
 * Provides defaults and getters/setters for runtime tuning.
 */
export class CameraAnimationConfig {
  private durationMs: number;
  private paddingFactor: number;
  private animationEnabled: boolean;

  /**
   * Creates a new animation config with default values.
   */
  constructor() {
    this.durationMs = 300;
    this.paddingFactor = 1.5;
    this.animationEnabled = true;
  }

  /**
   * Returns the animation duration in milliseconds.
   * @returns The duration value.
   */
  getDurationMs(): number {
    return this.durationMs;
  }

  /**
   * Sets the animation duration in milliseconds.
   * @param durationMs The new duration value (must be non-negative).
   */
  setDurationMs(durationMs: number): void {
    this.durationMs = Math.max(0, durationMs);
  }

  /**
   * Returns the padding factor applied around the bounding volume.
   * @returns The padding factor value.
   */
  getPaddingFactor(): number {
    return this.paddingFactor;
  }

  /**
   * Sets the padding factor applied around the bounding volume.
   * @param paddingFactor The new padding factor value (must be positive).
   */
  setPaddingFactor(paddingFactor: number): void {
    this.paddingFactor = Math.max(0.001, paddingFactor);
  }

  /**
   * Checks whether animation is currently enabled.
   * @returns True if animations are enabled.
   */
  isAnimationEnabled(): boolean {
    return this.animationEnabled;
  }

  /**
   * Enables or disables smooth camera animation.
   * When disabled, cameras snap instantly to target.
   * @param enabled Whether animation should be enabled.
   */
  setAnimationEnabled(enabled: boolean): void {
    this.animationEnabled = enabled;
  }
}
