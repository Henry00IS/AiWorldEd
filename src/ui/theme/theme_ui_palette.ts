import { Theme } from '@/theme.js';
import { hexToRgb } from '@/utils/utils_color.js';

/** Attribute on the document root that names the active UI theme. */
export const UI_THEME_ATTRIBUTE = 'data-aiworlded-theme';

/** Concrete UI theme ids the palette resolves. */
export type UiThemeId = 'light' | 'dark';

/**
 * Color and chrome tokens for one UI theme. Every value is a ready-to-assign
 * CSS string so inline style writers can use it directly.
 */
export interface UiThemePalette {
  /** Page and editor container background. */
  frameBackground: string;
  /** Default text color on the frame. */
  frameTextColor: string;
  /** Toolbar, status bar, and viewport toolbar strip background. */
  chromeBackground: string;
  /** Border color on chrome strips. */
  chromeBorderColor: string;
  /** Text color on chrome strips. */
  chromeTextColor: string;
  /** Toolbar background gradient. */
  toolbarGradient: string;
  /** Viewport toolbar strip background (semi-transparent over the 3D view). */
  viewportToolbarBackground: string;
  /** Viewport toolbar strip border. */
  viewportToolbarBorder: string;
  /** Dropdown and context menu surface background. */
  menuBackground: string;
  /** Dropdown and context menu surface border. */
  menuBorderColor: string;
  /** Dropdown and context menu surface shadow. */
  menuBoxShadow: string;
  /** Default menu row text color. */
  menuTextColor: string;
  /** Highlighted menu row background. */
  menuHoverBackground: string;
  /** Highlighted menu row border. */
  menuHoverBorderColor: string;
  /** Muted color for shortcuts and submenu carets. */
  menuMutedColor: string;
  /** Menu separator line color. */
  menuSeparatorColor: string;
  /** Disabled menu row text color. */
  menuDisabledColor: string;
  /** Floating editor panel (outliner, properties, palette) background. */
  panelBackground: string;
  /** Floating editor panel border. */
  panelBorderColor: string;
  /** Text color inside floating editor panels. */
  panelTextColor: string;
  /** Border color on elements inside floating editor panels. */
  panelBorderColorInner: string;
  /** Settings dialog card background. */
  dialogBackground: string;
  /** Settings dialog card shadow. */
  dialogBoxShadow: string;
  /** Settings dialog header and tab bar background. */
  dialogChromeBackground: string;
  /** Settings dialog header and tab bar border. */
  dialogChromeBorderColor: string;
  /** Settings dialog scrollable content background. */
  dialogContentBackground: string;
  /** Settings category divider border. */
  dialogCategoryBorderColor: string;
  /** Settings labels, titles, and headings text color. */
  dialogLabelTextColor: string;
  /** Coordinate-space summary text color. */
  dialogSummaryTextColor: string;
  /** Selected settings tab background. */
  dialogTabActiveBackground: string;
  /** Selected settings tab border. */
  dialogTabActiveBorderColor: string;
  /** Selected settings tab text color. */
  dialogTabActiveTextColor: string;
  /** Viewport label chip background. */
  viewportLabelBackground: string;
  /** Viewport label chip text color. */
  viewportLabelTextColor: string;
  /** Viewport label chip border. */
  viewportLabelBorderColor: string;
  /** Interactive control (button, input, select) background. */
  controlBackground: string;
  /** Interactive control text color. */
  controlTextColor: string;
  /** Interactive control border. */
  controlBorderColor: string;
  /** Hovered control background. */
  controlHoverBackground: string;
  /** Hovered control border. */
  controlHoverBorderColor: string;
  /** Keyboard focus outline color. */
  focusOutlineColor: string;
  /** Range slider accent color. */
  rangeAccentColor: string;
  /** Selected texture browser tile background. */
  selectionBackground: string;
  /** Selected texture browser tile border. */
  selectionBorderColor: string;
  /** Status bar background. */
  statusBarBackground: string;
  /** Status bar top border. */
  statusBarBorder: string;
  /** Status bar label text color. */
  statusBarTextColor: string;
  /** Outliner background. */
  outlinerBackground: string;
  /** Properties panel background. */
  propertiesPanelBackground: string;
  /** Input field background. */
  inputBackground: string;
  /** Input field text color. */
  inputTextColor: string;
  /** Input field border. */
  inputBorderColor: string;
  /** Button resting background. */
  buttonBackground: string;
  /** Button hover background. */
  buttonHoverBackground: string;
  /** Button and panel text color. */
  buttonTextColor: string;
  /** Glyph color of the window corner close button. */
  windowCloseButtonGlyphColor: string;
  /** Background of the window corner close button while hovered. */
  windowCloseButtonHoverBackground: string;
}

