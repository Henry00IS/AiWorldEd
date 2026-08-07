import { APPLICATION_DISPLAY_NAME, APPLICATION_VERSION } from '@/application_identity.js';
import { GITHUB_RELEASES_PAGE_URL, GitHubReleaseClient } from './github_release_client.js';
import {
  detectStandalonePlatform,
  getStandaloneUpdaterBridge,
  type StandaloneUpdaterBridge,
} from './bridge_standalone_updater.js';
import { selectStandaloneUpdateAsset } from './update_asset_selector.js';
import { isNewerUpdateVersion } from './update_version.js';
import type {
  GitHubRelease,
  GitHubReleaseAsset,
  StandaloneHostUpdateCheck,
  StandalonePlatform,
  StandaloneUpdateRelease,
  UpdateCheckResult,
} from './update_types.js';

export { APPLICATION_VERSION };

/**
 * Optional construction overrides for client, updater bridge, platform, and
 * version.
 */
export interface StandaloneUpdateServiceOptions {
  client?: Pick<GitHubReleaseClient, 'fetchLatestRelease'>;
  bridge?: StandaloneUpdaterBridge | null;
  platform?: StandalonePlatform;
  currentVersion?: string;
}

/** Coordinates release checks and installation through the standalone host. */
export class StandaloneUpdateService {
  private readonly client: Pick<GitHubReleaseClient, 'fetchLatestRelease'>;
  private readonly bridge: StandaloneUpdaterBridge | null;
  private readonly platform: StandalonePlatform;
  private readonly currentVersion: string;

  /**
   * Creates a standalone update service with optional overrides.
   *
   * @param options Optional client, updater bridge, platform, and
   *   currentVersion values.
   */
  constructor(options: StandaloneUpdateServiceOptions = {}) {
    this.client = options.client ?? new GitHubReleaseClient();
    this.bridge = options.bridge === undefined ? getStandaloneUpdaterBridge() : options.bridge;
    this.platform = options.platform ?? this.bridge?.platform ?? detectStandalonePlatform();
    this.currentVersion = options.currentVersion ?? APPLICATION_VERSION;
  }

  /**
   * Returns whether the standalone shell can install an update.
   *
   * @returns True when a replace-and-restart host bridge exists.
   */
  isStandaloneBuild(): boolean {
    return this.bridge !== null;
  }

  /**
   * Returns the version embedded in the running application.
   *
   * @returns Installed application version.
   */
  getCurrentVersion(): string {
    return this.currentVersion;
  }

  /**
   * Checks GitHub for a newer compatible executable release.
   *
   * @returns Update status for the current build.
   */
  async checkForUpdates(): Promise<UpdateCheckResult> {
    if (!this.bridge) return this.createResult('unsupported');
    if (this.bridge.kind === 'electrobun') return this.checkElectrobunUpdates();
    try {
      const release = await this.client.fetchLatestRelease();
      return this.createReleaseResult(release);
    } catch (error) {
      return this.createErrorResult(error);
    }
  }

  /**
   * Installs an available update through the host bridge when one is present.
   *
   * @param result Update check result that must have status update-available
   *   and a latestRelease.
   * @throws Error when no bridge is set or the result is not installable.
   */
  async installUpdate(result: UpdateCheckResult): Promise<void> {
    const release = result.latestRelease;
    if (!this.bridge || result.status !== 'update-available' || !release) {
      throw new Error('No installable update is available.');
    }
    await this.bridge.installUpdate({
      version: release.version,
      downloadUrl: release.asset.downloadUrl,
      fileName: release.asset.name,
      releasePageUrl: release.releasePageUrl,
    });
  }

  /**
   * Builds the result for a valid or empty GitHub release response.
   *
   * @param release Normalized GitHub release or null when none is published.
   * @returns Update status derived from the release.
   */
  private createReleaseResult(release: GitHubRelease | null): UpdateCheckResult {
    if (!release) return this.createResult('no-release', 'No published releases are available yet.');
    const asset = selectStandaloneUpdateAsset(release.assets, this.platform);
    if (!asset) return this.createResult('no-compatible-asset', 'The latest release has no compatible executable.');
    const latestRelease = this.createUpdateRelease(release, asset);
    const status = isNewerUpdateVersion(this.currentVersion, latestRelease.version) ? 'update-available' : 'up-to-date';
    return { status, currentVersion: this.currentVersion, latestRelease };
  }

  /**
   * Checks for updates through the Electrobun host bridge when available.
   *
   * @returns Update status from the host check, or an error status when
   *   unavailable.
   */
  private async checkElectrobunUpdates(): Promise<UpdateCheckResult> {
    if (!this.bridge?.checkForUpdate) {
      return this.createResult('error', 'Electrobun updater unavailable.');
    }
    try {
      const result = await this.bridge.checkForUpdate();
      return this.createElectrobunResult(result);
    } catch (error) {
      return this.createErrorResult(error);
    }
  }

  /**
   * Builds an UpdateCheckResult from a host update check payload.
   *
   * @param result Host update check payload with availability, versions, and
   *   optional error.
   * @returns Update status result derived from the host payload.
   */
  private createElectrobunResult(result: StandaloneHostUpdateCheck): UpdateCheckResult {
    if (result.error) return this.createResult('error', result.error);
    if (!result.updateAvailable) {
      return { status: 'up-to-date', currentVersion: result.currentVersion };
    }
    return {
      status: 'update-available',
      currentVersion: result.currentVersion,
      latestRelease: this.createElectrobunRelease(result),
    };
  }

  /**
   * Builds a StandaloneUpdateRelease from a host update check payload.
   *
   * @param result Host update check payload that supplies the latest version.
   * @returns Release data built from the host payload fields.
   */
  private createElectrobunRelease(result: StandaloneHostUpdateCheck): StandaloneUpdateRelease {
    return {
      version: result.latestVersion,
      title: `${APPLICATION_DISPLAY_NAME} ${result.latestVersion}`,
      releasePageUrl: GITHUB_RELEASES_PAGE_URL,
      notes: 'Electrobun will download and install the update bundle.',
      asset: { name: 'Electrobun update bundle', downloadUrl: '', size: 0 },
    };
  }

  /**
   * Builds a StandaloneUpdateRelease from a GitHub release and asset.
   *
   * @param release Normalized GitHub release providing version, title, page
   *   URL, and notes.
   * @param asset Executable asset providing name, download URL, and size.
   * @returns StandaloneUpdateRelease mapped from the release and asset fields.
   */
  private createUpdateRelease(release: GitHubRelease, asset: GitHubReleaseAsset): StandaloneUpdateRelease {
    return {
      version: release.tagName,
      title: release.title,
      releasePageUrl: release.releasePageUrl,
      notes: release.notes,
      asset: { name: asset.name, downloadUrl: asset.browserDownloadUrl, size: asset.size },
    };
  }

  /**
   * Creates a status result that includes the installed version.
   *
   * @param status Update check status value to place on the result.
   * @param message Optional detail message to place on the result.
   * @returns Status result with currentVersion and optional message.
   */
  private createResult(status: UpdateCheckResult['status'], message?: string): UpdateCheckResult {
    const result: UpdateCheckResult = { status, currentVersion: this.currentVersion };
    if (message !== undefined) result.message = message;
    return result;
  }

  /**
   * Converts an unknown failure into an error status result.
   *
   * @param error Unknown failure value; uses its message when it is an Error.
   * @returns Error status result with a message.
   */
  private createErrorResult(error: unknown): UpdateCheckResult {
    const message = error instanceof Error ? error.message : 'The release check failed.';
    return this.createResult('error', message);
  }
}
