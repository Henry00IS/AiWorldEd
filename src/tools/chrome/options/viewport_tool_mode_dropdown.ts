import { Theme } from '@/theme.js';
import { PanelMenu } from '@/ui/menu/panel_menu.js';
import { PanelMenuDropdown } from '@/ui/menu/panel_menu_dropdown.js';
import { EditorInteractionMode, getEditorInteractionModeLabel } from '@/types/editor_interaction_mode.js';
import { applyViewportToolOptionsTextButtonMetrics } from './viewport_tool_options_control_style.js';
import { buildViewportToolModeMenuEntries } from './viewport_tool_mode_menu.js';

/**
 * Blender-style Object Mode / Edit Mode control using the shared editor menu
 * system (PanelMenu) so the panel stacks above the floating tool rail.
 */
export class ViewportToolModeDropdown extends PanelMenuDropdown {
  private readonly label: HTMLElement;
  private readonly onModeSelected: (mode: EditorInteractionMode) => void;
  private activeMode: EditorInteractionMode;

  /**
   * Creates the mode dropdown.
   *
   * @param parentElement Options bar host.
   * @param onModeSelected Invoked when the user picks a mode.
   */
  constructor(parentElement: HTMLElement, onModeSelected: (mode: EditorInteractionMode) => void) {
    super(parentElement);
    this.onModeSelected = onModeSelected;
    this.activeMode = EditorInteractionMode.OBJECT_MODE;
    this.label = this.ownerDocument.createElement('span');
    this.buildChrome();
    parentElement.appendChild(this.wrapper);
    this.setActiveMode(EditorInteractionMode.OBJECT_MODE);
  }

  /**
   * Updates the displayed active mode.
   *
   * @param mode Interaction mode.
   */
  setActiveMode(mode: EditorInteractionMode): void {
    this.activeMode = mode;
    this.label.textContent = getEditorInteractionModeLabel(mode);
    this.button.title = `${getEditorInteractionModeLabel(mode)} (Tab)`;
  }

  /** Builds the trigger button and attaches the menu host. */
  private buildChrome(): void {
    this.styleTriggerButton();
    this.styleLabel();
    this.button.appendChild(this.label);
    this.appendCaret(this.button);
    this.wrapper.appendChild(this.button);
    this.rebuildMenuPanel();
  }

  /** Styles the closed mode button to match other options-bar controls. */
  protected styleTriggerButton(): void {
    applyViewportToolOptionsTextButtonMetrics(this.button);
    this.button.style.gap = '3px';
    this.button.style.fontWeight = '600';
  }

  /** Styles the active-mode label text. */
  private styleLabel(): void {
    this.label.style.fontFamily = Theme.uiFontFamily;
    this.label.style.fontSize = '11px';
    this.label.style.fontWeight = '600';
    this.label.style.lineHeight = '1';
  }

  /** Rebuilds menu entries so the active checkmark stays current. */
  protected rebuildMenuPanel(): void {
    this.menuPanel?.dispose();
    this.menuPanel = new PanelMenu(
      buildViewportToolModeMenuEntries(this.activeMode, (mode) => this.handleModeChosen(mode)),
      () => this.closeMenu(),
      false,
      this.ownerDocument,
    );
    this.wrapper.appendChild(this.menuPanel.getElement());
  }

  /**
   * Applies a mode choice from the menu and closes the panel.
   *
   * @param mode Chosen interaction mode.
   */
  private handleModeChosen(mode: EditorInteractionMode): void {
    this.closeMenu();
    this.onModeSelected(mode);
  }
}
