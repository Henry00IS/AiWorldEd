import type { EditorSettingsStore } from '@/settings/store/editor_settings_store.js';
import { GITHUB_RELEASES_PAGE_URL } from '@/updater/github_release_client.js';
import { StandaloneUpdateService } from '@/updater/standalone_update_service.js';
import type { UpdateCheckResult } from '@/updater/update_types.js';
import { getActiveUiThemePalette } from '@/ui/theme/theme_ui_palette.js';
import {
  createSettingsButton,
  createSettingsCategory,
  createSettingsControlRow,
  createSettingsSecondaryButton,
} from './settings_form_controls.js';

/** Settings tab that checks and installs standalone executable releases. */
export class SettingsUpdaterTab {
  private readonly root: HTMLElement;
  private readonly service: StandaloneUpdateService;
  private readonly statusLabel: HTMLElement;
  private readonly detailLabel: HTMLElement;
  private readonly actionHost: HTMLElement;
  private readonly automaticChecksToggle: HTMLInputElement;
  private readonly automaticChecksState: HTMLElement;
  private readonly store: EditorSettingsStore;
  private lastResult: UpdateCheckResult | null;
  private isChecking: boolean;
  private isDisposed: boolean;
  private requestSequence: number;

  /**
   * Creates the updater tab.
   *
   * @param store Shared settings store for the automatic-check preference.
   * @param service Release service used to check and install updates.
   */
  constructor(store: EditorSettingsStore, service = new StandaloneUpdateService()) {
    this.store = store;
    this.service = service;
    this.root = document.createElement('div');
    this.root.style.display = 'flex';
    this.root.style.flexDirection = 'column';
    this.statusLabel = document.createElement('div');
    this.detailLabel = document.createElement('div');
    this.actionHost = document.createElement('div');
    this.automaticChecksToggle = document.createElement('input');
    this.automaticChecksState = document.createElement('span');
    this.lastResult = null;
    this.isChecking = false;
    this.isDisposed = false;
    this.requestSequence = 0;
    this.buildLayout();
    this.rebuild();
  }

  /**
   * Returns the updater tab root.
   *
   * @returns Root panel element.
   */
  getElement(): HTMLElement {
    return this.root;
  }

  /** Rebuilds static content without starting another network request. */
  rebuild(): void {
    this.refreshAutomaticChecksToggle();
    this.statusLabel.textContent = `${this.versionStatusLabel()}: ${this.serviceVersion()}`;
    if (!this.service.isStandaloneBuild()) {
      this.renderBrowserMessage();
      return;
    }
    this.renderResult();
  }

  /**
   * Chooses the version label for browser builds versus installed desktops.
   *
   * @returns Status label text before the version number.
   */
  private versionStatusLabel(): string {
    return this.service.isStandaloneBuild() ? 'Installed version' : 'Version';
  }

  /** Starts an automatic check when the Update tab becomes visible. */
  activate(): void {
    if (!this.shouldCheckAutomatically() || this.lastResult || this.isChecking) return;
    void this.checkForUpdates();
  }

  /** Cancels UI updates from a request that completes after disposal. */
  dispose(): void {
    this.isDisposed = true;
    this.requestSequence += 1;
  }

  /** Creates the updater panel structure. */
  private buildLayout(): void {
    const { section, body } = createSettingsCategory('Standalone updater');
    body.appendChild(this.createAutomaticChecksRow());
    body.appendChild(this.statusLabel);
    body.appendChild(this.detailLabel);
    body.appendChild(this.actionHost);
    this.root.appendChild(section);
  }

  /** Creates the persisted automatic-check preference row. */
  private createAutomaticChecksRow(): HTMLElement {
    this.automaticChecksToggle.type = 'checkbox';
    this.automaticChecksToggle.dataset['settingsField'] = 'auto-updater';
    this.automaticChecksToggle.setAttribute('role', 'switch');
    this.automaticChecksToggle.setAttribute('aria-label', 'Auto updater');
    this.automaticChecksToggle.addEventListener('change', () => {
      this.store.setAutomaticUpdateChecksEnabled(this.automaticChecksToggle.checked);
      this.refreshAutomaticChecksToggle();
    });
    this.automaticChecksState.style.fontSize = '12px';
    this.automaticChecksState.style.color = getActiveUiThemePalette().dialogSummaryTextColor;
    const control = document.createElement('div');
    control.style.display = 'flex';
    control.style.alignItems = 'center';
    control.style.gap = '6px';
    control.appendChild(this.automaticChecksToggle);
    control.appendChild(this.automaticChecksState);
    return createSettingsControlRow('Auto updater', control);
  }

