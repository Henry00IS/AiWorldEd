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
  /** CSS colour of the handle and its line, or empty text for the theme colour. */
  color: string;
}

/**
 * A drawing a Debug Draw line asked for, in script coordinates: line segments
 * and, for Text, a caption at a point.
 */
export interface SolidScriptWidgetDraw {
  /** Kind of widget. */
  kind: 'Draw';
  /** 1-based line that declared it. */
  line: number;
  /** Text shown at the point, or empty text for none. */
  label: string;
  /** Point the text is shown at. */
  at: readonly [number, number, number];
  /** CSS colour, or empty text for the theme colour. */
  color: string;
  /** Segments, each from x, y, z to x, y, z. */
  segments: readonly (readonly [number, number, number, number, number, number])[];
}

/** Anything a line puts in the scene for the Generator tool or for debugging. */
export type SolidScriptWidget = SolidScriptWidgetSlider | SolidScriptWidgetDraw;

/** What a line hands over to add a widget: everything but its line. */
export type SolidScriptWidgetAdded = SolidScriptWidget extends infer W
  ? W extends SolidScriptWidget
    ? Omit<W, 'line'>
    : never
  : never;
