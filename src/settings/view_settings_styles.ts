/** Identifier used to keep the view settings stylesheet singular. */
const VIEW_SETTINGS_STYLE_ID = 'aiworlded-view-settings-styles';

/**
 * Installs the stylesheet that turns View preferences into visible editor changes.
 */
export function ensureViewSettingsStyles(): void {
  if (typeof document === 'undefined') {
    return;
  }
  const style = getOrCreateViewSettingsStyle();
  style.textContent = buildViewSettingsCss();
}

/**
 * Returns the dedicated stylesheet, creating it when necessary.
 * @returns View settings stylesheet.
 */
function getOrCreateViewSettingsStyle(): HTMLStyleElement {
  const existing = document.getElementById(VIEW_SETTINGS_STYLE_ID);
  if (existing instanceof HTMLStyleElement) {
    return existing;
  }
  const style = document.createElement('style');
  style.id = VIEW_SETTINGS_STYLE_ID;
  document.head.appendChild(style);
  return style;
}

/**
 * Builds global rules consumed by the editor's View settings.
 * @returns Complete view settings stylesheet.
 */
function buildViewSettingsCss(): string {
  return [buildFontSizeCss(), buildTextureBrowserCss(), buildLightThemeCss()].join(
    '\n'
  );
}

/**
 * Builds the program UI font-size override.
 * @returns Font-size CSS rules.
 */
function buildFontSizeCss(): string {
  return `#editor-container, #editor-container button, #editor-container input,
#editor-container select, #editor-container textarea {
  font-size: var(--aiworlded-ui-font-size) !important;
}`;
}

/**
 * Builds texture browser visual preference rules.
 * @returns Texture browser CSS rules.
 */
function buildTextureBrowserCss(): string {
  return `.tb-browser-grid {
  grid-template-columns: repeat(auto-fill, minmax(calc(96px * var(--aiworlded-material-icon-scale)), 1fr));
}
.tb-browser-thumb {
  filter: brightness(var(--aiworlded-viewport-brightness));
}`;
}

/**
 * Builds the Windows-inspired light theme palette.
 * @returns Light theme CSS rules.
 */
function buildLightThemeCss(): string {
  return [
    buildLightThemeFrameCss(),
    buildLightThemePanelCss(),
    buildLightThemePanelContentCss(),
    buildLightThemeSettingsDialogCss(),
    buildLightThemeViewportLabelCss(),
    buildLightThemeSelectionCss(),
    buildLightThemeControlCss(),
    buildLightThemeSettingsContentCss(),
    buildLightThemeInteractionCss(),
    buildLightThemeChromeCss(),
    buildLightThemeContextMenuCss(),
    buildLightThemeFocusCss(),
    buildLightThemeActiveTabCss()
  ].join('\n');
}

/**
 * Builds the bright workspace used in light mode.
 * @returns Light theme frame CSS rules.
 */
function buildLightThemeFrameCss(): string {
  return `html[data-aiworlded-theme='light'],
html[data-aiworlded-theme='light'] body,
html[data-aiworlded-theme='light'] #editor-container {
  background: #ffffff !important;
  color: #0a0a0a !important;
}`;
}

/**
 * Builds the neutral gray editor chrome surrounding the dark work viewports.
 * @returns Editor chrome light-theme CSS rules.
 */
function buildLightThemeChromeCss(): string {
  return `html[data-aiworlded-theme='light'] .editor-toolbar,
html[data-aiworlded-theme='light'] .editor-status-bar,
html[data-aiworlded-theme='light'] .editor-viewport-toolbar {
  background: #e5e5e5 !important;
  border-color: #c6c6c6 !important;
  color: #0a0a0a !important;
  box-shadow: none !important;
}

html[data-aiworlded-theme='light'] .editor-toolbar button,
html[data-aiworlded-theme='light'] .editor-viewport-toolbar button {
  background: transparent !important;
  color: #0a0a0a !important;
  border-color: transparent !important;
}
html[data-aiworlded-theme='light'] .editor-viewport-title {
  color: #0a0a0a !important;
}
html[data-aiworlded-theme='light'] .editor-status-bar * {
  color: #0a0a0a !important;
}`;
}

/**
 * Builds the light context-menu surface and its item states.
 * @returns Light theme context-menu CSS rules.
 */
function buildLightThemeContextMenuCss(): string {
  return `html[data-aiworlded-theme='light'] .editor-context-menu {
  background: #ffffff !important;
  border-color: #767676 !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18) !important;
}
html[data-aiworlded-theme='light'] .editor-context-menu-item {
  color: #0a0a0a !important;
}
html[data-aiworlded-theme='light'] .editor-context-menu-item:hover {
  background: #e5f3ff !important;
}
html[data-aiworlded-theme='light'] .editor-context-menu-item-disabled {
  color: #767676 !important;
}`;
}

/**
 * Builds neutral grey surfaces for floating editor panels.
 * @returns Light theme panel CSS rules.
 */
