/** Colours of the curve field and editor. */
export const CURVE_UI_COLORS = {
  /** Curve line. */
  line: '#ff9a1f',
  /** Fill under the curve. */
  fill: 'rgba(255, 154, 31, 0.14)',
  /** Unselected point. */
  point: '#f2f2f2',
  /** Selected point or segment. */
  selected: '#ffd166',
  /** Handle dots and their stems. */
  handle: '#8fc7ff',
  /** Canvas background. */
  background: '#1b1b1b',
  /** Minor grid lines. */
  grid: '#262626',
  /** Major grid lines and the unit square. */
  gridMajor: '#3a3a3a',
  /** Axis labels. */
  label: '#9a9a9a',
  /** Text on dark surfaces. */
  text: '#ffffff',
  /** Outline of a field that accepts a dragged curve file. */
  drop: '#ff9a1f',
} as const;

/** Height of the inspector curve strip: twice a text box. */
export const CURVE_UI_STRIP_HEIGHT_PX = 48;

/** Font of curve editor labels and controls. */
export const CURVE_UI_FONT = '11px monospace';

/** Background of an active toggle button. */
export const CURVE_UI_ACTIVE_BACKGROUND = 'rgba(255, 154, 31, 0.28)';
