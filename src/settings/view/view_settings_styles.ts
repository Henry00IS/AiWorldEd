/** Identifier used to keep the view settings stylesheet singular. */
const VIEW_SETTINGS_STYLE_ID = 'aiworlded-view-settings-styles';

/**
 * Installs the stylesheet that turns View preferences into visible editor
 * changes.
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
 *
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
 * Builds the complete view-settings stylesheet text.
 *
 * @returns Complete view settings stylesheet.
 */
function buildViewSettingsCss(): string {
  return [buildFontSizeCss(), buildStatusBarLabelFontSizeCss(), buildTextureBrowserCss()].join('\n');
}

/**
 * Builds the program UI font-size override.
 *
 * @returns Font-size CSS rules.
 */
function buildFontSizeCss(): string {
  return `#editor-container, #editor-container button, #editor-container input,
#editor-container select, #editor-container textarea {
  font-size: var(--aiworlded-ui-font-size);
}`;
}

/**
 * Keeps status bar labels at their fixed size, overriding the general container
 * font-size rule.
 *
 * @returns Status bar label font-size CSS rules.
 */
function buildStatusBarLabelFontSizeCss(): string {
  return `#editor-container .editor-status-bar-label {
  font-size: 11px;
}`;
}

/**
 * Builds texture browser visual preference rules.
 *
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
