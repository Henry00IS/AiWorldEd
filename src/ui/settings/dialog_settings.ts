import type { EditorSettingsStore } from '@/settings/store/editor_settings_store.js';
import { SETTINGS_TAB_LABELS, SETTINGS_TAB_ORDER, type SettingsTabId } from '@/settings/store/settings_types.js';
import { showMessageBox } from '@/ui/dialog/dialog_message_box.js';
import { PanelFloating } from '@/ui/floating_panel/panel_floating.js';
import {
  ensureSettingsDialogStyles,
  styleSettingsCloseButton,
  styleSettingsContent,
  styleSettingsHeader,
  styleSettingsPanel,
  styleSettingsResetButton,
  styleSettingsTabBar,
  styleSettingsTabButton,
  styleSettingsTitle,
} from './dialog_settings_styles.js';
import { SettingsGamesTab } from './settings_games_tab.js';
import { SettingsKeyboardTab } from './settings_keyboard_tab.js';
import { SettingsMouseTab } from './settings_mouse_tab.js';
import { SettingsUpdaterTab } from './settings_updater_tab.js';
import { SettingsViewTab } from './settings_view_tab.js';

/** Optional hooks for settings dialog actions that need the host app. */
export interface SettingsDialogOptions {
  /**
   * Invoked after the user confirms Reset. Should clear storage and restore the
   * editor to factory defaults (typically a full page reload).
   */
  onResetAllSettings?: () => void | Promise<void>;
}

/**
 * Modal settings window with Games, View, Mouse, Keyboard, and Update tabs.
 * Windowing comes from {@link PanelFloating}.
 */
export class DialogSettings extends PanelFloating {
  private readonly tabBar: HTMLElement;
  private readonly contentHost: HTMLElement;
  private readonly tabButtons: Map<SettingsTabId, HTMLButtonElement>;
  private readonly gamesTab: SettingsGamesTab;
  private readonly viewTab: SettingsViewTab;
  private readonly keyboardTab: SettingsKeyboardTab;
  private readonly mouseTab: SettingsMouseTab;
  private readonly updaterTab: SettingsUpdaterTab;
  private readonly onResetAllSettings: (() => void | Promise<void>) | null;
  private readonly unsubscribe: () => void;
  private activeTabId: SettingsTabId;
  private isDisposed: boolean;
  private isResetInProgress: boolean;

  /**
   * Creates the settings dialog under the host.
   *
   * @param host Parent element owning the modal overlay.
   * @param store Shared editor settings store.
   * @param options Optional host hooks (reset).
   */
  constructor(host: HTMLElement, store: EditorSettingsStore, options: SettingsDialogOptions = {}) {
    super(host, {
      corner: 'top-left',
      modal: true,
      centered: true,
      draggable: false,
      closeOnEscape: true,
      closeOnBackdropClick: true,
      stackLayer: 'modal',
      backdropClassName: 'settings-dialog-backdrop',
    });
    this.isDisposed = false;
    this.isResetInProgress = false;
    this.activeTabId = 'games';
    this.tabButtons = new Map();
    this.onResetAllSettings = options.onResetAllSettings ?? null;
    ensureSettingsDialogStyles();
    this.tabBar = document.createElement('div');
    this.contentHost = document.createElement('div');
    this.gamesTab = new SettingsGamesTab(store);
    this.viewTab = new SettingsViewTab(store);
    this.keyboardTab = new SettingsKeyboardTab(store);
    this.mouseTab = new SettingsMouseTab(store);
    this.updaterTab = new SettingsUpdaterTab(store);
    this.buildDialog();
    this.unsubscribe = store.subscribe(() => this.handleStoreChanged());
    this.showTab('games');
  }

  /**
   * Returns the modal backdrop element.
   *
   * @returns Backdrop overlay.
   */
  override getBackdropElement(): HTMLElement {
    const backdrop = super.getBackdropElement();
    if (!backdrop) {
      throw new Error('Settings dialog requires a modal backdrop');
    }
    return backdrop;
  }

  /**
   * Returns the active tab id.
   *
   * @returns Active tab identifier.
   */
  getActiveTabId(): SettingsTabId {
    return this.activeTabId;
  }

  /**
   * Selects a settings tab by id.
   *
   * @param tabId Tab to show.
   */
  showTab(tabId: SettingsTabId): void {
    this.activeTabId = tabId;
    this.tabButtons.forEach((button, id) => {
      button.setAttribute('aria-selected', id === tabId ? 'true' : 'false');
    });
    this.contentHost.replaceChildren(this.resolveTabElement(tabId));
    this.contentHost.setAttribute('aria-label', SETTINGS_TAB_LABELS[tabId]);
    if (tabId === 'update') {
      this.updaterTab.activate();
    }
  }

  /**
   * Returns the panel card element for tests.
   *
   * @returns Panel card.
   */
  getPanelElement(): HTMLElement {
    return this.root;
  }

