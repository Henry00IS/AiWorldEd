import type { EditorSettingsStore } from '../../settings/editor_settings_store.js';
import {
  SETTINGS_TAB_LABELS,
  SETTINGS_TAB_ORDER,
  type SettingsTabId
} from '../../settings/settings_types.js';
import {
  ensureSettingsDialogStyles,
  styleSettingsBackdrop,
  styleSettingsCloseButton,
  styleSettingsContent,
  styleSettingsHeader,
  styleSettingsPanel,
  styleSettingsTabBar,
  styleSettingsTabButton,
  styleSettingsTitle
} from './settings_dialog_styles.js';
import { SettingsGamesTab } from './settings_games_tab.js';
import { SettingsKeyboardTab } from './settings_keyboard_tab.js';
import { SettingsMouseTab } from './settings_mouse_tab.js';
import { SettingsPlaceholderTab } from './settings_placeholder_tab.js';
import { SettingsUpdaterTab } from './settings_updater_tab.js';
import { SettingsViewTab } from './settings_view_tab.js';

/**
 * Toggleable modal settings menu with Games, View, Themes, Mouse, Keyboard, and Update tabs.
 */
export class SettingsDialog {
  private readonly host: HTMLElement;
  private readonly store: EditorSettingsStore;
  private readonly backdrop: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly tabBar: HTMLElement;
  private readonly contentHost: HTMLElement;
  private readonly tabButtons: Map<SettingsTabId, HTMLButtonElement>;
  private readonly gamesTab: SettingsGamesTab;
  private readonly viewTab: SettingsViewTab;
  private readonly keyboardTab: SettingsKeyboardTab;
  private readonly mouseTab: SettingsMouseTab;
  private readonly updaterTab: SettingsUpdaterTab;
  private readonly placeholderTabs: Map<SettingsTabId, SettingsPlaceholderTab>;
  private readonly unsubscribe: () => void;
  private readonly boundKeyDown: (event: KeyboardEvent) => void;
  private activeTabId: SettingsTabId;
  private isVisible: boolean;
  private isDisposed: boolean;

  /**
   * Creates the settings dialog and mounts it under the host.
   * @param host Parent element owning the modal overlay.
   * @param store Shared editor settings store.
   */
  constructor(host: HTMLElement, store: EditorSettingsStore) {
    this.host = host;
    this.store = store;
    this.isVisible = false;
    this.isDisposed = false;
    this.activeTabId = 'games';
    this.tabButtons = new Map();
    this.placeholderTabs = new Map();
    this.boundKeyDown = (event) => this.handleKeyDown(event);
    ensureSettingsDialogStyles();
    this.backdrop = document.createElement('div');
    this.panel = document.createElement('div');
    this.tabBar = document.createElement('div');
    this.contentHost = document.createElement('div');
    this.gamesTab = new SettingsGamesTab(store);
    this.viewTab = new SettingsViewTab(store);
    this.keyboardTab = new SettingsKeyboardTab(store);
    this.mouseTab = new SettingsMouseTab(store);
    this.updaterTab = new SettingsUpdaterTab();
    this.createPlaceholderTabs();
    this.buildDialog();
    this.unsubscribe = store.subscribe(() => this.handleStoreChanged());
    this.host.appendChild(this.backdrop);
    this.showTab('games');
  }

  /**
   * Shows the settings dialog.
   */
  show(): void {
    if (this.isDisposed || this.isVisible) {
      return;
    }
    this.isVisible = true;
    this.backdrop.style.display = 'flex';
    this.restartEntranceAnimation();
    this.refreshActiveTab();
    document.addEventListener('keydown', this.boundKeyDown);
  }

  /**
   * Hides the settings dialog.
   */
  hide(): void {
    if (!this.isVisible) {
      return;
    }
    this.isVisible = false;
    this.backdrop.style.display = 'none';
    document.removeEventListener('keydown', this.boundKeyDown);
  }

  /**
   * Toggles dialog visibility.
   */
  toggle(): void {
    if (this.isVisible) {
      this.hide();
      return;
    }
    this.show();
  }

  /**
   * Returns whether the dialog is open.
   * @returns True when visible.
   */
  isOpen(): boolean {
    return this.isVisible;
  }

  /**
   * Returns the active tab id.
   * @returns Active tab identifier.
   */
  getActiveTabId(): SettingsTabId {
    return this.activeTabId;
  }

  /**
   * Selects a settings tab by id.
   * @param tabId Tab to show.
   */
  showTab(tabId: SettingsTabId): void {
    this.activeTabId = tabId;
    this.tabButtons.forEach((button, id) => {
      button.setAttribute('aria-selected', id === tabId ? 'true' : 'false');
    });
    this.contentHost.replaceChildren(this.resolveTabElement(tabId));
    this.contentHost.setAttribute('aria-label', SETTINGS_TAB_LABELS[tabId]);
    if (tabId === 'update') this.updaterTab.activate();
  }

  /**
   * Returns the backdrop element for tests.
   * @returns Backdrop overlay.
   */
  getBackdropElement(): HTMLElement {
    return this.backdrop;
  }

