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
  /**
   * For a handle that changes one of x, y and z of a Vector Input: which one,
   * and the vector the others keep; null for a Number Input.
   */
  component: SolidScriptWidgetComponent | null;
  /** Whether a dashed ruler runs from the zero point to the handle. */
  ruler: boolean;
  /**
   * Axis through origin a dial turns about, or null for a straight slider. A
   * dial's direction is its arm at a value of 0, and its value is in degrees.
   */
  axis: readonly [number, number, number] | null;
}

/** One of x, y and z of a vector a handle changes, and the vector it is part of. */
export interface SolidScriptWidgetComponent {
  /** 0 for x, 1 for y, 2 for z. */
  index: number;
  /** Vector shown, whose other two values a drag keeps. */
  vector: readonly [number, number, number];
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

/**
 * A button a Widget Button or Widget Toggle line asked for, in script
 * coordinates; a click presses the Button Input it writes, or flips the Switch
 * Input.
 */
export interface SolidScriptWidgetButton {
  /** Kind of widget: a Toggle shows whether it is on. */
  kind: 'Button' | 'Toggle';
  /** 1-based line that declared it. */
  line: number;
  /** Text on the button. */
  label: string;
  /** Name of the Input a click presses or flips. */
  writes: string;
  /** Point the button sits at. */
  at: readonly [number, number, number];
  /** Whether a Toggle shows as on; false for a Button. */
  on: boolean;
  /** CSS colour, or empty text for the theme colour. */
  color: string;
}

/** An arrow a Widget Direction line asked for, in script coordinates. */
export interface SolidScriptWidgetAim {
  /** Kind of widget. */
  kind: 'Aim';
  /** 1-based line that declared it. */
  line: number;
  /** Caption beside the tip. */
  label: string;
  /** Name of the Vector Input a drag writes into. */
  writes: string;
  /** Point the arrow starts at. */
  origin: readonly [number, number, number];
  /** Unit direction shown, in the coordinates of the line. */
  value: readonly [number, number, number];
  /** Length of the arrow. */
  length: number;
  /**
   * Turn, scale and slant of the Transform around the line, as a 3 by 3 matrix
   * in column order, which takes the line's directions to the script's.
   */
  frame: readonly number[];
  /** CSS colour, or empty text for the theme colour. */
  color: string;
}

/** Anything a line puts in the scene for the Generator tool or for debugging. */
export type SolidScriptWidget =
  SolidScriptWidgetSlider | SolidScriptWidgetDraw | SolidScriptWidgetButton | SolidScriptWidgetAim;

/** What a line hands over to add a widget: everything but its line. */
export type SolidScriptWidgetAdded = SolidScriptWidget extends infer W
  ? W extends SolidScriptWidget
    ? Omit<W, 'line'>
    : never
  : never;