  /** Refreshes the checkbox and its visible On or Off state. */
  private refreshAutomaticChecksToggle(): void {
    const enabled = this.store.getUpdateSettings().automaticChecks;
    this.automaticChecksToggle.checked = enabled;
    this.automaticChecksToggle.setAttribute('aria-checked', String(enabled));
    this.automaticChecksToggle.disabled = !this.service.isStandaloneBuild();
    this.automaticChecksState.textContent = enabled ? 'On' : 'Off';
  }

  /** Returns whether the host and user preference allow an automatic check. */
  private shouldCheckAutomatically(): boolean {
    return this.service.isStandaloneBuild() && this.store.getUpdateSettings().automaticChecks;
  }

  /** Performs one guarded asynchronous release check. */
  private async checkForUpdates(): Promise<void> {
    const requestSequence = ++this.requestSequence;
    this.isChecking = true;
    this.renderChecking();
    const result = await this.service.checkForUpdates();
    if (this.isDisposed || requestSequence !== this.requestSequence) return;
    this.lastResult = result;
    this.isChecking = false;
    this.renderResult();
  }

  /** Renders the state shown by a normal browser build. */
  private renderBrowserMessage(): void {
    this.detailLabel.textContent = 'Automatic installation is available only in standalone executable builds.';
    this.actionHost.replaceChildren(this.createReleasePageLink());
  }

  /** Renders the in-progress check state. */
  private renderChecking(): void {
    this.detailLabel.textContent = 'Checking the release channel…';
    this.actionHost.replaceChildren();
  }

  /** Renders the latest check result and its available actions. */
  private renderResult(): void {
    if (this.isChecking) return;
    if (!this.lastResult) {
      this.renderReadyState();
      return;
    }
    this.detailLabel.textContent = this.describeResult(this.lastResult);
    this.actionHost.replaceChildren(...this.createResultActions(this.lastResult));
  }

  /** Renders the initial standalone state. */
  private renderReadyState(): void {
    this.detailLabel.textContent = 'Checks the configured release channel for a newer executable.';
    this.actionHost.replaceChildren(createSettingsButton('Check for updates', () => void this.checkForUpdates()));
  }

  /**
   * Creates actions appropriate for a completed result.
   *
   * @param result Completed updater result.
   * @returns Action controls for the result.
   */
  private createResultActions(result: UpdateCheckResult): HTMLElement[] {
    const actions: HTMLElement[] = [createSettingsSecondaryButton('Check again', () => void this.checkForUpdates())];
    if (result.status === 'update-available') actions.unshift(this.createInstallButton());
    return actions;
  }

  /** Creates the explicit install action for a compatible release. */
  private createInstallButton(): HTMLButtonElement {
    return createSettingsButton('Install update and restart', () => void this.installUpdate());
  }

  /** Installs the checked release through the standalone host bridge. */
  private async installUpdate(): Promise<void> {
    if (!this.lastResult) return;
    this.detailLabel.textContent = 'Downloading and installing update…';
    this.actionHost.replaceChildren();
    try {
      await this.service.installUpdate(this.lastResult);
      this.detailLabel.textContent = 'Update installed. Restarting…';
    } catch (error) {
      this.detailLabel.textContent = error instanceof Error ? error.message : 'The update could not be installed.';
      this.renderResultActionsAfterInstallFailure();
    }
  }

  /** Restores retry controls when installation fails. */
  private renderResultActionsAfterInstallFailure(): void {
    if (this.lastResult) this.actionHost.replaceChildren(...this.createResultActions(this.lastResult));
  }

  /**
   * Converts a result status into concise UI text.
   *
   * @param result Updater result to describe.
   * @returns Concise status text.
   */
  private describeResult(result: UpdateCheckResult): string {
    if (result.status === 'update-available') return `Version ${result.latestRelease?.version} is ready to install.`;
    return result.message ?? this.describeKnownStatus(result);
  }

  /**
   * Describes statuses that do not carry a server message.
   *
   * @param result Updater result to describe.
   * @returns Known status text.
   */
  private describeKnownStatus(result: UpdateCheckResult): string {
    if (result.status === 'up-to-date') return 'You are using the latest compatible release.';
    if (result.status === 'no-release') return 'No published releases are available yet.';
    if (result.status === 'no-compatible-asset') return 'The latest release has no compatible executable.';
    return 'The release check failed.';
  }

  /** Creates a link to the public release page for browser users. */
  private createReleasePageLink(): HTMLAnchorElement {
    const link = document.createElement('a');
    link.href = GITHUB_RELEASES_PAGE_URL;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Open standalone releases';
    link.style.color = getActiveUiThemePalette().rangeAccentColor;
    link.style.fontSize = '12px';
    return link;
  }

  /** Reads the service version through its check result contract. */
  private serviceVersion(): string {
    return this.service.getCurrentVersion();
  }
}