/**
 * Resolves the concrete UI theme id from the document root attribute.
 *
 * @param root Element carrying the theme attribute.
 * @returns Resolved theme id, dark when the attribute is absent.
 */
export function resolveUiThemeId(root: HTMLElement): UiThemeId {
  const value = root.getAttribute(UI_THEME_ATTRIBUTE);
  return value === 'light' ? 'light' : 'dark';
}

/** Prefix of the CSS custom properties that carry the UI palette tokens. */
export const UI_THEME_PALETTE_CSS_VARIABLE_PREFIX = '--aiworlded-palette-';

/**
 * Converts a palette token name to its CSS custom property name.
 *
 * @param tokenName Palette key such as panelBackground.
 * @returns Custom property name such as --aiworlded-palette-panel-background.
 */
export function uiThemePaletteCssVariableName(tokenName: string): string {
  const kebabName = tokenName.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  return `${UI_THEME_PALETTE_CSS_VARIABLE_PREFIX}${kebabName}`;
}

let cachedThemeAwarePalette: UiThemePalette | null = null;

/**
 * Builds the palette whose values are CSS variable references. The variables
 * resolve to the dark or light values of the active theme, with the dark value
 * as fallback, so inline styles repaint automatically on theme switches.
 *
 * @returns Theme-aware palette.
 */
function buildThemeAwareUiThemePalette(): UiThemePalette {
  const darkPalette = buildDarkUiThemePalette();
  const entries = Object.entries(darkPalette).map(([tokenName, darkValue]) => [
    tokenName,
    `var(${uiThemePaletteCssVariableName(tokenName)}, ${darkValue})`,
  ]);
  return Object.freeze(Object.fromEntries(entries)) as unknown as UiThemePalette;
}

/**
 * Returns the theme-aware palette. Every value is a CSS variable reference that
 * follows the theme applied to the document root.
 *
 * @returns Palette that follows the active theme.
 */
export function getActiveUiThemePalette(): UiThemePalette {
  cachedThemeAwarePalette ??= buildThemeAwareUiThemePalette();
  return cachedThemeAwarePalette;
}

/**
 * Builds the dark palette from the shared editor theme tokens.
 *
 * @returns Dark theme palette.
 */
export function buildDarkUiThemePalette(): UiThemePalette {
  return {
    frameBackground: hexToRgb(Theme.background),
    frameTextColor: Theme.buttonTextColor,
    chromeBackground: hexToRgb(Theme.toolbarBackground),
    chromeBorderColor: hexToRgb(Theme.separatorColor),
    chromeTextColor: Theme.buttonTextColor,
    toolbarGradient: `linear-gradient(180deg, ${hexToRgb(Theme.toolbarBackground)} 0%, ${hexToRgb(Theme.toolbarBackgroundEnd)} 100%)`,
    viewportToolbarBackground: Theme.viewportToolbarBackground,
    viewportToolbarBorder: Theme.viewportToolbarBorder,
    menuBackground: hexToRgb(Theme.toolbarBackground),
    menuBorderColor: 'rgba(255,255,255,0.1)',
    menuBoxShadow: '0 10px 28px rgba(0,0,0,0.55)',
    menuTextColor: Theme.buttonTextColor,
    menuHoverBackground: hexToRgb(Theme.buttonHoverColor),
    menuHoverBorderColor: 'rgba(255,255,255,0.06)',
    menuMutedColor: Theme.buttonTextColor,
    menuSeparatorColor: 'rgba(255,255,255,0.12)',
    menuDisabledColor: '#666666',
    panelBackground: hexToRgb(Theme.outlinerBackground),
    panelBorderColor: hexToRgb(Theme.separatorColor),
    panelTextColor: Theme.buttonTextColor,
    panelBorderColorInner: hexToRgb(Theme.separatorColor),
    dialogBackground: hexToRgb(Theme.propertiesPanelBackground),
    dialogBoxShadow: '0 12px 36px rgba(0, 0, 0, 0.55)',
    dialogChromeBackground: hexToRgb(Theme.toolbarBackground),
    dialogChromeBorderColor: hexToRgb(Theme.separatorColor),
    dialogContentBackground: hexToRgb(Theme.propertiesPanelBackground),
    dialogCategoryBorderColor: hexToRgb(Theme.separatorColor),
    dialogLabelTextColor: Theme.buttonTextColor,
    dialogSummaryTextColor: Theme.statusBarTextColor,
    dialogTabActiveBackground: 'rgba(232, 106, 23, 0.22)',
    dialogTabActiveBorderColor: hexToRgb(Theme.selectionColor),
    dialogTabActiveTextColor: '#ffffff',
    viewportLabelBackground: Theme.viewportLabelBackgroundColor,
    viewportLabelTextColor: Theme.viewportLabelTextColor,
    viewportLabelBorderColor: 'transparent',
    controlBackground: hexToRgb(Theme.buttonBackground),
    controlTextColor: Theme.buttonTextColor,
    controlBorderColor: Theme.inputBorderColor,
    controlHoverBackground: hexToRgb(Theme.buttonHoverColor),
    controlHoverBorderColor: 'rgba(255,255,255,0.06)',
    focusOutlineColor: hexToRgb(Theme.selectionColor),
    rangeAccentColor: hexToRgb(Theme.selectionColor),
    selectionBackground: Theme.outlinerSelectedColor,
    selectionBorderColor: hexToRgb(Theme.selectionColor),
    statusBarBackground: Theme.statusBarBackground,
    statusBarBorder: Theme.statusBarBorderColor,
    statusBarTextColor: Theme.statusBarTextColor,
    outlinerBackground: hexToRgb(Theme.outlinerBackground),
    propertiesPanelBackground: hexToRgb(Theme.propertiesPanelBackground),
    inputBackground: Theme.inputBackgroundColor,
    inputTextColor: Theme.inputTextColor,
    inputBorderColor: Theme.inputBorderColor,
    buttonBackground: hexToRgb(Theme.buttonBackground),
    buttonHoverBackground: hexToRgb(Theme.buttonHoverColor),
    buttonTextColor: Theme.buttonTextColor,
    windowCloseButtonGlyphColor: '#ffffff',
    windowCloseButtonHoverBackground: '#C42B1C',
  };
}

