import type { EditorSettingsSnapshot, UiThemePreference } from './settings_types.js';
import { ensureViewSettingsStyles } from './view_settings_styles.js';

const ROOT_THEME_ATTRIBUTE = 'data-aiworlded-theme';
const BRIGHTNESS_CSS_VARIABLE = '--aiworlded-viewport-brightness';
const FONT_SIZE_CSS_VARIABLE = '--aiworlded-ui-font-size';
const ICON_SIZE_CSS_VARIABLE = '--aiworlded-material-icon-scale';

/**
 * Applies editor settings to the document root for CSS consumers.
 */
export class SettingsApplicator {
  private readonly root: HTMLElement;
  private mediaQuery: MediaQueryList | null;
  private boundSystemThemeListener: (() => void) | null;
  private lastThemePreference: UiThemePreference;

  /**
   * Creates an applicator bound to a document root element.
   * @param root Element that receives theme attributes and CSS variables.
   */
  constructor(root: HTMLElement = document.documentElement) {
    this.root = root;
    this.mediaQuery = null;
    this.boundSystemThemeListener = null;
    this.lastThemePreference = 'dark';
    ensureViewSettingsStyles();
  }

  /**
   * Applies a full settings snapshot to the document.
   * @param snapshot Current settings snapshot.
   */
  applySnapshot(snapshot: EditorSettingsSnapshot): void {
    this.applyTheme(snapshot.view.theme);
    this.applyBrightness(snapshot.view.brightness);
    this.applyRendererFontSize(snapshot.view.rendererFontSize);
    this.applyMaterialBrowserIconSize(
      snapshot.view.materialBrowserIconSizePercent
    );
  }

  /**
   * Applies the theme preference, resolving System against OS settings.
   * @param theme Theme preference.
   */
  applyTheme(theme: UiThemePreference): void {
    this.lastThemePreference = theme;
    this.unbindSystemThemeListener();
    if (theme === 'system') {
      this.bindSystemThemeListener();
    }
    const resolved = this.resolveTheme(theme);
    this.root.setAttribute(ROOT_THEME_ATTRIBUTE, resolved);
  }

  /**
   * Applies brightness as a CSS variable (1.0 = 100%).
   * @param brightnessPercent Brightness percent 0–200.
   */
  applyBrightness(brightnessPercent: number): void {
    const factor = brightnessPercent / 100;
    this.root.style.setProperty(BRIGHTNESS_CSS_VARIABLE, String(factor));
  }

  /**
   * Applies the UI font size to the document root.
   * @param fontSizePx Font size in pixels.
   */
  applyRendererFontSize(fontSizePx: number): void {
    this.root.style.setProperty(FONT_SIZE_CSS_VARIABLE, `${fontSizePx}px`);
    this.root.style.fontSize = `${fontSizePx}px`;
  }

  /**
   * Applies material browser icon scale as a CSS variable (1.0 = 100%).
   * @param percent Icon size percent 25–300.
   */
  applyMaterialBrowserIconSize(percent: number): void {
    const scale = percent / 100;
    this.root.style.setProperty(ICON_SIZE_CSS_VARIABLE, String(scale));
  }

  /**
   * Removes system theme listeners.
   */
  dispose(): void {
    this.unbindSystemThemeListener();
  }

  /**
   * Resolves a preference to a concrete light or dark theme.
   * @param theme Theme preference.
   * @returns Resolved theme id.
   */
  private resolveTheme(theme: UiThemePreference): 'light' | 'dark' {
    if (theme === 'light' || theme === 'dark') {
      return theme;
    }
    return this.detectSystemPrefersDark() ? 'dark' : 'light';
  }

  /**
   * Detects whether the OS prefers a dark color scheme.
   * @returns True when dark mode is preferred.
   */
  private detectSystemPrefersDark(): boolean {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return true;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  /**
   * Listens for OS theme changes while System is selected.
   */
  private bindSystemThemeListener(): void {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }
    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.boundSystemThemeListener = () => {
      if (this.lastThemePreference === 'system') {
        this.root.setAttribute(
          ROOT_THEME_ATTRIBUTE,
          this.resolveTheme('system')
        );
      }
    };
    this.mediaQuery.addEventListener('change', this.boundSystemThemeListener);
  }

  /**
   * Detaches the OS theme change listener when present.
   */
  private unbindSystemThemeListener(): void {
    if (this.mediaQuery && this.boundSystemThemeListener) {
      this.mediaQuery.removeEventListener(
        'change',
        this.boundSystemThemeListener
      );
    }
    this.mediaQuery = null;
    this.boundSystemThemeListener = null;
  }
}
