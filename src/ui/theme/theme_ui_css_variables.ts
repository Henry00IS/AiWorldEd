import { Theme } from '@/theme.js';
import {
  UI_THEME_ATTRIBUTE,
  buildDarkUiThemePalette,
  buildLightUiThemePalette,
  uiThemePaletteCssVariableName,
} from './theme_ui_palette.js';

/** Identifier of the stylesheet that defines the theme CSS variables. */
const THEME_CSS_VARIABLES_STYLE_ID = 'aiworlded-theme-css-variables';

/** One themed CSS variable with its dark and light values. */
interface ThemeCssVariableDefinition {
  /** Custom property name including the leading dashes. */
  name: string;
  /** Value used by the dark theme, identical to the original dark styling. */
  dark: string;
  /** Value used by the professional light palette. */
  light: string;
}

/**
 * Converts a numeric hex color to a `#rrggbb` string.
 *
 * @param color Numeric color such as 0x1a1a1a.
 * @returns CSS hex color string.
 */
function themeCssHexFromNumber(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/**
 * Converts a numeric hex color to a comma separated `r, g, b` channel list.
 *
 * @param color Numeric color such as 0xe86a17.
 * @returns Channel list usable inside `rgba(var(--x), alpha)`.
 */
function themeCssChannelsFromNumber(color: number): string {
  return `${(color >> 16) & 255}, ${(color >> 8) & 255}, ${color & 255}`;
}

/**
 * Neutral grey ramp used by hard-coded component colors. Light text greys map
 * to dark text greys and dark surface greys map to light surfaces, keeping the
 * relative emphasis of each shade.
 */
const THEME_CSS_NEUTRAL_GRAY_LIGHT_VALUES: Readonly<Record<string, string>> = Object.freeze({
  ffffff: '#1b1c1e',
  f2f2f2: '#222326',
  f0f0f0: '#232427',
  e8e8e8: '#2a2b2e',
  e6e6e6: '#2b2c2f',
  e0e0e0: '#2f3033',
  cccccc: '#3e4044',
  c9c9c9: '#44474b',
  c8c8c8: '#44474b',
  bdbdbd: '#4d5054',
  b4b4b4: '#55585c',
  aaaaaa: '#5d6065',
  a0a0a0: '#63666a',
  '9a9a9a': '#686b70',
  '999999': '#696c71',
  '888888': '#74777c',
  '7a7a7a': '#7e8186',
  '6a6a6a': '#8b8e93',
  '666666': '#8f9297',
  '555555': '#9fa2a6',
  '4a4a4a': '#bfc2c6',
  '444444': '#c2c5ca',
  '3a3a3a': '#d3d6da',
  '333333': '#d4d6d9',
  '2d2d2d': '#ffffff',
  '2a2a2a': '#ffffff',
  '252525': '#f0f0f1',
  '232323': '#e9ebee',
  '202020': '#f1f1f2',
  '1d1d1d': '#e4e5e7',
  '1b1b1b': '#f7f7f8',
  '1a1a1a': '#f4f4f5',
  '151515': '#f9f9fa',
  '141414': '#141414',
  '111111': '#e3e4e6',
  '0a0a0a': '#c4c7cb',
});

/**
 * Builds the themed variable definitions of the neutral grey ramp.
 *
 * @returns One definition per ramp entry.
 */
function themeCssNeutralGrayDefinitionsBuild(): ThemeCssVariableDefinition[] {
  return Object.entries(THEME_CSS_NEUTRAL_GRAY_LIGHT_VALUES).map(([hexDigits, lightValue]) => ({
    name: `--aiworlded-gray-${hexDigits}`,
    dark: `#${hexDigits}`,
    light: lightValue,
  }));
}

/**
 * Builds the themed variable definitions that carry the UI palette tokens.
 *
 * @returns One definition per palette token.
 */
function themeCssPaletteDefinitionsBuild(): ThemeCssVariableDefinition[] {
  const darkPalette = buildDarkUiThemePalette();
  const lightPalette = buildLightUiThemePalette();
  return (Object.keys(darkPalette) as (keyof typeof darkPalette)[]).map((tokenName) => ({
    name: uiThemePaletteCssVariableName(tokenName),
    dark: darkPalette[tokenName],
    light: lightPalette[tokenName],
  }));
}

/** Every themed CSS variable used by inline styles and stylesheets. */
export const THEME_CSS_VARIABLE_DEFINITIONS: readonly ThemeCssVariableDefinition[] = Object.freeze([
  { name: '--aiworlded-text-color', dark: Theme.buttonTextColor, light: '#2b2d30' },
  { name: '--aiworlded-muted-text-color', dark: Theme.statusBarTextColor, light: '#62666c' },
  { name: '--aiworlded-dim-text-color', dark: Theme.outlinerNameIdColor, light: '#8a8e94' },
  { name: '--aiworlded-strong-text-color', dark: '#ffffff', light: '#1b1c1e' },
  { name: '--aiworlded-separator-color', dark: themeCssHexFromNumber(Theme.separatorColor), light: '#c4c7cb' },
  { name: '--aiworlded-frame-background', dark: themeCssHexFromNumber(Theme.background), light: '#e4e5e7' },
  { name: '--aiworlded-toolbar-background', dark: themeCssHexFromNumber(Theme.toolbarBackground), light: '#f1f1f2' },
  {
    name: '--aiworlded-toolbar-background-end',
    dark: themeCssHexFromNumber(Theme.toolbarBackgroundEnd),
    light: '#e9e9eb',
  },
  {
    name: '--aiworlded-panel-background',
    dark: themeCssHexFromNumber(Theme.propertiesPanelBackground),
    light: '#f4f4f5',
  },
  { name: '--aiworlded-button-background', dark: themeCssHexFromNumber(Theme.buttonBackground), light: '#ffffff' },
  {
    name: '--aiworlded-button-hover-background',
    dark: themeCssHexFromNumber(Theme.buttonHoverColor),
    light: '#e3eef8',
  },
  { name: '--aiworlded-input-background', dark: Theme.inputBackgroundColor, light: '#ffffff' },
  { name: '--aiworlded-input-text-color', dark: Theme.inputTextColor, light: '#2b2d30' },
  { name: '--aiworlded-input-border-color', dark: Theme.inputBorderColor, light: '#c2c5ca' },
  { name: '--aiworlded-accent-color', dark: themeCssHexFromNumber(Theme.selectionColor), light: '#0696d7' },
  { name: '--aiworlded-accent-rgb', dark: themeCssChannelsFromNumber(Theme.selectionColor), light: '6, 150, 215' },
  { name: '--aiworlded-ink-rgb', dark: '255, 255, 255', light: '0, 0, 0' },
  { name: '--aiworlded-backdrop-rgb', dark: '0, 0, 0', light: '255, 255, 255' },
  { name: '--aiworlded-shadow-strength', dark: '1', light: '0.35' },
  { name: '--aiworlded-viewport-background', dark: themeCssHexFromNumber(Theme.viewportBackground), light: '#e9ebee' },
  { name: '--aiworlded-ruler-label-size-text', dark: Theme.rulerLabelSizeText, light: '#0b6fa8' },
  { name: '--aiworlded-ruler-label-delta-text', dark: Theme.rulerLabelDeltaText, light: '#b4500f' },
  { name: '--aiworlded-ruler-label-background', dark: Theme.rulerLabelBackground, light: 'rgba(255, 255, 255, 0.9)' },
  { name: '--aiworlded-ruler-label-border', dark: Theme.rulerLabelBorder, light: 'rgba(60, 90, 120, 0.35)' },
  { name: '--aiworlded-axis-x-color', dark: themeCssHexFromNumber(Theme.gizmoXAxisColor), light: '#d0342c' },
  { name: '--aiworlded-axis-y-color', dark: themeCssHexFromNumber(Theme.gizmoYAxisColor), light: '#2f8f3a' },
  { name: '--aiworlded-axis-z-color', dark: themeCssHexFromNumber(Theme.gizmoZAxisColor), light: '#2a5fd0' },
  ...themeCssNeutralGrayDefinitionsBuild(),
  ...themeCssPaletteDefinitionsBuild(),
]);

/**
 * Looks up the dark value of a themed variable so references carry the original
 * dark color as their fallback.
 *
 * @param name Custom property name.
 * @returns Dark value of the variable.
 */
function themeCssDarkValue(name: string): string {
  const definition = THEME_CSS_VARIABLE_DEFINITIONS.find((candidate) => candidate.name === name);
  return definition ? definition.dark : '';
}

/**
 * Builds a `var()` reference with the dark value as fallback.
 *
 * @param name Custom property name.
 * @returns CSS value string.
 */
function themeCssReference(name: string): string {
  return `var(${name}, ${themeCssDarkValue(name)})`;
}

/**
 * Builds an `rgba()` color whose channels follow a themed channel variable.
 *
 * @param channelVariableName Custom property holding `r, g, b`.
 * @param alpha Opacity between 0 and 1.
 * @returns CSS color string.
 */
function themeCssRgbaReference(channelVariableName: string, alpha: number): string {
  return `rgba(${themeCssReference(channelVariableName)}, ${alpha})`;
}

/**
 * Theme-aware CSS values for inline styles and stylesheets. Each value is a CSS
 * variable reference that resolves to the dark color unless the light theme is
 * active, so elements repaint automatically on theme switches.
 */
export const ThemeCss = Object.freeze({
  textColor: themeCssReference('--aiworlded-text-color'),
  mutedTextColor: themeCssReference('--aiworlded-muted-text-color'),
  dimTextColor: themeCssReference('--aiworlded-dim-text-color'),
  strongTextColor: themeCssReference('--aiworlded-strong-text-color'),
  separatorColor: themeCssReference('--aiworlded-separator-color'),
  frameBackground: themeCssReference('--aiworlded-frame-background'),
  toolbarBackground: themeCssReference('--aiworlded-toolbar-background'),
  toolbarBackgroundEnd: themeCssReference('--aiworlded-toolbar-background-end'),
  panelBackground: themeCssReference('--aiworlded-panel-background'),
  buttonBackground: themeCssReference('--aiworlded-button-background'),
  buttonHoverBackground: themeCssReference('--aiworlded-button-hover-background'),
  inputBackground: themeCssReference('--aiworlded-input-background'),
  inputTextColor: themeCssReference('--aiworlded-input-text-color'),
  inputBorderColor: themeCssReference('--aiworlded-input-border-color'),
  accentColor: themeCssReference('--aiworlded-accent-color'),
  viewportBackground: themeCssReference('--aiworlded-viewport-background'),
  rulerLabelSizeText: themeCssReference('--aiworlded-ruler-label-size-text'),
  rulerLabelDeltaText: themeCssReference('--aiworlded-ruler-label-delta-text'),
  rulerLabelBackground: themeCssReference('--aiworlded-ruler-label-background'),
  rulerLabelBorder: themeCssReference('--aiworlded-ruler-label-border'),
  axisXColor: themeCssReference('--aiworlded-axis-x-color'),
  axisYColor: themeCssReference('--aiworlded-axis-y-color'),
  axisZColor: themeCssReference('--aiworlded-axis-z-color'),
  /**
   * Accent color at the given opacity.
   *
   * @param alpha Opacity between 0 and 1.
   * @returns CSS color string.
   */
  accentAlpha: (alpha: number): string => themeCssRgbaReference('--aiworlded-accent-rgb', alpha),
  /**
   * Foreground ink (white on dark, black on light) at the given opacity.
   *
   * @param alpha Opacity between 0 and 1.
   * @returns CSS color string.
   */
  inkAlpha: (alpha: number): string => themeCssRgbaReference('--aiworlded-ink-rgb', alpha),
  /**
   * Backdrop tint (black on dark, white on light) at the given opacity.
   *
   * @param alpha Opacity between 0 and 1.
   * @returns CSS color string.
   */
  backdropAlpha: (alpha: number): string => themeCssRgbaReference('--aiworlded-backdrop-rgb', alpha),
  /**
   * Black drop shadow color whose opacity softens in the light theme.
   *
   * @param alpha Dark theme opacity between 0 and 1.
   * @returns CSS color string.
   */
  shadowAlpha: (alpha: number): string =>
    `rgba(0, 0, 0, calc(${alpha} * ${themeCssReference('--aiworlded-shadow-strength')}))`,
});

/**
 * Builds the declarations block for one theme.
 *
 * @param pickValue Selects the dark or light value of a definition.
 * @returns CSS declarations text.
 */
function themeCssDeclarationsBuild(pickValue: (definition: ThemeCssVariableDefinition) => string): string {
  return THEME_CSS_VARIABLE_DEFINITIONS.map((definition) => `  ${definition.name}: ${pickValue(definition)};`).join(
    '\n',
  );
}

/**
 * Builds the full stylesheet text with dark defaults and light overrides.
 *
 * @returns Stylesheet text.
 */
export function themeCssVariablesStylesheetBuild(): string {
  const darkBlock = `:root {\n${themeCssDeclarationsBuild((definition) => definition.dark)}\n}`;
  const lightSelector = `:root[${UI_THEME_ATTRIBUTE}="light"]`;
  const lightBlock = `${lightSelector} {\n${themeCssDeclarationsBuild((definition) => definition.light)}\n  color-scheme: light;\n}`;
  const lightPageBlock = `${lightSelector}, ${lightSelector} body {\n  background: var(--aiworlded-frame-background);\n}`;
  return `${darkBlock}\n${lightBlock}\n${lightPageBlock}`;
}

/** Installs or refreshes the stylesheet that defines the theme CSS variables. */
export function ensureThemeCssVariables(): void {
  if (typeof document === 'undefined') {
    return;
  }
  const existing = document.getElementById(THEME_CSS_VARIABLES_STYLE_ID);
  const style = existing instanceof HTMLStyleElement ? existing : document.createElement('style');
  style.id = THEME_CSS_VARIABLES_STYLE_ID;
  style.textContent = themeCssVariablesStylesheetBuild();
  if (!style.isConnected) {
    document.head.appendChild(style);
  }
}