function buildLightThemePanelCss(): string {
  return `html[data-aiworlded-theme='light'] .settings-dialog-panel,
html[data-aiworlded-theme='light'] .editor-outliner-panel,
html[data-aiworlded-theme='light'] .editor-properties-panel,
html[data-aiworlded-theme='light'] .editor-tools-palette {
  background: #f3f3f3 !important;
  color: #0a0a0a !important;
  border-color: #8c8c8c !important;
}`;
}

/**
 * Builds consistent dark text and restrained borders inside light editor panels.
 * @returns Editor panel content light-theme CSS rules.
 */
function buildLightThemePanelContentCss(): string {
  return `html[data-aiworlded-theme='light'] .editor-outliner-panel *,
html[data-aiworlded-theme='light'] .editor-properties-panel *,
html[data-aiworlded-theme='light'] .editor-tools-palette * {
  color: #0a0a0a !important;
  border-color: #c6c6c6 !important;
}
html[data-aiworlded-theme='light'] .editor-tools-palette {
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18) !important;
}`;
}

/**
 * Builds the white settings content surface with neutral gray dialog chrome.
 * @returns Settings dialog light-theme CSS rules.
 */
function buildLightThemeSettingsDialogCss(): string {
  return `html[data-aiworlded-theme='light'] .settings-dialog-panel {
  background: #ffffff !important;
  color: #0a0a0a !important;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.18) !important;
}
html[data-aiworlded-theme='light'] .settings-dialog-header,
html[data-aiworlded-theme='light'] .settings-dialog-tab-bar {
  background: #e5e5e5 !important;
  border-color: #c6c6c6 !important;
}`;
}

/**
 * Builds soft gray labels that separate the viewport tools from the work area.
 * @returns Viewport label light-theme CSS rules.
 */
function buildLightThemeViewportLabelCss(): string {
  return `html[data-aiworlded-theme='light'] .editor-viewport-label {
  background: #f3f3f3 !important;
  color: #0a0a0a !important;
  border: 1px solid #c6c6c6;
}`;
}

/**
 * Builds the Windows-blue selected-texture treatment used by the light theme.
 * @returns Light theme selection CSS rules.
 */
function buildLightThemeSelectionCss(): string {
  return `html[data-aiworlded-theme='light'] .tb-browser-tile[aria-selected='true'] {
  background: #cce8ff !important;
  border-color: #0078d4 !important;
}`;
}

/**
 * Builds white, readable interactive controls for the light theme.
 * @returns Light theme control CSS rules.
 */
function buildLightThemeControlCss(): string {
  return `html[data-aiworlded-theme='light'] button,
html[data-aiworlded-theme='light'] input,
html[data-aiworlded-theme='light'] select,
html[data-aiworlded-theme='light'] textarea {
  background: #ffffff !important;
  color: #0a0a0a !important;
  border-color: #767676 !important;
}`;
}

/**
 * Builds readable settings categories and unselected tab controls.
 * @returns Settings content light-theme CSS rules.
 */
function buildLightThemeSettingsContentCss(): string {
  return `html[data-aiworlded-theme='light'] .settings-dialog-content {
  background: #ffffff !important;
}
html[data-aiworlded-theme='light'] .settings-dialog-category {
  border-color: #c6c6c6 !important;
}
html[data-aiworlded-theme='light'] .settings-dialog-category-title,
html[data-aiworlded-theme='light'] .settings-dialog-control-label,
html[data-aiworlded-theme='light'] .settings-dialog-title {
  color: #0a0a0a !important;
}
html[data-aiworlded-theme='light'] [data-settings-field='coordinate-space-summary'] {
  color: #424242 !important;
}`;
}

/**
 * Builds pointer and keyboard feedback for light-theme controls.
 * @returns Interactive light-theme CSS rules.
 */
function buildLightThemeInteractionCss(): string {
  return `html[data-aiworlded-theme='light'] button:hover {
  background: #e5f3ff !important;
  border-color: #0078d4 !important;
}
html[data-aiworlded-theme='light'] input[type='range'] {
  accent-color: #0078d4;
}`;
}

/**
 * Builds keyboard focus feedback for light-theme form controls.
 * @returns Focus light-theme CSS rules.
 */
function buildLightThemeFocusCss(): string {
  return `html[data-aiworlded-theme='light'] button:focus-visible,
html[data-aiworlded-theme='light'] input:focus-visible,
html[data-aiworlded-theme='light'] select:focus-visible,
html[data-aiworlded-theme='light'] textarea:focus-visible {
  outline: 2px solid #0078d4 !important;
  outline-offset: -1px;
}`;
}

/**
 * Builds the light-blue active-tab treatment for the settings dialog.
 * @returns Active-tab light-theme CSS rules.
 */
function buildLightThemeActiveTabCss(): string {
  return `html[data-aiworlded-theme='light'] .settings-dialog-panel [role='tab'][aria-selected='true'] {
  background: #cce8ff !important;
  border-color: #0078d4 !important;
  color: #0a0a0a !important;
}`;
}