/**
 * Builds the professional light palette: light grey surfaces with a clear
 * toolbar / panel / dialog hierarchy, dark grey text, quiet borders, and a
 * single blue accent for selection, focus, and active states.
 *
 * @returns Light theme palette.
 */
export function buildLightUiThemePalette(): UiThemePalette {
  return {
    frameBackground: '#e4e5e7',
    frameTextColor: '#2b2d30',
    chromeBackground: '#f1f1f2',
    chromeBorderColor: '#c4c7cb',
    chromeTextColor: '#2b2d30',
    toolbarGradient: 'linear-gradient(180deg, #f7f7f8 0%, #e9e9eb 100%)',
    viewportToolbarBackground: 'rgba(244, 245, 246, 0.94)',
    viewportToolbarBorder: 'rgba(0, 0, 0, 0.1)',
    menuBackground: '#fbfbfb',
    menuBorderColor: '#c4c7cb',
    menuBoxShadow: '0 10px 28px rgba(0, 0, 0, 0.18)',
    menuTextColor: '#2b2d30',
    menuHoverBackground: '#dcebf8',
    menuHoverBorderColor: 'rgba(6, 150, 215, 0.18)',
    menuMutedColor: '#6b6f75',
    menuSeparatorColor: '#d9dbde',
    menuDisabledColor: '#a3a6ab',
    panelBackground: '#f4f4f5',
    panelBorderColor: '#c4c7cb',
    panelTextColor: '#2b2d30',
    panelBorderColorInner: '#dcdee1',
    dialogBackground: '#f7f7f8',
    dialogBoxShadow: '0 12px 36px rgba(0, 0, 0, 0.2)',
    dialogChromeBackground: '#ececee',
    dialogChromeBorderColor: '#d2d4d8',
    dialogContentBackground: '#f7f7f8',
    dialogCategoryBorderColor: '#dcdee1',
    dialogLabelTextColor: '#2b2d30',
    dialogSummaryTextColor: '#62666c',
    dialogTabActiveBackground: 'rgba(6, 150, 215, 0.14)',
    dialogTabActiveBorderColor: '#0696d7',
    dialogTabActiveTextColor: '#0a5f8c',
    viewportLabelBackground: 'rgba(255, 255, 255, 0.72)',
    viewportLabelTextColor: '#3a3d41',
    viewportLabelBorderColor: 'transparent',
    controlBackground: '#ffffff',
    controlTextColor: '#2b2d30',
    controlBorderColor: '#c2c5ca',
    controlHoverBackground: '#e3eef8',
    controlHoverBorderColor: 'rgba(6, 150, 215, 0.35)',
    focusOutlineColor: '#0696d7',
    rangeAccentColor: '#0696d7',
    selectionBackground: 'rgba(6, 150, 215, 0.16)',
    selectionBorderColor: '#0696d7',
    statusBarBackground: '#ececee',
    statusBarBorder: '#c4c7cb',
    statusBarTextColor: '#4f5358',
    outlinerBackground: '#f4f4f5',
    propertiesPanelBackground: '#f4f4f5',
    inputBackground: '#ffffff',
    inputTextColor: '#2b2d30',
    inputBorderColor: '#c2c5ca',
    buttonBackground: '#ffffff',
    buttonHoverBackground: '#e3eef8',
    buttonTextColor: '#2b2d30',
    windowCloseButtonGlyphColor: '#2b2d30',
    windowCloseButtonHoverBackground: '#C42B1C',
  };
}
