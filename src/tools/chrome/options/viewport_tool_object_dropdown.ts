import { Theme } from '@/theme.js';
import { PanelMenu } from '@/ui/menu/panel_menu.js';
import { PanelMenuDropdown } from '@/ui/menu/panel_menu_dropdown.js';
import { ObjectApplyTransformKind } from '@/types/object_apply_transform_kind.js';
import { applyViewportToolOptionsTextButtonMetrics } from './viewport_tool_options_control_style.js';
import { buildViewportToolObjectMenuEntries } from './viewport_tool_object_menu.js';

/** Object menu control for the Edit Mode options bar (Object → Apply → …). */
export class ViewportToolObjectDropdown extends PanelMenuDropdown {
  private readonly onApply: (kind: ObjectApplyTransformKind) => void;

  /**
   * Creates the Object dropdown.
   *
   * @param parentElement Options bar host (not used as mount; parent attaches
   *   getElement()).
   * @param onApply Invoked for Apply submenu actions.
   */
  constructor(parentElement: HTMLElement, onApply: (kind: ObjectApplyTransformKind) => void) {
    super(parentElement);
    this.onApply = onApply;
    this.buildChrome();
  }

  /** Builds the Object trigger button. */
  private buildChrome(): void {
    this.button.setAttribute('aria-label', 'Object');
    this.styleTriggerButton();
    this.button.textContent = 'Object';
    this.appendCaret(this.button);
    this.wrapper.appendChild(this.button);
    this.rebuildMenuPanel();
  }

  /** Styles the Object trigger like other options-bar text controls. */
  protected styleTriggerButton(): void {
    applyViewportToolOptionsTextButtonMetrics(this.button);
    this.button.style.gap = '3px';
    this.button.style.fontWeight = '600';
    this.button.style.fontFamily = Theme.uiFontFamily;
    this.button.style.fontSize = '11px';
  }

  /** Rebuilds menu entries so Apply actions stay current. */
  protected rebuildMenuPanel(): void {
    this.menuPanel?.dispose();
    this.menuPanel = new PanelMenu(
      buildViewportToolObjectMenuEntries((kind) => this.handleApplyChosen(kind)),
      () => this.closeMenu(),
      false,
      this.ownerDocument,
    );
    this.wrapper.appendChild(this.menuPanel.getElement());
  }

  /**
   * Runs an apply action and closes the menu.
   *
   * @param kind Chosen apply kind.
   */
  private handleApplyChosen(kind: ObjectApplyTransformKind): void {
    this.closeMenu();
    this.onApply(kind);
  }
}