  /**
   * Returns the content host element for tests.
   *
   * @returns Tab panel host.
   */
  getContentElement(): HTMLElement {
    return this.contentHost;
  }

  /** Removes the dialog and clears subscriptions. */
  override dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    this.unsubscribe();
    this.updaterTab.dispose();
    super.dispose();
  }

  /** Refreshes tabs and entrance animation when opened. */
  protected override onAfterShow(): void {
    this.refreshActiveTab();
    this.restartEntranceAnimation();
  }

  /** Builds the full dialog DOM tree into the floating shell. */
  private buildDialog(): void {
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', 'Settings');
    styleSettingsPanel(this.root);
    this.root.style.display = 'none';
    this.root.appendChild(this.buildHeader());
    this.root.appendChild(this.buildTabBar());
    styleSettingsContent(this.contentHost);
    this.root.appendChild(this.contentHost);
  }

  /**
   * Builds the header with title and close control.
   *
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
   * Builds the tab bar buttons with a Reset control on the right.
   *
   * @returns Tab bar element.
   */
  private buildTabBar(): HTMLElement {
    styleSettingsTabBar(this.tabBar);
    SETTINGS_TAB_ORDER.forEach((tabId) => {
      const button = this.createTabButton(tabId);
      this.tabButtons.set(tabId, button);
      this.tabBar.appendChild(button);
    });
    this.tabBar.appendChild(this.createResetButton());
    return this.tabBar;
  }

  /**
   * Creates the Factory Reset button that clears all editor storage after
   * confirm.
   *
   * @returns Reset button element.
   */
  private createResetButton(): HTMLButtonElement {
    const button = document.createElement('button');
    styleSettingsResetButton(button);
    button.textContent = 'Factory Reset';
    button.title = 'Reset all settings to defaults';
    button.dataset['settingsAction'] = 'reset-all-settings';
    button.addEventListener('click', () => {
      void this.onResetClicked();
    });
    return button;
  }

  /** Confirms and runs a full settings reset via the host callback. */
  private async onResetClicked(): Promise<void> {
    if (this.isDisposed || this.isResetInProgress) {
      return;
    }
    if (!this.onResetAllSettings) {
      return;
    }
    this.isResetInProgress = true;
    try {
      const confirmed = await this.confirmResetAllSettings();
      if (!confirmed || this.isDisposed) {
        return;
      }
      await this.onResetAllSettings();
    } finally {
      this.isResetInProgress = false;
    }
  }

  /**
   * Shows the reset confirmation message box.
   *
   * @returns True when the user confirmed.
   */
  private async confirmResetAllSettings(): Promise<boolean> {
    return showMessageBox({
      host: this.host,
      title: 'Reset All Settings',
      message:
        'Are you sure you want to reset all settings to their defaults?\n\nThis permanently clears every saved preference: view options, keyboard/mouse, workspaces and viewport layouts, game profiles, coordinate presets, and related data. Nothing is kept. The editor will reload with factory defaults.',
      boldMessage: 'Any unsaved changes will be permanently lost.',
      confirmLabel: 'Yes',
      cancelLabel: 'No',
    });
  }

  /**
   * Creates one tab button.
   *
   * @param tabId Tab identifier.
   * @returns Tab button element.
   */
  private createTabButton(tabId: SettingsTabId): HTMLButtonElement {
    const button = document.createElement('button');
    styleSettingsTabButton(button);
    button.textContent = SETTINGS_TAB_LABELS[tabId];
    button.dataset['settingsTab'] = tabId;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', 'false');
    button.addEventListener('click', () => this.showTab(tabId));
    return button;
  }

  /**
   * Resolves the panel element for a tab id.
   *
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
    return this.gamesTab.getElement();
  }

  /** Rebuilds the visible tab after store mutations. */
  private handleStoreChanged(): void {
    if (!this.isOpen()) {
      this.rebuildAllTabs();
      return;
    }
    this.refreshActiveTab();
  }

  /** Rebuilds every tab without re-selecting content. */
  private rebuildAllTabs(): void {
    this.gamesTab.rebuild();
    this.viewTab.rebuild();
    this.keyboardTab.rebuild();
    this.mouseTab.rebuild();
    this.updaterTab.rebuild();
  }

  /** Rebuilds and re-shows the active tab contents. */
  private refreshActiveTab(): void {
    this.rebuildAllTabs();
    this.showTab(this.activeTabId);
  }

  /** Re-triggers entrance animations when reopening. */
  private restartEntranceAnimation(): void {
    const backdrop = this.getBackdropElement();
    if (backdrop) {
      backdrop.classList.remove('settings-dialog-backdrop');
      void backdrop.offsetWidth;
      backdrop.classList.add('settings-dialog-backdrop');
    }
    this.root.classList.remove('settings-dialog-panel');
    void this.root.offsetWidth;
    this.root.classList.add('settings-dialog-panel');
  }
}
