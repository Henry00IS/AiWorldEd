import type { EditorSettingsStore } from '@/settings/store/editor_settings_store.js';
import {
  ANISOTROPY_PREFERENCE_LABELS,
  ANISOTROPY_PREFERENCE_OPTIONS,
  BRIGHTNESS_MAX,
  BRIGHTNESS_MIN,
  CAMERA_WIDGET_SIZE_MAX_PX,
  CAMERA_WIDGET_SIZE_MIN_PX,
  buildRendererFontSizeOptions,
  MATERIAL_BROWSER_ICON_SIZE_OPTIONS,
  TEXTURE_FILTER_MODE_LABELS,
  TEXTURE_FILTER_MODE_OPTIONS,
  UI_THEME_LABELS,
  UI_THEME_OPTIONS,
  type AnisotropyPreference,
  type TextureFilterMode,
  type UiThemePreference,
} from '@/settings/store/settings_types.js';
import {
  createSettingsCategory,
  createSettingsControlRow,
  createSettingsSelect,
  createSettingsSlider,
} from './settings_form_controls.js';

/**
 * View tab content: UI theme, brightness, textures, material browser, and
 * fonts. Workspace layouts are managed from the workspace tab bar, not here.
 */
export class SettingsViewTab {
  private readonly store: EditorSettingsStore;
  private readonly root: HTMLElement;

  /**
   * Creates the View tab panel.
   *
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
   *
   * @returns Root element.
   */
  getElement(): HTMLElement {
    return this.root;
  }

  /** Rebuilds all View tab controls from the store. */
  rebuild(): void {
    this.root.replaceChildren();
    this.root.appendChild(this.buildUserInterfaceCategory());
    this.root.appendChild(this.buildOrientationWidgetCategory());
    this.root.appendChild(this.buildTexturesCategory());
    this.root.appendChild(this.buildMaterialBrowserCategory());
    this.root.appendChild(this.buildFontsCategory());
  }

  /**
   * Builds the User Interface category.
   *
   * @returns Section element.
   */
  private buildUserInterfaceCategory(): HTMLElement {
    const view = this.store.getViewSettings();
    const { section, body } = createSettingsCategory('User Interface');
    body.appendChild(this.createThemeRow(view.theme));
    body.appendChild(this.createBrightnessRow(view.brightness));
    body.appendChild(this.createToolbarLabelsRow(view.toolbarButtonLabels));
    return section;
  }

  /**
   * Creates the expanded-toolbar label preference.
   *
   * @param enabled Current label preference.
   * @returns Control row containing the checkbox.
   */
  private createToolbarLabelsRow(enabled: boolean): HTMLElement {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = enabled;
    checkbox.dataset['settingsField'] = 'toolbar-button-labels';
    checkbox.addEventListener('change', () => this.store.setToolbarButtonLabels(checkbox.checked));
    return createSettingsControlRow('Expanded toolbar button labels', checkbox);
  }

  /**
   * Builds the Material browser category.
   *
   * @returns Section element.
   */
  private buildMaterialBrowserCategory(): HTMLElement {
    const view = this.store.getViewSettings();
    const { section, body } = createSettingsCategory('Material browser');
    body.appendChild(this.createIconSizeRow(view.materialBrowserIconSizePercent));
    return section;
  }

  /**
   * Builds the perspective orientation widget settings category.
   *
   * @returns Section element.
   */
  private buildOrientationWidgetCategory(): HTMLElement {
    const view = this.store.getViewSettings();
    const { section, body } = createSettingsCategory('Orientation widget');
    body.appendChild(this.createOrientationWidgetSizeRow(view.cameraWidgetSizePx));
    return section;
  }

  /**
   * Creates the orientation widget size slider row.
   *
   * @param sizePx Current widget edge length.
   * @returns Control row for the widget size preference.
   */
  private createOrientationWidgetSizeRow(sizePx: number): HTMLElement {
    const slider = createSettingsSlider(
      CAMERA_WIDGET_SIZE_MIN_PX,
      CAMERA_WIDGET_SIZE_MAX_PX,
      1,
      sizePx,
      (value) => `${value}px`,
      (value) => this.store.setCameraWidgetSizePx(value),
    );
    const range = slider.querySelector('input[type="range"]') as HTMLInputElement;
    if (range) range.dataset['settingsField'] = 'camera-widget-size';
    return createSettingsControlRow('Size', slider);
  }

