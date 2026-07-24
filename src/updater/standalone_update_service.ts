import packageMetadata from '../../package.json';
import { GitHubReleaseClient } from './github_release_client.js';
import {
  detectStandalonePlatform,
  getStandaloneUpdaterBridge,
  type StandaloneUpdaterBridge
} from './standalone_updater_bridge.js';
import { selectStandaloneUpdateAsset } from './update_asset_selector.js';
import { isNewerUpdateVersion } from './update_version.js';
import type {
  GitHubRelease,
  GitHubReleaseAsset,
  StandalonePlatform,
  StandaloneUpdateRelease,
  UpdateCheckResult
} from './update_types.js';

/** Version embedded in the current Vite application build. */
export const APPLICATION_VERSION = packageMetadata.version;

/** Dependencies and environment values used by the update service. */
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
   * Creates an updater for the current app environment.
   * @param options Optional API client, host bridge, platform, and version.
   */
  constructor(options: StandaloneUpdateServiceOptions = {}) {
    this.client = options.client ?? new GitHubReleaseClient();
    this.bridge = options.bridge === undefined ? getStandaloneUpdaterBridge() : options.bridge;
    this.platform = options.platform ?? this.bridge?.platform ?? detectStandalonePlatform();
    this.currentVersion = options.currentVersion ?? APPLICATION_VERSION;
  }

  /**
   * Returns whether the standalone shell can install an update.
   * @returns True when a replace-and-restart host bridge exists.
   */
  isStandaloneBuild(): boolean {
    return this.bridge !== null;
  }

  /**
   * Returns the version embedded in the running application.
   * @returns Installed application version.
   */
  getCurrentVersion(): string {
    return this.currentVersion;
  }

  /**
   * Checks GitHub for a newer compatible executable release.
   * @returns Update status for the current build.
   */
  async checkForUpdates(): Promise<UpdateCheckResult> {
    if (!this.bridge) return this.createResult('unsupported');
    try {
      const release = await this.client.fetchLatestRelease();
      return this.createReleaseResult(release);
    } catch (error) {
      return this.createErrorResult(error);
    }
  }

  /**
   * Installs a checked update through the standalone shell.
   * @param result Successful update result returned by checkForUpdates.
   * @throws Error when the result cannot be installed.
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
      releasePageUrl: release.releasePageUrl
    });
  }

  /**
   * Builds the result for a valid or empty GitHub release response.
   * @param release Normalized GitHub release or null when none is published.
   * @returns Update status derived from the release.
   */
  private createReleaseResult(release: GitHubRelease | null): UpdateCheckResult {
    if (!release) return this.createResult('no-release', 'No published releases are available yet.');
    const asset = selectStandaloneUpdateAsset(release.assets, this.platform);
    if (!asset) return this.createResult('no-compatible-asset', 'The latest release has no compatible executable.');
    const latestRelease = this.createUpdateRelease(release, asset);
    const status = isNewerUpdateVersion(this.currentVersion, latestRelease.version)
      ? 'update-available'
      : 'up-to-date';
    return { status, currentVersion: this.currentVersion, latestRelease };
  }

  /**
   * Creates the release data used by the UI and host bridge.
   * @param release Normalized GitHub release.
   * @param asset Selected executable asset.
   * @returns Release data safe for UI and host use.
   */
  private createUpdateRelease(
    release: GitHubRelease,
    asset: GitHubReleaseAsset
  ): StandaloneUpdateRelease {
    return {
      version: release.tagName,
      title: release.title,
      releasePageUrl: release.releasePageUrl,
      notes: release.notes,
      asset: { name: asset.name, downloadUrl: asset.browserDownloadUrl, size: asset.size }
    };
  }

  /**
   * Creates a status result with the installed version.
   * @param status Status to expose to the UI.
   * @param message Optional user-facing detail.
   * @returns Status result.
   */
  private createResult(status: UpdateCheckResult['status'], message?: string): UpdateCheckResult {
    return { status, currentVersion: this.currentVersion, message };
  }

  /**
   * Converts an unknown request failure into a user-facing status.
   * @param error Unknown failure returned by the release client.
   * @returns Error status result.
   */
  private createErrorResult(error: unknown): UpdateCheckResult {
    const message = error instanceof Error ? error.message : 'The release check failed.';
    return this.createResult('error', message);
  }
}
