import { Theme } from '@/theme.js';
import { hexToRgb } from '@/utils/utils_color.js';
import { getActiveUiThemePalette } from '@/ui/theme/theme_ui_palette.js';
import { styleWindowCornerCloseButton } from '@/ui/floating_panel/style_window_corner_close_button.js';

/**
 * Style injection and chrome helpers for the settings dialog. Matches editor
 * panels/toolbar: flat dark greys, orange selection accents.
 */

const STYLE_ELEMENT_ID = 'aiworlded-settings-dialog-styles';

/** Ensures settings dialog animation styles exist once in the document. */
export function ensureSettingsDialogStyles(): void {
  if (document.getElementById(STYLE_ELEMENT_ID)) {
    return;
  }
  const styleElement = document.createElement('style');
  styleElement.id = STYLE_ELEMENT_ID;
  styleElement.textContent = buildSettingsDialogCss();
  document.head.appendChild(styleElement);
}

/**
 * Builds CSS rules for settings dialog entrance animations and tabs.
 *
 * @returns CSS text.
 */
function buildSettingsDialogCss(): string {
  const selection = hexToRgb(Theme.selectionColor);
  return `
@keyframes settingsBackdropIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes settingsPanelIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.settings-dialog-backdrop {
  animation: settingsBackdropIn 160ms ease-out forwards;
}
.settings-dialog-panel {
  animation: settingsPanelIn 180ms ease-out forwards;
}
.settings-dialog-tab[aria-selected="true"] {
  color: #ffffff;
  background: rgba(232, 106, 23, 0.22);
  border-color: ${selection};
}
`.trim();
}

/**
 * Applies chrome styles to the settings panel card.
 *
 * @param panel Panel element.
 */
export function styleSettingsPanel(panel: HTMLElement): void {
  const palette = getActiveUiThemePalette();
  panel.classList.add('settings-dialog-panel');
  panel.style.position = 'relative';
  panel.style.width = 'min(720px, 100%)';
  panel.style.height = 'min(78vh, 640px)';
  panel.style.display = 'flex';
  panel.style.flexDirection = 'column';
  panel.style.borderRadius = '8px';
  panel.style.border = `1px solid ${palette.dialogChromeBorderColor}`;
  panel.style.background = palette.dialogBackground;
  panel.style.fontFamily = Theme.uiFontFamily;
  panel.style.color = palette.dialogLabelTextColor;
  panel.style.overflow = 'hidden';
  panel.style.boxShadow = palette.dialogBoxShadow;
  panel.style.boxSizing = 'border-box';
}

/**
 * Applies styles to the settings header bar.
 *
 * @param header Header element.
 */
export function styleSettingsHeader(header: HTMLElement): void {
  const palette = getActiveUiThemePalette();
  header.classList.add('settings-dialog-header');
  header.style.position = 'relative';
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.flexShrink = '0';
  header.style.height = '33px';
  header.style.padding = '0 14px';
  header.style.boxSizing = 'border-box';
  header.style.borderBottom = `1px solid ${palette.dialogChromeBorderColor}`;
  header.style.background = palette.dialogChromeBackground;
}

/**
 * Applies styles to the settings title.
 *
 * @param title Title element.
 */
export function styleSettingsTitle(title: HTMLElement): void {
  const palette = getActiveUiThemePalette();
  title.classList.add('settings-dialog-title');
  title.style.margin = '0';
  title.style.fontSize = '13px';
  title.style.fontWeight = '600';
  title.style.letterSpacing = '0.02em';
  title.style.color = palette.dialogLabelTextColor;
  title.style.fontFamily = Theme.uiFontFamily;
}

/**
 * Applies the Windows 11-style corner close button chrome to the settings
 * header close control.
 *
 * @param closeButton Close button element.
 */
export function styleSettingsCloseButton(closeButton: HTMLButtonElement): void {
  closeButton.type = 'button';
  closeButton.textContent = '×';
  closeButton.title = 'Close';
  closeButton.setAttribute('aria-label', 'Close settings');
  styleWindowCornerCloseButton(closeButton);
}

/**
 * Applies styles to the horizontal tab bar.
 *
 * @param tabBar Tab bar element.
 */
export function styleSettingsTabBar(tabBar: HTMLElement): void {
  const palette = getActiveUiThemePalette();
  tabBar.classList.add('settings-dialog-tab-bar');
  tabBar.style.display = 'flex';
  tabBar.style.flexWrap = 'wrap';
  tabBar.style.alignItems = 'center';
  tabBar.style.gap = '4px';
  tabBar.style.padding = '8px 12px';
  tabBar.style.borderBottom = `1px solid ${palette.dialogChromeBorderColor}`;
  tabBar.style.background = palette.dialogChromeBackground;
  tabBar.setAttribute('role', 'tablist');
}

