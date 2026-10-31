import { Theme } from '@/theme.js';
import { PanelMenu } from '@/ui/menu/panel_menu.js';
import { PanelMenuDropdown } from '@/ui/menu/panel_menu_dropdown.js';
import type { ToolbarMenuEntry } from '@/ui/menu/menu_types.js';
import { styleViewportToolRailButton } from '@/tools/chrome/rail/viewport_tool_rail_button.js';
import { applyViewportToolOptionsTextButtonMetrics } from './viewport_tool_options_control_style.js';

/** Named options-bar dropdown matching the Object menu chrome. */
export class ViewportToolNamedDropdown extends PanelMenuDropdown {
  private readonly label: string;
  private readonly buildEntries: () => ToolbarMenuEntry[];

  /**
   * Creates a labeled dropdown.
   *
   * @param parentElement Options bar host.
   * @param label Trigger label.
   * @param buildEntries Menu entry factory evaluated when the menu opens.
   */
  constructor(parentElement: HTMLElement, label: string, buildEntries: () => ToolbarMenuEntry[]) {
    super(parentElement);
    this.label = label;
    this.buildEntries = buildEntries;
    this.buildChrome();
  }

  /** Builds the trigger button. */
  private buildChrome(): void {
    this.button.setAttribute('aria-label', this.label);
    this.styleTriggerButton();
    this.button.textContent = this.label;
    this.appendCaret(this.button);
    this.wrapper.appendChild(this.button);
    this.rebuildMenuPanel();
  }

  /** Styles the trigger like the Object dropdown. */
  protected styleTriggerButton(): void {
    applyViewportToolOptionsTextButtonMetrics(this.button);
    this.button.style.gap = '3px';
    this.button.style.fontWeight = '600';
    this.button.style.fontFamily = Theme.uiFontFamily;
    this.button.style.fontSize = '11px';
  }

  /**
   * Paints the trigger with the armed selection style.
   *
   * @param highlighted True while a tool opened from this menu is armed.
   */
  setTriggerHighlighted(highlighted: boolean): void {
    styleViewportToolRailButton(this.button, highlighted);
  }

  /** Rebuilds menu entries from the factory. */
  protected rebuildMenuPanel(): void {
    this.menuPanel?.dispose();
    this.menuPanel = new PanelMenu(this.buildEntries(), () => this.closeMenu(), false, this.ownerDocument);
    this.wrapper.appendChild(this.menuPanel.getElement());
  }
}