  /**
   * Builds content texture filtering controls.
   *
   * @returns Section containing filter mode and anisotropy.
   */
  private buildTexturesCategory(): HTMLElement {
    const view = this.store.getViewSettings();
    const { section, body } = createSettingsCategory('Textures');
    body.appendChild(this.createTextureFilterModeRow(view.textureFilterMode));
    body.appendChild(this.createAnisotropyRow(view.anisotropyPreference, view.textureFilterMode === 'point'));
    return section;
  }

  /**
   * Creates the content texture sampling mode dropdown.
   *
   * @param mode Current filter mode.
   * @returns Control row for the filter mode preference.
   */
  private createTextureFilterModeRow(mode: TextureFilterMode): HTMLElement {
    const options = TEXTURE_FILTER_MODE_OPTIONS.map((value) => ({
      value,
      label: TEXTURE_FILTER_MODE_LABELS[value],
    }));
    const select = createSettingsSelect(options, mode, (value) => {
      this.store.setTextureFilterMode(value as TextureFilterMode);
    });
    select.dataset['settingsField'] = 'texture-filter-mode';
    return createSettingsControlRow('Texture filtering', select);
  }

  /**
   * Creates the anisotropic filtering dropdown.
   *
   * @param preference Current anisotropy preference.
   * @param disabled Whether the control is inactive for point sampling.
   * @returns Control row for the anisotropy preference.
   */
  private createAnisotropyRow(preference: AnisotropyPreference, disabled: boolean): HTMLElement {
    const options = ANISOTROPY_PREFERENCE_OPTIONS.map((value) => ({
      value,
      label: ANISOTROPY_PREFERENCE_LABELS[value],
    }));
    const select = createSettingsSelect(options, preference, (value) => {
      this.store.setAnisotropyPreference(value as AnisotropyPreference);
    });
    select.dataset['settingsField'] = 'anisotropy-preference';
    select.disabled = disabled;
    select.title = disabled ? 'Anisotropic filtering applies only when texture filtering is Smooth or Bilinear' : '';
    return createSettingsControlRow('Anisotropic filtering', select);
  }

  /**
   * Builds the Fonts category.
   *
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
   *
   * @param theme Current theme preference.
   * @returns Control row.
   */
  private createThemeRow(theme: UiThemePreference): HTMLElement {
    const options = UI_THEME_OPTIONS.map((value) => ({
      value,
      label: UI_THEME_LABELS[value],
    }));
    const select = createSettingsSelect(options, theme, (value) => {
      this.store.setTheme(value as UiThemePreference);
    });
    select.dataset['settingsField'] = 'theme';
    return createSettingsControlRow('Theme', select);
  }

  /**
   * Creates the brightness slider row.
   *
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
      (value) => this.store.setBrightness(value),
    );
    const range = slider.querySelector('input[type="range"]') as HTMLInputElement;
    if (range) {
      range.dataset['settingsField'] = 'brightness';
    }
    return createSettingsControlRow('Brightness', slider);
  }

  /**
   * Creates the material browser icon size dropdown.
   *
   * @param percent Current icon size percent.
   * @returns Control row.
   */
  private createIconSizeRow(percent: number): HTMLElement {
    const options = MATERIAL_BROWSER_ICON_SIZE_OPTIONS.map((value) => ({
      value: String(value),
      label: `${value}%`,
    }));
    const select = createSettingsSelect(options, String(percent), (value) => {
      this.store.setMaterialBrowserIconSizePercent(Number(value));
    });
    select.dataset['settingsField'] = 'material-icon-size';
    return createSettingsControlRow('Icon Size', select);
  }

  /**
   * Creates the renderer font size dropdown.
   *
   * @param fontSize Current font size in pixels.
   * @returns Control row.
   */
  private createFontSizeRow(fontSize: number): HTMLElement {
    const options = buildRendererFontSizeOptions().map((value) => ({
      value: String(value),
      label: String(value),
    }));
    const select = createSettingsSelect(options, String(fontSize), (value) => {
      this.store.setRendererFontSize(Number(value));
    });
    select.dataset['settingsField'] = 'renderer-font-size';
    return createSettingsControlRow('Renderer font size', select);
  }
}