/**
 * Applies styles to the Settings → Reset control on the right of the tab bar.
 *
 * @param button Reset button element.
 */
export function styleSettingsResetButton(button: HTMLButtonElement): void {
  const palette = getActiveUiThemePalette();
  button.type = 'button';
  button.classList.add('settings-dialog-reset-button');
  button.style.marginLeft = 'auto';
  button.style.cursor = 'pointer';
  button.style.border = `1px solid ${palette.controlBorderColor}`;
  button.style.borderRadius = '4px';
  button.style.padding = '5px 10px';
  button.style.fontSize = '12px';
  button.style.fontWeight = '500';
  button.style.fontFamily = Theme.uiFontFamily;
  button.style.background = palette.controlBackground;
  button.style.color = palette.controlTextColor;
  button.style.letterSpacing = '0.01em';
  button.style.flexShrink = '0';
  bindHoverBackground(button, palette.controlHoverBackground, palette.controlBackground);
}

/**
 * Applies styles to one settings tab button.
 *
 * @param tab Tab button element.
 */
export function styleSettingsTabButton(tab: HTMLButtonElement): void {
  const palette = getActiveUiThemePalette();
  tab.type = 'button';
  tab.classList.add('settings-dialog-tab');
  tab.style.cursor = 'pointer';
  tab.style.border = '1px solid transparent';
  tab.style.borderRadius = '4px';
  tab.style.padding = '5px 10px';
  tab.style.fontSize = '12px';
  tab.style.fontWeight = '500';
  tab.style.fontFamily = Theme.uiFontFamily;
  tab.style.background = 'transparent';
  tab.style.color = palette.dialogLabelTextColor;
  tab.style.letterSpacing = '0.01em';
  tab.style.transition = 'background 80ms ease, border-color 80ms ease';
  bindTabHover(tab);
  applySettingsTabSelectedState(tab, tab.getAttribute('aria-selected') === 'true');
}

/**
 * Applies styles to the scrollable tab content host.
 *
 * @param content Content host element.
 */
export function styleSettingsContent(content: HTMLElement): void {
  const palette = getActiveUiThemePalette();
  content.classList.add('settings-dialog-content');
  content.style.flex = '1 1 auto';
  content.style.overflowY = 'auto';
  content.style.padding = '10px 14px 16px';
  content.style.background = palette.dialogContentBackground;
  content.setAttribute('role', 'tabpanel');
}

/**
 * Applies the selected-tab treatment to a settings tab button.
 *
 * @param tab Tab button element.
 * @param selected Whether the tab is the active one.
 */
export function applySettingsTabSelectedState(tab: HTMLButtonElement, selected: boolean): void {
  const palette = getActiveUiThemePalette();
  if (selected) {
    tab.style.background = palette.dialogTabActiveBackground;
    tab.style.borderColor = palette.dialogTabActiveBorderColor;
    tab.style.color = palette.dialogTabActiveTextColor;
    return;
  }
  tab.style.background = 'transparent';
  tab.style.borderColor = 'transparent';
  tab.style.color = palette.dialogLabelTextColor;
}

/**
 * Binds hover background feedback that skips selected tabs.
 *
 * @param tab Tab button element.
 */
function bindTabHover(tab: HTMLButtonElement): void {
  tab.addEventListener('mouseenter', () => {
    if (tab.getAttribute('aria-selected') === 'true') {
      return;
    }
    const palette = getActiveUiThemePalette();
    tab.style.background = palette.controlHoverBackground;
    tab.style.borderColor = palette.controlHoverBorderColor;
  });
  tab.addEventListener('mouseleave', () => {
    if (tab.getAttribute('aria-selected') === 'true') {
      return;
    }
    tab.style.background = 'transparent';
    tab.style.borderColor = 'transparent';
  });
}

/**
 * Binds simple hover background swap for chrome buttons.
 *
 * @param button Button element.
 * @param hoverColor Background while hovered.
 * @param idleColor Background at rest.
 */
function bindHoverBackground(button: HTMLElement, hoverColor: string, idleColor: string): void {
  button.addEventListener('mouseenter', () => {
    button.style.background = hoverColor;
  });
  button.addEventListener('mouseleave', () => {
    button.style.background = idleColor;
  });
}