  /**
   * Returns the panel element for tests.
   * @returns Panel card.
   */
  getPanelElement(): HTMLElement {
    return this.panel;
  }

  /**
   * Returns the content host element for tests.
   * @returns Tab panel host.
   */
  getContentElement(): HTMLElement {
    return this.contentHost;
  }

  /**
   * Removes the dialog and clears subscriptions.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.hide();
    this.isDisposed = true;
    this.unsubscribe();
    this.updaterTab.dispose();
    this.backdrop.remove();
  }

  /**
   * Creates placeholder panels for unfinished tabs.
   */
  private createPlaceholderTabs(): void {
    const placeholderIds: SettingsTabId[] = [
      'themes'
    ];
    placeholderIds.forEach((tabId) => {
      this.placeholderTabs.set(
        tabId,
        new SettingsPlaceholderTab(SETTINGS_TAB_LABELS[tabId])
      );
    });
  }

  /**
   * Builds the full dialog DOM tree.
   */
  private buildDialog(): void {
    styleSettingsBackdrop(this.backdrop);
    this.backdrop.setAttribute('role', 'dialog');
    this.backdrop.setAttribute('aria-modal', 'true');
    this.backdrop.setAttribute('aria-label', 'Settings');
    styleSettingsPanel(this.panel);
    this.panel.appendChild(this.buildHeader());
    this.panel.appendChild(this.buildTabBar());
    styleSettingsContent(this.contentHost);
    this.panel.appendChild(this.contentHost);
    this.backdrop.appendChild(this.panel);
    this.backdrop.addEventListener('pointerdown', (event) => {
      this.handleBackdropPointerDown(event);
    });
  }

  /**
   * Builds the header with title and close control.
   * @returns Header element.
   */
  private buildHeader(): HTMLElement {
    const header = document.createElement('div');
    styleSettingsHeader(header);
    const title = document.createElement('h2');
    title.textContent = 'Settings';
    styleSettingsTitle(title);
    const closeButton = document.createElement('button');
    styleSettingsCloseButton(closeButton);
    closeButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.hide();
    });
    header.appendChild(title);
    header.appendChild(closeButton);
    return header;
  }

  /**
   * Builds the tab bar buttons.
   * @returns Tab bar element.
   */
  private buildTabBar(): HTMLElement {
    styleSettingsTabBar(this.tabBar);
    SETTINGS_TAB_ORDER.forEach((tabId) => {
      const button = this.createTabButton(tabId);
      this.tabButtons.set(tabId, button);
      this.tabBar.appendChild(button);
    });
    return this.tabBar;
  }

  /**
   * Creates one tab button.
   * @param tabId Tab identifier.
   * @returns Tab button element.
   */
  private createTabButton(tabId: SettingsTabId): HTMLButtonElement {
    const button = document.createElement('button');
    styleSettingsTabButton(button);
    button.textContent = SETTINGS_TAB_LABELS[tabId];
    button.dataset.settingsTab = tabId;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', 'false');
    button.addEventListener('click', () => this.showTab(tabId));
    return button;
  }

  /**
   * Resolves the panel element for a tab id.
   * @param tabId Tab identifier.
   * @returns Panel root element.
   */
  private resolveTabElement(tabId: SettingsTabId): HTMLElement {
    if (tabId === 'games') {
      return this.gamesTab.getElement();
    }
    if (tabId === 'view') {
      return this.viewTab.getElement();
    }
    if (tabId === 'keyboard') {
      return this.keyboardTab.getElement();
    }
    if (tabId === 'mouse') {
      return this.mouseTab.getElement();
    }
    if (tabId === 'update') {
      return this.updaterTab.getElement();
    }
    return this.placeholderTabs.get(tabId)?.getElement() as HTMLElement;
  }

  /**
   * Rebuilds the visible tab after store mutations.
   */
  private handleStoreChanged(): void {
    if (!this.isVisible) {
      this.gamesTab.rebuild();
      this.viewTab.rebuild();
      this.keyboardTab.rebuild();
      this.mouseTab.rebuild();
      this.updaterTab.rebuild();
      return;
    }
    this.refreshActiveTab();
  }

  /**
   * Rebuilds and re-shows the active tab contents.
   */
  private refreshActiveTab(): void {
    this.gamesTab.rebuild();
    this.viewTab.rebuild();
    this.keyboardTab.rebuild();
    this.mouseTab.rebuild();
    this.updaterTab.rebuild();
    this.showTab(this.activeTabId);
  }

  /**
   * Closes on Escape.
   * @param event Keyboard event.
   */
  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.hide();
    }
  }

  /**
   * Closes when clicking the dimmed backdrop outside the panel.
   * @param event Pointer event.
   */
  private handleBackdropPointerDown(event: PointerEvent): void {
    if (event.target === this.backdrop) {
      this.hide();
    }
  }

  /**
   * Re-triggers entrance animations when reopening.
   */
  private restartEntranceAnimation(): void {
    this.backdrop.classList.remove('settings-dialog-backdrop');
    this.panel.classList.remove('settings-dialog-panel');
    void this.backdrop.offsetWidth;
    this.backdrop.classList.add('settings-dialog-backdrop');
    this.panel.classList.add('settings-dialog-panel');
  }
}
