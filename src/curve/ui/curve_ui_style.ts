/** Colours of the curve field and editor. */
export const CURVE_UI_COLORS = {
  /** Curve line. */
  line: '#ff9a1f',
  /** Fill under the curve. */
  fill: 'rgba(255, 154, 31, 0.14)',
  /** Secondary line that shapes the -X side of custom-sided segments. */
  secondaryLine: '#4fd1c5',
  /** Fill under the secondary line. */
  secondaryFill: 'rgba(79, 209, 197, 0.12)',
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
  /** Band under segments with a square cross-section. */
  square: 'rgba(120, 200, 255, 0.45)',
  /** Outline of a field that accepts a dragged curve file. */
  drop: '#ff9a1f',
} as const;

/** Opacity of the line that is not being edited. */
export const CURVE_UI_INACTIVE_ALPHA = 0.32;

/** Height of the inspector curve strip: twice a text box. */
export const CURVE_UI_STRIP_HEIGHT_PX = 48;

/** Font of curve editor labels and controls. */
export const CURVE_UI_FONT = '11px monospace';

/** Background of an active toggle button. */
export const CURVE_UI_ACTIVE_BACKGROUND = 'rgba(255, 154, 31, 0.28)';
