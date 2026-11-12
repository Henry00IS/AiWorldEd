/** Supported operating-system targets for standalone releases. */
export type StandalonePlatform = 'windows' | 'macos' | 'linux';

/** Release asset metadata returned by GitHub. */
export interface GitHubReleaseAsset {
  name: string;
  browserDownloadUrl: string;
  size: number;
}

/** Minimal release metadata needed by the updater. */
export interface GitHubRelease {
  tagName: string;
  title: string;
  releasePageUrl: string;
  notes: string;
  assets: GitHubReleaseAsset[];
}

/** Executable asset selected for the current standalone platform. */
export interface StandaloneUpdateAsset {
  name: string;
  downloadUrl: string;
  size: number;
}

/** Release information displayed and passed to the standalone host. */
export interface StandaloneUpdateRelease {
  version: string;
  title: string;
  releasePageUrl: string;
  notes: string;
  asset: StandaloneUpdateAsset;
}

/** Result state returned after checking GitHub Releases. */
export type UpdateCheckStatus =
  'unsupported' | 'checking' | 'no-release' | 'no-compatible-asset' | 'up-to-date' | 'update-available' | 'error';

/** Complete result of an updater check. */
export interface UpdateCheckResult {
  status: UpdateCheckStatus;
  currentVersion: string;
  latestRelease?: StandaloneUpdateRelease | undefined;
  message?: string | undefined;
}

/** Payload sent to the standalone shell to install and restart. */
export interface StandaloneUpdateInstallRequest {
  version: string;
  downloadUrl: string;
  fileName: string;
  releasePageUrl: string;
}

/** Result returned by a native standalone updater after checking its channel. */
export interface StandaloneHostUpdateCheck {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  error?: string;
}

/** Stage of a desktop update install, as streamed by the native host. */
export type UpdateInstallPhase = 'downloading' | 'ready' | 'failed' | 'installing';

/** One progress report of a desktop update install. */
export interface UpdateInstallProgress {
  phase: UpdateInstallPhase;
  message: string;
  percent?: number;
}
