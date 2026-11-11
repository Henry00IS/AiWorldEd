import type { EditorSettingsStore } from '@/settings/store/editor_settings_store.js';
import { GITHUB_RELEASES_PAGE_URL } from '@/updater/github_release_client.js';
import { StandaloneUpdateService } from '@/updater/standalone_update_service.js';
import type { UpdateCheckResult, UpdateInstallProgress } from '@/updater/update_types.js';
import { getActiveUiThemePalette } from '@/ui/theme/theme_ui_palette.js';
import {
  createSettingsButton,
  createSettingsCategory,
  createSettingsControlRow,
  createSettingsSecondaryButton,
} from './settings_form_controls.js';
import { SettingsUpdaterProgressBar } from './settings_updater_progress_bar.js';

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
  private installProgressUnsubscribe: (() => void) | null;

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
    this.installProgressUnsubscribe = null;
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
    this.installProgressStop();
  }

  /** Creates the updater panel structure. */
  private buildLayout(): void {
    const { section, body } = createSettingsCategory('Standalone Updater');
    body.appendChild(this.createAutomaticChecksRow());
    body.appendChild(this.statusLabel);
    body.appendChild(this.detailLabel);
    body.appendChild(this.actionHost);
    this.styleActionHost();
    this.root.appendChild(section);
  }

  /** Lays out the action buttons and the progress bar in one even row. */
  private styleActionHost(): void {
    this.actionHost.style.display = 'flex';
    this.actionHost.style.alignItems = 'center';
    this.actionHost.style.flexWrap = 'wrap';
    this.actionHost.style.gap = '8px';
    this.actionHost.style.minHeight = '28px';
  }

  /** Creates the persisted automatic-check preference row. */
  private createAutomaticChecksRow(): HTMLElement {
    this.automaticChecksToggle.type = 'checkbox';
    this.automaticChecksToggle.dataset['settingsField'] = 'auto-updater';
    this.automaticChecksToggle.setAttribute('role', 'switch');
    this.automaticChecksToggle.setAttribute('aria-label', 'Auto Updater');
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
    return createSettingsControlRow('Auto Updater', control);
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
    this.actionHost.replaceChildren(createSettingsButton('Check for Updates', () => void this.checkForUpdates()));
  }

  /**
   * Creates actions appropriate for a completed result.
   *
   * @param result Completed updater result.
   * @returns Action controls for the result.
   */
  private createResultActions(result: UpdateCheckResult): HTMLElement[] {
    if (result.status === 'error') return [createSettingsButton('Retry', () => void this.checkForUpdates())];
    const actions: HTMLElement[] = [createSettingsSecondaryButton('Check Again', () => void this.checkForUpdates())];
    if (result.status === 'update-available') actions.unshift(this.createInstallButton());
    return actions;
  }

  /** Creates the explicit install action for a compatible release. */
  private createInstallButton(): HTMLButtonElement {
    return createSettingsButton('Install Update and Restart', () => void this.installUpdate());
  }

  /** Installs the checked release through the standalone host bridge. */
  private async installUpdate(): Promise<void> {
    if (!this.lastResult) return;
    const requestSequence = ++this.requestSequence;
    const progressBar = this.installProgressStart();
    try {
      await this.service.installUpdate(this.lastResult);
      if (requestSequence === this.requestSequence) this.detailLabel.textContent = 'Update installed. Restarting…';
    } catch (error) {
      if (requestSequence !== this.requestSequence) return;
      this.detailLabel.textContent = error instanceof Error ? error.message : 'The update could not be installed.';
      this.renderInstallFailureActions();
    } finally {
      this.installProgressStop();
      progressBar.getElement().remove();
    }
  }

  /**
   * Shows the install progress text and bar and follows the host's reports.
   *
   * @returns Progress bar placed in the action area.
   */
  private installProgressStart(): SettingsUpdaterProgressBar {
    const progressBar = new SettingsUpdaterProgressBar();
    this.detailLabel.textContent = 'Downloading update…';
    this.actionHost.replaceChildren(progressBar.getElement());
    this.installProgressStop();
    this.installProgressUnsubscribe = this.service.onInstallProgress((progress) =>
      this.installProgressShow(progress, progressBar),
    );
    return progressBar;
  }

  /**
   * Shows one install progress report.
   *
   * @param progress Report from the host.
   * @param progressBar Bar to update.
   */
  private installProgressShow(progress: UpdateInstallProgress, progressBar: SettingsUpdaterProgressBar): void {
    if (this.isDisposed || progress.phase === 'failed') return;
    this.detailLabel.textContent = progress.message;
    if (progress.percent !== undefined) progressBar.percentSet(progress.percent);
  }

  /** Stops following install progress. */
  private installProgressStop(): void {
    this.installProgressUnsubscribe?.();
    this.installProgressUnsubscribe = null;
  }

  /**
   * Offers Retry for the install, a fresh check, and the releases page for
   * installing by hand, after a failure.
   */
  private renderInstallFailureActions(): void {
    const retryButton = createSettingsButton('Retry', () => void this.installUpdate());
    const checkAgainButton = createSettingsSecondaryButton('Check Again', () => void this.checkForUpdates());
    this.actionHost.replaceChildren(retryButton, checkAgainButton, this.createReleasePageLink());
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
    link.textContent = 'Open Standalone Releases';
    link.style.color = getActiveUiThemePalette().rangeAccentColor;
    link.style.fontSize = '12px';
    return link;
  }

  /** Reads the service version through its check result contract. */
  private serviceVersion(): string {
    return this.service.getCurrentVersion();
  }
}
