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
  /** Square side (CSS length) of the window corner close button. */
  windowCloseButtonSize: string;
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

/**
 * Returns the palette for the theme currently applied to the document root.
 *
 * @returns Palette matching the active theme.
 */
export function getActiveUiThemePalette(): UiThemePalette {
  const root = typeof document === 'undefined' ? null : document.documentElement;
  if (!root) {
    return buildDarkUiThemePalette();
  }
  return resolveUiThemeId(root) === 'light' ? buildLightUiThemePalette() : buildDarkUiThemePalette();
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
    windowCloseButtonSize: '33px',
    windowCloseButtonGlyphColor: '#ffffff',
    windowCloseButtonHoverBackground: '#C42B1C',
  };
}

/**
 * Builds the light palette from Windows-inspired neutral values.
 *
 * @returns Light theme palette.
 */
export function buildLightUiThemePalette(): UiThemePalette {
  return {
    frameBackground: '#ffffff',
    frameTextColor: '#0a0a0a',
    chromeBackground: '#e5e5e5',
    chromeBorderColor: '#c6c6c6',
    chromeTextColor: '#0a0a0a',
    toolbarGradient: 'linear-gradient(180deg, #e5e5e5 0%, #e5e5e5 100%)',
    viewportToolbarBackground: 'rgba(229, 229, 229, 0.92)',
    viewportToolbarBorder: 'rgba(198, 198, 198, 0.6)',
    menuBackground: '#ffffff',
    menuBorderColor: '#767676',
    menuBoxShadow: '0 4px 12px rgba(0, 0, 0, 0.18)',
    menuTextColor: '#0a0a0a',
    menuHoverBackground: '#e5f3ff',
    menuHoverBorderColor: '#0078d4',
    menuMutedColor: '#5a5a5a',
    menuSeparatorColor: '#d0d0d0',
    menuDisabledColor: '#767676',
    panelBackground: '#f3f3f3',
    panelBorderColor: '#8c8c8c',
    panelTextColor: '#0a0a0a',
    panelBorderColorInner: '#c6c6c6',
    dialogBackground: '#ffffff',
    dialogBoxShadow: '0 12px 36px rgba(0, 0, 0, 0.18)',
    dialogChromeBackground: '#e5e5e5',
    dialogChromeBorderColor: '#c6c6c6',
    dialogContentBackground: '#ffffff',
    dialogCategoryBorderColor: '#c6c6c6',
    dialogLabelTextColor: '#0a0a0a',
    dialogSummaryTextColor: '#424242',
    dialogTabActiveBackground: '#cce8ff',
    dialogTabActiveBorderColor: '#0078d4',
    dialogTabActiveTextColor: '#0a0a0a',
    viewportLabelBackground: '#f3f3f3',
    viewportLabelTextColor: '#0a0a0a',
    viewportLabelBorderColor: '#c6c6c6',
    controlBackground: '#ffffff',
    controlTextColor: '#0a0a0a',
    controlBorderColor: '#767676',
    controlHoverBackground: '#e5f3ff',
    controlHoverBorderColor: '#0078d4',
    focusOutlineColor: '#0078d4',
    rangeAccentColor: '#0078d4',
    selectionBackground: '#cce8ff',
    selectionBorderColor: '#0078d4',
    statusBarBackground: '#e5e5e5',
    statusBarBorder: '#c6c6c6',
    statusBarTextColor: '#0a0a0a',
    outlinerBackground: '#f3f3f3',
    propertiesPanelBackground: '#f3f3f3',
    inputBackground: '#ffffff',
    inputTextColor: '#0a0a0a',
    inputBorderColor: '#767676',
    buttonBackground: '#ffffff',
    buttonHoverBackground: '#e5f3ff',
    buttonTextColor: '#0a0a0a',
    windowCloseButtonSize: '33px',
    windowCloseButtonGlyphColor: '#0a0a0a',
    windowCloseButtonHoverBackground: '#C42B1C',
  };
}
