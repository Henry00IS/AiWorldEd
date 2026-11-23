/** Start of the command id of every Widget line. */
export const SOLID_SCRIPT_WIDGET_COMMAND_PREFIX = 'widget_';

/** A slider a Widget Slider line asked for, in script coordinates. */
export interface SolidScriptWidgetSlider {
  /** Kind of widget. */
  kind: 'Slider';
  /** 1-based line that declared it. */
  line: number;
  /** Caption shown beside the handle. */
  label: string;
  /** Value the handle shows: where the script put it after its own checks. */
  value: number;
  /**
   * Name of the Input a drag writes into, or empty for a handle that only
   * shows.
   */
  writes: string;
  /** Point the handle sits at for a value of 0. */
  origin: readonly [number, number, number];
  /** Move of the handle for a value of 1. */
  direction: readonly [number, number, number];
  /** Smallest value a drag writes, or null for no limit. */
  min: number | null;
  /** Largest value a drag writes, or null for no limit. */
  max: number | null;
}
