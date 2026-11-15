import { resolveUiThemeId, type UiThemeId } from '@/ui/theme/theme_ui_palette.js';

/** Colours of the curve field and editor for one theme. */
export interface CurveUiColorSet {
  /** Curve line. */
  readonly line: string;
  /** Fill under the curve. */
  readonly fill: string;
  /** Secondary line that shapes the -X side of custom-sided segments. */
  readonly secondaryLine: string;
  /** Fill under the secondary line. */
  readonly secondaryFill: string;
  /** Unselected point. */
  readonly point: string;
  /** Outline around every point. */
  readonly pointOutline: string;
  /** Selected point or segment. */
  readonly selected: string;
  /** Handle dots and their stems. */
  readonly handle: string;
  /** Translucent fill of the group selection box. */
  readonly handleShade: string;
  /** Canvas background inside the unit square. */
  readonly background: string;
  /** Canvas background outside the unit square. */
  readonly outerBackground: string;
  /** Minor grid lines. */
  readonly grid: string;
  /** Major grid lines and the unit square. */
  readonly gridMajor: string;
  /** Axis labels. */
  readonly label: string;
  /** Text on the editor surfaces. */
  readonly text: string;
  /** Band under segments with a square cross-section. */
  readonly square: string;
  /** Outline of a field that accepts a dragged curve file. */
  readonly drop: string;
  /** Base and top marker lines and handles. */
  readonly marker: string;
  /** Shade between the base and top markers. */
  readonly markerShade: string;
  /** Background of an active toggle button. */
  readonly activeBackground: string;
}

/** Original dark curve colours. */
const CURVE_UI_COLORS_DARK: CurveUiColorSet = Object.freeze({
  line: '#ff9a1f',
  fill: 'rgba(255, 154, 31, 0.14)',
  secondaryLine: '#4fd1c5',
  secondaryFill: 'rgba(79, 209, 197, 0.12)',
  point: '#f2f2f2',
  pointOutline: '#000000',
  selected: '#ffd166',
  handle: '#8fc7ff',
  handleShade: 'rgba(143, 199, 255, 0.12)',
  background: '#1b1b1b',
  outerBackground: '#141414',
  grid: '#262626',
  gridMajor: '#3a3a3a',
  label: '#9a9a9a',
  text: '#ffffff',
  square: 'rgba(120, 200, 255, 0.45)',
  drop: '#ff9a1f',
  marker: '#7ee0c3',
  markerShade: 'rgba(126, 224, 195, 0.07)',
  activeBackground: 'rgba(255, 154, 31, 0.28)',
});

/** Professional light curve colours: white graph, quiet grid, deeper accents. */
const CURVE_UI_COLORS_LIGHT: CurveUiColorSet = Object.freeze({
  line: '#d9730d',
  fill: 'rgba(217, 115, 13, 0.14)',
  secondaryLine: '#14897e',
  secondaryFill: 'rgba(20, 137, 126, 0.12)',
  point: '#ffffff',
  pointOutline: '#3a3d41',
  selected: '#0696d7',
  handle: '#2a63c4',
  handleShade: 'rgba(42, 99, 196, 0.1)',
  background: '#ffffff',
  outerBackground: '#eceef0',
  grid: '#eceef1',
  gridMajor: '#c6c9ce',
  label: '#62666c',
  text: '#2b2d30',
  square: 'rgba(36, 120, 200, 0.35)',
  drop: '#d9730d',
  marker: '#14936e',
  markerShade: 'rgba(20, 147, 110, 0.08)',
  activeBackground: 'rgba(217, 115, 13, 0.18)',
});

/**
 * Returns the curve colours of one theme.
 *
 * @param themeId Light or dark theme id.
 * @returns Colour set.
 */
export function curveUiColorsForTheme(themeId: UiThemeId): CurveUiColorSet {
  return themeId === 'light' ? CURVE_UI_COLORS_LIGHT : CURVE_UI_COLORS_DARK;
}

/** Theme forced while drawing images that must not follow the viewer's theme. */
let curveUiForcedThemeId: UiThemeId | null = null;

/**
 * Runs a synchronous drawing with the curve colours of a fixed theme, whatever
 * the viewer's theme is, then restores the theme-following colours.
 *
 * @param themeId Theme to draw in.
 * @param draw Synchronous drawing.
 */
export function curveUiWithTheme(themeId: UiThemeId, draw: () => void): void {
  const previous = curveUiForcedThemeId;
  curveUiForcedThemeId = themeId;
  try {
    draw();
  } finally {
    curveUiForcedThemeId = previous;
  }
}

/**
 * Returns the theme curve colours follow: a forced theme while one is set,
 * otherwise the theme applied to the document root, dark without a document.
 *
 * @returns Active theme id.
 */
export function curveUiActiveThemeId(): UiThemeId {
  if (curveUiForcedThemeId !== null) return curveUiForcedThemeId;
  if (typeof document === 'undefined' || !document.documentElement) return 'dark';
  return resolveUiThemeId(document.documentElement);
}

/**
 * Builds an object whose properties always read the active theme's colour, so
 * canvas drawing picks up theme switches on the next redraw.
 *
 * @returns Theme-following colour set.
 */
function curveUiColorsThemeFollowingBuild(): CurveUiColorSet {
  const colors = {};
  for (const name of Object.keys(CURVE_UI_COLORS_DARK) as (keyof CurveUiColorSet)[]) {
    Object.defineProperty(colors, name, {
      enumerable: true,
      get: () => curveUiColorsForTheme(curveUiActiveThemeId())[name],
    });
  }
  return Object.freeze(colors) as CurveUiColorSet;
}

/** Colours of the curve field and editor; each read follows the active theme. */
export const CURVE_UI_COLORS: CurveUiColorSet = curveUiColorsThemeFollowingBuild();

/** Opacity of the line that is not being edited. */
export const CURVE_UI_INACTIVE_ALPHA = 0.32;

/** Height of the inspector curve strip: twice a text box. */
export const CURVE_UI_STRIP_HEIGHT_PX = 48;

/** Font of curve editor labels and controls. */
export const CURVE_UI_FONT = '11px monospace';

/**
 * Returns the CSS custom property name of one curve colour.
 *
 * @param name Colour name.
 * @returns Custom property name.
 */
export function curveUiCssVariableName(name: keyof CurveUiColorSet): string {
  return `--aiworlded-curve-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

/**
 * Builds `var()` references for every curve colour with the dark colour as
 * fallback, so DOM chrome repaints by itself when the theme switches.
 *
 * @returns Colour set of CSS references.
 */
function curveUiCssReferencesBuild(): CurveUiColorSet {
  const entries = (Object.keys(CURVE_UI_COLORS_DARK) as (keyof CurveUiColorSet)[]).map((name) => [
    name,
    `var(${curveUiCssVariableName(name)}, ${CURVE_UI_COLORS_DARK[name]})`,
  ]);
  return Object.freeze(Object.fromEntries(entries)) as CurveUiColorSet;
}

/** Curve colours as CSS variable references for inline DOM styles. */
export const CURVE_UI_CSS: CurveUiColorSet = curveUiCssReferencesBuild();
