import { PanelFloating } from '@/ui/floating_panel/panel_floating.js';
import { applyFloatingPanelToolChrome } from '@/ui/floating_panel/panel_floating_tool_chrome.js';
import {
  applySettingsTabSelectedState,
  ensureSettingsDialogStyles,
  styleSettingsTabBar,
  styleSettingsTabButton,
} from '@/ui/settings/dialog_settings_styles.js';
import { sharedAiCaptureDebugStore, type StoreAiCaptureDebug } from '@/ai/client/store_ai_capture_debug.js';
import type { ManagerImage } from '@/texture/image_manager/manager_image.js';
import { getImageManager } from '@/texture/image_manager/image_manager_shared.js';
import { DebugMenuCaptures } from './debug_menu_captures.js';
import { DebugMenuImages } from './debug_menu_images.js';
import { DebugMenuMemory } from './debug_menu_memory.js';
import type { DebugMenuTab } from './debug_menu_tab.js';

/** How often the visible tab refreshes while the menu is open. */
const DEBUG_MENU_REFRESH_MS = 1000;

/**
 * Floating Debug Menu with tabs: AI view_capture images, the image manager's
 * handles and memory figures. Only the selected tab is built, and only while
 * the menu is open.
 */
export class PanelDebugMenu extends PanelFloating {
  private readonly tabs: DebugMenuTab[];
  private readonly tabButtons: HTMLButtonElement[] = [];
  private readonly content = document.createElement('div');
  private selected = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  /**
   * Creates the Debug Menu.
   *
   * @param host Parent element (editor root / toolbar container).
   * @param defaultAnchor Element used for default open position.
   * @param store AI capture store (defaults to the shared one).
   * @param manager Image manager (defaults to the shared one).
   */
  constructor(
    host: HTMLElement,
    defaultAnchor: HTMLElement | null = null,
    store: StoreAiCaptureDebug = sharedAiCaptureDebugStore,
    manager: ManagerImage = getImageManager(),
  ) {
    super(host, { corner: 'bottom-right', insetBelowViewportToolbar: false }, defaultAnchor);
    this.tabs = [new DebugMenuCaptures(store), new DebugMenuImages(manager), new DebugMenuMemory(manager, store)];
    this.root.classList.add('editor-debug-menu-panel');
    applyFloatingPanelToolChrome(this.root, {
      width: 'min(780px, calc(100vw - 32px))',
      maxHeight: '70vh',
      borderRadiusPx: 8,
      boxShadow: '0 10px 28px rgba(0, 0, 0, calc(0.55 * var(--aiworlded-shadow-strength, 1)))',
      overflowHidden: true,
    });
    this.root.style.height = '70vh';
    this.root.style.display = 'flex';
    this.root.style.flexDirection = 'column';
    this.root.appendChild(this.createStandardTitleBar({ titleText: 'Debug Menu' }).bar);
    this.root.appendChild(this.tabBarBuild());
    this.content.style.flex = '1';
    this.content.style.minHeight = '0';
    this.content.style.minWidth = '0';
    this.content.style.display = 'flex';
    this.content.style.flexDirection = 'column';
    this.content.setAttribute('role', 'tabpanel');
    this.root.appendChild(this.content);
  }

  /**
   * Selects a tab.
   *
   * @param index Tab index (0 view capture, 1 image handles, 2 memory).
   */
  tabSelect(index: number): void {
    if (index < 0 || index >= this.tabs.length) return;
    if (this.isOpen()) this.tabs[this.selected]!.hide();
    this.selected = index;
    this.tabButtons.forEach((button, each) => {
      button.setAttribute('aria-selected', each === index ? 'true' : 'false');
      applySettingsTabSelectedState(button, each === index);
    });
    this.content.replaceChildren(this.tabs[index]!.element);
    if (this.isOpen()) this.tabs[index]!.show();
  }

  /**
   * Returns the selected tab's label.
   *
   * @returns Label.
   */
  tabSelected(): string {
    return this.tabs[this.selected]!.label;
  }

  /** Refreshes the visible tab. */
  refresh(): void {
    if (this.isOpen()) this.tabs[this.selected]!.refresh();
  }

  /** Stops updating and drops every tab. */
  override dispose(): void {
    this.timerStop();
    this.tabs.forEach((tab) => tab.dispose());
    super.dispose();
  }

  /** Builds the selected tab and starts the refresh timer. */
  protected override onAfterShow(): void {
    this.tabSelect(this.selected);
    this.timerStop();
    this.timer = setInterval(() => this.refresh(), DEBUG_MENU_REFRESH_MS);
  }

  /**
   * Lets go of the tab's contents (capture images included) and stops the
   * timer.
   */
  protected override onAfterHide(): void {
    this.timerStop();
    this.tabs[this.selected]!.hide();
  }

  /** Stops the refresh timer. */
  private timerStop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Builds the tab bar.
   *
   * @returns Tab bar.
   */
  private tabBarBuild(): HTMLElement {
    ensureSettingsDialogStyles();
    const bar = document.createElement('div');
    styleSettingsTabBar(bar);
    this.tabs.forEach((tab, index) => {
      const button = document.createElement('button');
      button.textContent = tab.label;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', index === this.selected ? 'true' : 'false');
      styleSettingsTabButton(button);
      button.addEventListener('click', () => this.tabSelect(index));
      this.tabButtons.push(button);
      bar.appendChild(button);
    });
    this.content.replaceChildren(this.tabs[this.selected]!.element);
    return bar;
  }
}
