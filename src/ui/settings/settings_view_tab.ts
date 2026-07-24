import type { EditorSettingsStore } from '../../settings/editor_settings_store.js';
import {
  BRIGHTNESS_MAX,
  BRIGHTNESS_MIN,
  buildRendererFontSizeOptions,
  MATERIAL_BROWSER_ICON_SIZE_OPTIONS,
  VIEWPORT_PANE_COUNT_OPTIONS,
  UI_THEME_LABELS,
  UI_THEME_OPTIONS,
  type UiThemePreference
} from '../../settings/settings_types.js';
import {
  createSettingsCategory,
  createSettingsControlRow,
  createSettingsSelect,
  createSettingsSlider
} from './settings_form_controls.js';

/**
 * View tab content: UI theme, brightness, material browser, and fonts.
 */
export class SettingsViewTab {
  private readonly store: EditorSettingsStore;
  private readonly root: HTMLElement;

  /**
   * Creates the View tab panel.
   * @param store Settings store driving view preferences.
   */
  constructor(store: EditorSettingsStore) {
    this.store = store;
    this.root = document.createElement('div');
    this.root.style.display = 'flex';
    this.root.style.flexDirection = 'column';
    this.rebuild();
  }

  /**
   * Returns the tab root element.
   * @returns Root element.
   */
  getElement(): HTMLElement {
    return this.root;
  }

  /**
   * Rebuilds all View tab controls from the store.
   */
  rebuild(): void {
    this.root.replaceChildren();
    this.root.appendChild(this.buildUserInterfaceCategory());
    this.root.appendChild(this.buildViewportsCategory());
    this.root.appendChild(this.buildMaterialBrowserCategory());
    this.root.appendChild(this.buildFontsCategory());
  }

  /**
   * Builds the User Interface category.
   * @returns Section element.
   */
  private buildUserInterfaceCategory(): HTMLElement {
    const view = this.store.getViewSettings();
    const { section, body } = createSettingsCategory('User Interface');
    body.appendChild(this.createThemeRow(view.theme));
    body.appendChild(this.createBrightnessRow(view.brightness));
    return section;
  }

  /**
   * Builds the Material browser category.
   * @returns Section element.
   */
  private buildMaterialBrowserCategory(): HTMLElement {
    const view = this.store.getViewSettings();
    const { section, body } = createSettingsCategory('Material browser');
    body.appendChild(this.createIconSizeRow(view.materialBrowserIconSizePercent));
    return section;
  }

  /**
   * Builds the viewport layout category.
   * @returns Section containing the pane count control.
   */
  private buildViewportsCategory(): HTMLElement {
    const view = this.store.getViewSettings();
    const { section, body } = createSettingsCategory('Viewports');
    body.appendChild(this.createPaneCountRow(view.viewportPaneCount));
    return section;
  }

  /**
   * Creates the viewport pane count dropdown.
   * @param paneCount Current number of visible viewport panes.
   * @returns Control row for the pane count preference.
   */
  private createPaneCountRow(paneCount: number): HTMLElement {
    const options = VIEWPORT_PANE_COUNT_OPTIONS.map((value) => ({
      value: String(value),
      label: `${value} pane${value === 1 ? '' : 's'}`
    }));
    const select = createSettingsSelect(options, String(paneCount), (value) => {
      this.store.setViewportPaneCount(Number(value));
    });
    select.dataset.settingsField = 'viewport-pane-count';
    return createSettingsControlRow('Visible panes', select);
  }

  /**
   * Builds the Fonts category.
   * @returns Section element.
   */
  private buildFontsCategory(): HTMLElement {
    const view = this.store.getViewSettings();
    const { section, body } = createSettingsCategory('Fonts');
    body.appendChild(this.createFontSizeRow(view.rendererFontSize));
    return section;
  }

  /**
   * Creates the theme dropdown row.
   * @param theme Current theme preference.
   * @returns Control row.
   */
  private createThemeRow(theme: UiThemePreference): HTMLElement {
    const options = UI_THEME_OPTIONS.map((value) => ({
      value,
      label: UI_THEME_LABELS[value]
    }));
    const select = createSettingsSelect(options, theme, (value) => {
      this.store.setTheme(value as UiThemePreference);
    });
    select.dataset.settingsField = 'theme';
    return createSettingsControlRow('Theme', select);
  }

  /**
   * Creates the brightness slider row.
   * @param brightness Current brightness percent.
   * @returns Control row.
   */
  private createBrightnessRow(brightness: number): HTMLElement {
    const slider = createSettingsSlider(
      BRIGHTNESS_MIN,
      BRIGHTNESS_MAX,
      1,
      brightness,
      (value) => `${value}%`,
      (value) => this.store.setBrightness(value)
    );
    const range = slider.querySelector('input[type="range"]') as HTMLInputElement;
    if (range) {
      range.dataset.settingsField = 'brightness';
    }
    return createSettingsControlRow('Brightness', slider);
  }

  /**
   * Creates the material browser icon size dropdown.
   * @param percent Current icon size percent.
   * @returns Control row.
   */
  private createIconSizeRow(percent: number): HTMLElement {
    const options = MATERIAL_BROWSER_ICON_SIZE_OPTIONS.map((value) => ({
      value: String(value),
      label: `${value}%`
    }));
    const select = createSettingsSelect(options, String(percent), (value) => {
      this.store.setMaterialBrowserIconSizePercent(Number(value));
    });
    select.dataset.settingsField = 'material-icon-size';
    return createSettingsControlRow('Icon Size', select);
  }

  /**
   * Creates the renderer font size dropdown.
   * @param fontSize Current font size in pixels.
   * @returns Control row.
   */
  private createFontSizeRow(fontSize: number): HTMLElement {
    const options = buildRendererFontSizeOptions().map((value) => ({
      value: String(value),
      label: String(value)
    }));
    const select = createSettingsSelect(options, String(fontSize), (value) => {
      this.store.setRendererFontSize(Number(value));
    });
    select.dataset.settingsField = 'renderer-font-size';
    return createSettingsControlRow('Renderer font size', select);
  }
}
