import { Theme } from '../../theme.js';
import {
  GITHUB_RELEASES_PAGE_URL
} from '../../updater/github_release_client.js';
import { StandaloneUpdateService } from '../../updater/standalone_update_service.js';
import type { UpdateCheckResult } from '../../updater/update_types.js';
import { hexToRgb } from '../../utils/color_utils.js';
import {
  createSettingsButton,
  createSettingsCategory,
  createSettingsSecondaryButton
} from './settings_form_controls.js';

/** Settings tab that checks and installs standalone executable releases. */
export class SettingsUpdaterTab {
  private readonly root: HTMLElement;
  private readonly service: StandaloneUpdateService;
  private readonly statusLabel: HTMLElement;
  private readonly detailLabel: HTMLElement;
  private readonly actionHost: HTMLElement;
  private lastResult: UpdateCheckResult | null;
  private isChecking: boolean;
  private isDisposed: boolean;
  private requestSequence: number;

  /**
   * Creates the updater tab.
   * @param service Release service used to check and install updates.
   */
  constructor(service = new StandaloneUpdateService()) {
    this.service = service;
    this.root = document.createElement('div');
    this.root.style.display = 'flex';
    this.root.style.flexDirection = 'column';
    this.statusLabel = document.createElement('div');
    this.detailLabel = document.createElement('div');
    this.actionHost = document.createElement('div');
    this.lastResult = null;
    this.isChecking = false;
    this.isDisposed = false;
    this.requestSequence = 0;
    this.buildLayout();
    this.rebuild();
  }

  /**
   * Returns the updater tab root.
   * @returns Root panel element.
   */
  getElement(): HTMLElement {
    return this.root;
  }

  /** Rebuilds static content without starting another network request. */
  rebuild(): void {
    this.statusLabel.textContent = `Installed version: ${this.serviceVersion()}`;
    if (!this.service.isStandaloneBuild()) {
      this.renderBrowserMessage();
      return;
    }
    this.renderResult();
  }

  /** Starts an automatic check when the Update tab becomes visible. */
  activate(): void {
    if (!this.service.isStandaloneBuild() || this.lastResult || this.isChecking) return;
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
    body.appendChild(this.statusLabel);
    body.appendChild(this.detailLabel);
    body.appendChild(this.actionHost);
    this.root.appendChild(section);
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
    this.detailLabel.textContent = 'Checking GitHub Releases…';
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
    this.detailLabel.textContent = 'Checks the AiWorldEd GitHub Releases page for a newer executable.';
    this.actionHost.replaceChildren(
      createSettingsButton('Check for updates', () => void this.checkForUpdates())
    );
  }

  /**
   * Creates actions appropriate for a completed result.
   * @param result Completed updater result.
   * @returns Action controls for the result.
   */
  private createResultActions(result: UpdateCheckResult): HTMLElement[] {
    const actions: HTMLElement[] = [
      createSettingsSecondaryButton('Check again', () => void this.checkForUpdates())
    ];
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
   * @param result Updater result to describe.
   * @returns Concise status text.
   */
  private describeResult(result: UpdateCheckResult): string {
    if (result.status === 'update-available') return `Version ${result.latestRelease?.version} is ready to install.`;
    return result.message ?? this.describeKnownStatus(result);
  }

  /**
   * Describes statuses that do not carry a server message.
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
    link.style.color = hexToRgb(Theme.selectionColor);
    link.style.fontSize = '12px';
    return link;
  }

  /** Reads the service version through its check result contract. */
  private serviceVersion(): string {
    return this.service.getCurrentVersion();
  }
}
