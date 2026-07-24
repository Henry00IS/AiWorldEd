import { Theme } from '../../theme.js';

/**
 * Placeholder panel for settings tabs without options yet.
 */
export class SettingsPlaceholderTab {
  private readonly root: HTMLElement;

  /**
   * Creates a placeholder message panel.
   * @param tabLabel Human-readable tab name.
   */
  constructor(tabLabel: string) {
    this.root = document.createElement('div');
    this.root.style.padding = '20px 4px';
    this.root.style.color = Theme.statusBarTextColor;
    this.root.style.fontSize = '12px';
    this.root.style.fontFamily = Theme.uiFontFamily;
    this.root.style.lineHeight = '1.5';
    this.root.textContent = `${tabLabel} settings will appear here.`;
  }

  /**
   * Returns the placeholder root element.
   * @returns Root element.
   */
  getElement(): HTMLElement {
    return this.root;
  }
}
