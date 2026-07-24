import { Theme } from '../../theme.js';
import { hexToRgb } from '../../utils/color_utils.js';

/**
 * Style injection and chrome helpers for the settings dialog.
 * Matches editor panels/toolbar: flat dark greys, orange selection accents.
 */

const STYLE_ELEMENT_ID = 'aiworlded-settings-dialog-styles';

/**
 * Ensures settings dialog animation styles exist once in the document.
 */
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
  color: #ffffff !important;
  background: rgba(232, 106, 23, 0.22) !important;
  border-color: ${selection} !important;
}
`.trim();
}

/**
 * Applies full-viewport modal backdrop styles.
 * @param backdrop Backdrop element.
 */
export function styleSettingsBackdrop(backdrop: HTMLElement): void {
  backdrop.classList.add('settings-dialog-backdrop');
  backdrop.style.position = 'fixed';
  backdrop.style.inset = '0';
  backdrop.style.zIndex = '12100';
  backdrop.style.display = 'none';
  backdrop.style.alignItems = 'center';
  backdrop.style.justifyContent = 'center';
  backdrop.style.padding = '24px';
  backdrop.style.background = 'rgba(0, 0, 0, 0.55)';
}

/**
 * Applies chrome styles to the settings panel card.
 * @param panel Panel element.
 */
export function styleSettingsPanel(panel: HTMLElement): void {
  panel.classList.add('settings-dialog-panel');
  panel.style.position = 'relative';
  panel.style.width = 'min(720px, 100%)';
  panel.style.height = 'min(78vh, 640px)';
  panel.style.display = 'flex';
  panel.style.flexDirection = 'column';
  panel.style.borderRadius = '8px';
  panel.style.border = `1px solid ${hexToRgb(Theme.separatorColor)}`;
  panel.style.background = hexToRgb(Theme.propertiesPanelBackground);
  panel.style.fontFamily = Theme.uiFontFamily;
  panel.style.color = Theme.buttonTextColor;
  panel.style.overflow = 'hidden';
  panel.style.boxShadow = '0 12px 36px rgba(0, 0, 0, 0.55)';
}

/**
 * Applies styles to the settings header bar.
 * @param header Header element.
 */
export function styleSettingsHeader(header: HTMLElement): void {
  header.classList.add('settings-dialog-header');
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.padding = '10px 14px';
  header.style.borderBottom = `1px solid ${hexToRgb(Theme.separatorColor)}`;
  header.style.background = buildToolbarGradient();
}

/**
 * Applies styles to the settings title.
 * @param title Title element.
 */
export function styleSettingsTitle(title: HTMLElement): void {
  title.classList.add('settings-dialog-title');
  title.style.margin = '0';
  title.style.fontSize = '13px';
  title.style.fontWeight = '600';
  title.style.letterSpacing = '0.02em';
  title.style.color = Theme.buttonTextColor;
  title.style.fontFamily = Theme.uiFontFamily;
}

/**
 * Applies styles to the header close button.
 * @param closeButton Close button element.
 */
export function styleSettingsCloseButton(closeButton: HTMLButtonElement): void {
  closeButton.type = 'button';
  closeButton.textContent = '×';
  closeButton.title = 'Close';
  closeButton.setAttribute('aria-label', 'Close settings');
  closeButton.style.width = '26px';
  closeButton.style.height = '26px';
  closeButton.style.border = `1px solid ${Theme.inputBorderColor}`;
  closeButton.style.borderRadius = '4px';
  closeButton.style.background = hexToRgb(Theme.buttonBackground);
  closeButton.style.color = Theme.buttonTextColor;
  closeButton.style.cursor = 'pointer';
  closeButton.style.fontSize = '16px';
  closeButton.style.lineHeight = '1';
  closeButton.style.fontFamily = Theme.uiFontFamily;
  bindHoverBackground(closeButton, hexToRgb(Theme.buttonHoverColor), hexToRgb(Theme.buttonBackground));
}

/**
 * Applies styles to the horizontal tab bar.
 * @param tabBar Tab bar element.
 */
export function styleSettingsTabBar(tabBar: HTMLElement): void {
  tabBar.classList.add('settings-dialog-tab-bar');
  tabBar.style.display = 'flex';
  tabBar.style.flexWrap = 'wrap';
  tabBar.style.gap = '4px';
  tabBar.style.padding = '8px 12px';
  tabBar.style.borderBottom = `1px solid ${hexToRgb(Theme.separatorColor)}`;
  tabBar.style.background = hexToRgb(Theme.toolbarBackground);
  tabBar.setAttribute('role', 'tablist');
}

/**
 * Applies styles to one settings tab button.
 * @param tab Tab button element.
 */
export function styleSettingsTabButton(tab: HTMLButtonElement): void {
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
  tab.style.color = Theme.buttonTextColor;
  tab.style.letterSpacing = '0.01em';
  tab.style.transition = 'background 80ms ease, border-color 80ms ease';
  bindTabHover(tab);
}

/**
 * Applies styles to the scrollable tab content host.
 * @param content Content host element.
 */
export function styleSettingsContent(content: HTMLElement): void {
  content.classList.add('settings-dialog-content');
  content.style.flex = '1 1 auto';
  content.style.overflowY = 'auto';
  content.style.padding = '10px 14px 16px';
  content.style.background = hexToRgb(Theme.propertiesPanelBackground);
  content.setAttribute('role', 'tabpanel');
}

/**
 * Builds the same subtle vertical gradient used by the main toolbar.
 * @returns CSS linear-gradient string.
 */
function buildToolbarGradient(): string {
  return `linear-gradient(180deg, ${hexToRgb(Theme.toolbarBackground)} 0%, ${hexToRgb(Theme.toolbarBackgroundEnd)} 100%)`;
}

/**
 * Binds hover background feedback that skips selected tabs.
 * @param tab Tab button element.
 */
function bindTabHover(tab: HTMLButtonElement): void {
  tab.addEventListener('mouseenter', () => {
    if (tab.getAttribute('aria-selected') === 'true') {
      return;
    }
    tab.style.background = hexToRgb(Theme.buttonHoverColor);
    tab.style.borderColor = 'rgba(255,255,255,0.06)';
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
 * @param button Button element.
 * @param hoverColor Background while hovered.
 * @param idleColor Background at rest.
 */
function bindHoverBackground(
  button: HTMLElement,
  hoverColor: string,
  idleColor: string
): void {
  button.addEventListener('mouseenter', () => {
    button.style.background = hoverColor;
  });
  button.addEventListener('mouseleave', () => {
    button.style.background = idleColor;
  });
}
