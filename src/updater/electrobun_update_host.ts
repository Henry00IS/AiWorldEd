import {
  UpdateAttemptTimeoutError,
  updateAttemptTimeoutStartReal,
  updateAttemptWaitReal,
  updateAttemptWithStallLimit,
  updateAttemptWithTimeout,
  updateAttemptsWithRetry,
  type UpdateAttemptRetryPolicy,
  type UpdateAttemptStallWatch,
  type UpdateAttemptTimeoutStart,
  type UpdateAttemptWait,
} from './update_attempt_retry.js';
import type { StandaloneHostUpdateCheck, UpdateInstallProgress } from './update_types.js';

/** One status entry emitted by Electrobun's updater. */
export interface ElectrobunUpdaterStatus {
  status: string;
  message: string;
  details?: { progress?: number | undefined } | undefined;
}

/** Result of Electrobun's update channel check. */
export interface ElectrobunUpdaterCheck {
  version: string;
  hash: string;
  updateAvailable: boolean;
  error: string;
}

/** The part of Electrobun's Updater the desktop host uses. */
export interface ElectrobunUpdaterApi {
  getLocalInfo(): Promise<{ version: string; hash: string }>;
  checkForUpdate(): Promise<ElectrobunUpdaterCheck>;
  downloadUpdate(): Promise<void>;
  applyUpdate(): Promise<void>;
  onStatusChange(listener: ((entry: ElectrobunUpdaterStatus) => void) | null): void;
}

/** Dependencies of the desktop update host. */
export interface ElectrobunUpdateHostOptions {
  updater: ElectrobunUpdaterApi;
  /** Streams install progress to the editor window. */
  progressSend: (progress: UpdateInstallProgress) => void;
  /** Returns whether the bundle with this hash is fully downloaded and ready. */
  bundleIsDownloaded: (hash: string) => Promise<boolean>;
  /** Installs the downloaded bundle and restarts; defaults to Electrobun's. */
  bundleApply?: (hash: string) => Promise<void>;
  wait?: UpdateAttemptWait;
  attemptTimeoutStart?: UpdateAttemptTimeoutStart;
}

/**
 * Bun-side updater: checks with a time limit and retries, downloads in the
 * background while streaming progress (retrying an attempt that stalls), and
 * installs only a finished download.
 */
export class ElectrobunUpdateHost {
  /** Check attempts: 20 s each, retried after 1, 3 and 9 s. */
  static readonly CHECK_RETRY_POLICY: UpdateAttemptRetryPolicy = {
    attemptTimeoutMs: 20000,
    retryDelaysMs: [1000, 3000, 9000],
  };
  /** Waits before each download retry. */
  static readonly DOWNLOAD_RETRY_DELAYS_MS: readonly number[] = [1000, 3000, 9000];
  /** A download attempt that receives nothing for this long fails. */
  static readonly DOWNLOAD_STALL_TIMEOUT_MS = 120000;
  /**
   * Updater steps that report no progress while they run (fetching and applying
   * a patch, unpacking); their time never counts as a stall.
   */
  static readonly DOWNLOAD_SILENT_STATUSES: ReadonlySet<string> = new Set([
    'fetching-patch',
    'patch-found',
    'downloading-patch',
    'applying-patch',
    'decompressing',
  ]);

  private readonly updater: ElectrobunUpdaterApi;
  private readonly progressSend: (progress: UpdateInstallProgress) => void;
  private readonly bundleIsDownloaded: (hash: string) => Promise<boolean>;
  private readonly bundleApply: (hash: string) => Promise<void>;
  private readonly wait: UpdateAttemptWait;
  private readonly attemptTimeoutStart: UpdateAttemptTimeoutStart;
  private latestHash: string | null = null;
  private readyHash: string | null = null;
  private downloadRunning: Promise<void> | null = null;
  private downloadWatch: UpdateAttemptStallWatch | null = null;

  /** @param options Updater, progress channel, bundle checks and timers. */
  constructor(options: ElectrobunUpdateHostOptions) {
    this.updater = options.updater;
    this.progressSend = options.progressSend;
    this.bundleIsDownloaded = options.bundleIsDownloaded;
    this.bundleApply = options.bundleApply ?? (() => this.updater.applyUpdate());
    this.wait = options.wait ?? updateAttemptWaitReal;
    this.attemptTimeoutStart = options.attemptTimeoutStart ?? updateAttemptTimeoutStartReal;
  }

  /**
   * Checks the release channel, retrying attempts that fail or stall.
   *
   * @returns Versions and availability, or a user-facing error.
   */
  async checkForUpdate(): Promise<StandaloneHostUpdateCheck> {
    const current = await this.updater.getLocalInfo();
    try {
      const latest = await updateAttemptsWithRetry(
        () => this.checkAttempt(),
        ElectrobunUpdateHost.CHECK_RETRY_POLICY,
        this.wait,
      );
      this.latestHash = latest.updateAvailable ? latest.hash : null;
      return {
        currentVersion: current.version,
        latestVersion: latest.version,
        updateAvailable: latest.updateAvailable,
      };
    } catch (failure) {
      this.latestHash = null;
      const error = this.checkFailureMessage(failure);
      return { currentVersion: current.version, latestVersion: current.version, updateAvailable: false, error };
    }
  }

