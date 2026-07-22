import { SNAP_PRESETS, cycleSnapInterval } from '../types/snap_presets.js';

/**
 * Callback invoked when the snap interval changes.
 * @param interval The new snap interval value.
 */
export type SnapIntervalChangedCallback = (interval: number) => void;

export class SnapManager {
  private currentInterval: number;
  private callbacks: SnapIntervalChangedCallback[];

  /**
   * Creates a new snap manager with a default interval.
   * @param defaultInterval The initial snap interval value.
   */
  constructor(defaultInterval: number) {
    this.currentInterval = defaultInterval;
    this.callbacks = [];
  }

  /**
   * Advances the snap interval to the next preset value.
   */
  cycleForward(): void {
    const previousInterval = this.currentInterval;
    this.currentInterval = cycleSnapInterval(this.currentInterval, 1);
    if (this.currentInterval !== previousInterval) {
      this.fireCallbacks();
    }
  }

  /**
   * Moves the snap interval to the previous preset value.
   */
  cycleBackward(): void {
    const previousInterval = this.currentInterval;
    this.currentInterval = cycleSnapInterval(this.currentInterval, -1);
    if (this.currentInterval !== previousInterval) {
      this.fireCallbacks();
    }
  }

  /**
   * Returns the current snap interval value.
   * @returns The snap interval.
   */
  getInterval(): number {
    return this.currentInterval;
  }

  /**
   * Sets the snap interval to a specific value.
   * Validates that the value is positive and non-zero.
   * @param value The new snap interval value.
   */
  setInterval(value: number): void {
    if (value <= 0) return;
    const previousInterval = this.currentInterval;
    this.currentInterval = value;
    if (this.currentInterval !== previousInterval) {
      this.fireCallbacks();
    }
  }

  /**
   * Registers a callback to be invoked when the interval changes.
   * @param callback The function to call with the new interval value.
   */
  onIntervalChanged(callback: SnapIntervalChangedCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * Returns the index of the current interval in the preset array.
   * @returns The preset index, or -1 if the current value is not a preset.
   */
  getPresetIndex(): number {
    return SNAP_PRESETS.indexOf(this.currentInterval);
  }

  /**
   * Notifies all registered callbacks of the interval change.
   */
  private fireCallbacks(): void {
    this.callbacks.forEach((callback) => {
      callback(this.currentInterval);
    });
  }
}