  /**
   * Starts downloading the checked update in the background. Progress, the
   * final ready state and failures arrive through progressSend.
   *
   * @throws Error when no check has found an update yet.
   */
  async downloadUpdate(): Promise<void> {
    const hash = this.latestHash;
    if (!hash) throw new Error('Check for updates before downloading one.');
    if (this.downloadRunning) return;
    this.downloadRunning = this.downloadRun(hash).finally(() => {
      this.downloadRunning = null;
    });
  }

  /**
   * Resolves once the running download, if any, has finished or failed.
   *
   * @returns Promise for the running download.
   */
  downloadSettled(): Promise<void> {
    return this.downloadRunning ?? Promise.resolve();
  }

  /**
   * Installs the fully downloaded update and restarts the app.
   *
   * @throws Error when the update is not downloaded, or when installing
   *   returned without restarting.
   */
  async applyUpdate(): Promise<void> {
    const hash = this.readyHash;
    if (!hash || hash !== this.latestHash || !(await this.bundleIsDownloaded(hash))) {
      throw new Error("The update isn't downloaded yet. Download it again and retry.");
    }
    await this.bundleApply(hash);
    this.readyHash = null;
    throw new Error("The update couldn't be installed. Try again.");
  }

  /**
   * Runs one check attempt under the time limit.
   *
   * @returns The channel's answer.
   * @throws Error when the attempt timed out or the channel reported an error.
   */
  private async checkAttempt(): Promise<ElectrobunUpdaterCheck> {
    const { attemptTimeoutMs } = ElectrobunUpdateHost.CHECK_RETRY_POLICY;
    const latest = await updateAttemptWithTimeout(
      this.updater.checkForUpdate(),
      attemptTimeoutMs,
      this.attemptTimeoutStart,
    );
    if (latest.error) throw new Error(latest.error);
    return latest;
  }

  /**
   * Turns the last check failure into a message for the user.
   *
   * @param failure Last failure of the check.
   * @returns User-facing message.
   */
  private checkFailureMessage(failure: unknown): string {
    if (failure instanceof UpdateAttemptTimeoutError) {
      return "GitHub didn't respond in time. Check your internet connection and try again.";
    }
    return "Couldn't reach GitHub to check for updates. Check your internet connection and try again.";
  }

  /**
   * Downloads the bundle with retries and reports the outcome.
   *
   * @param hash Hash of the bundle to download.
   */
  private async downloadRun(hash: string): Promise<void> {
    this.readyHash = null;
    this.updater.onStatusChange((entry) => this.downloadStatusForward(entry));
    this.progressSend({ phase: 'downloading', message: 'Downloading update…' });
    try {
      const delays = { retryDelaysMs: ElectrobunUpdateHost.DOWNLOAD_RETRY_DELAYS_MS };
      await updateAttemptsWithRetry(
        () => this.downloadAttempt(hash),
        delays,
        this.wait,
        (_failure, nextIndex) => this.downloadRetryReport(nextIndex),
      );
      this.readyHash = hash;
      this.progressSend({ phase: 'ready', message: 'Update downloaded.', percent: 100 });
    } catch {
      const message = "The update couldn't be downloaded. Check your internet connection and try again.";
      this.progressSend({ phase: 'failed', message });
    } finally {
      this.updater.onStatusChange(null);
      this.downloadWatch = null;
    }
  }

  /**
   * Runs one download attempt and checks that the bundle really is on disk.
   * Every status Electrobun reports while downloading (about every 500 KB)
   * counts as activity; an attempt without any for 2 minutes fails, not
   * counting steps that report no progress.
   *
   * @param hash Hash of the bundle to download.
   * @throws Error when the attempt stalled or the bundle is missing afterwards.
   */
  private async downloadAttempt(hash: string): Promise<void> {
    const attemptStart = (watch: UpdateAttemptStallWatch) => {
      this.downloadWatch = watch;
      return this.updater.downloadUpdate();
    };
    const stallMs = ElectrobunUpdateHost.DOWNLOAD_STALL_TIMEOUT_MS;
    await updateAttemptWithStallLimit(attemptStart, stallMs, this.attemptTimeoutStart);
    if (!(await this.bundleIsDownloaded(hash))) throw new Error('The downloaded update is incomplete.');
  }

  /**
   * Reports that a download attempt failed and another one follows.
   *
   * @param nextAttemptIndex Zero-based index of the next attempt.
   */
  private downloadRetryReport(nextAttemptIndex: number): void {
    const attemptCount = ElectrobunUpdateHost.DOWNLOAD_RETRY_DELAYS_MS.length + 1;
    const message = `Download failed. Retrying (${nextAttemptIndex + 1} of ${attemptCount})…`;
    this.progressSend({ phase: 'downloading', message, percent: 0 });
  }

  /**
   * Forwards Electrobun's byte progress and unpack step to the editor.
   *
   * @param entry Status entry from Electrobun's updater.
   */
  private downloadStatusForward(entry: ElectrobunUpdaterStatus): void {
    if (ElectrobunUpdateHost.DOWNLOAD_SILENT_STATUSES.has(entry.status)) this.downloadWatch?.pause();
    else this.downloadWatch?.activity();
    const percent = entry.details?.progress;
    if (entry.status === 'download-progress' && typeof percent === 'number') {
      this.progressSend({ phase: 'downloading', message: `Downloading update… ${percent}%`, percent });
    } else if (entry.status === 'decompressing') {
      this.progressSend({ phase: 'downloading', message: 'Unpacking update…', percent: 100 });
    }
  }
}
