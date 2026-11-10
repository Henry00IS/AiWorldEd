import type { StandaloneUpdaterBridge, StandaloneUpdateProgressListener } from './bridge_standalone_updater.js';
import { detectStandalonePlatform } from './bridge_standalone_updater.js';
import type { StandaloneHostUpdateCheck, UpdateInstallProgress } from './update_types.js';

/** Request and message contract shared by the Electrobun Bun and webview sides. */
export interface ElectrobunUpdaterRpcSchema {
  bun: {
    requests: {
      checkForUpdate: { params: undefined; response: StandaloneHostUpdateCheck };
      downloadUpdate: { params: undefined; response: void };
      applyUpdate: { params: undefined; response: void };
    };
    messages: {};
  };
  webview: {
    requests: {};
    messages: {
      updateInstallProgress: UpdateInstallProgress;
    };
  };
}

/** Minimal RPC client surface needed by the renderer-side updater bridge. */
export interface ElectrobunUpdaterRpcClient {
  request: {
    checkForUpdate: () => Promise<StandaloneHostUpdateCheck>;
    downloadUpdate: () => Promise<void>;
    applyUpdate: () => Promise<void>;
  };
}

/** Download waiting for its ready or failed report. */
interface ElectrobunUpdaterDownloadWaiter {
  resolve: () => void;
  reject: (error: Error) => void;
}

/**
 * Renderer bridge backed by Electrobun's native updater RPC: starts the
 * download, follows its streamed progress, and installs once it is ready.
 */
export class ElectrobunUpdaterBridge implements StandaloneUpdaterBridge {
  readonly kind = 'electrobun';
  readonly platform = detectStandalonePlatform();
  private readonly rpc: ElectrobunUpdaterRpcClient;
  private readonly progressListeners = new Set<StandaloneUpdateProgressListener>();
  private downloadWaiter: ElectrobunUpdaterDownloadWaiter | null = null;

  /** @param rpc Typed RPC client connected to the Bun process. */
  constructor(rpc: ElectrobunUpdaterRpcClient) {
    this.rpc = rpc;
  }

  /**
   * Checks the native update channel.
   *
   * @returns Versions and availability from the Bun process.
   */
  checkForUpdate(): Promise<StandaloneHostUpdateCheck> {
    return this.rpc.request.checkForUpdate();
  }

  /**
   * Downloads the update, then installs it and restarts.
   *
   * @throws Error when the download fails or installing does not restart.
   */
  async installUpdate(): Promise<void> {
    await this.downloadUntilReady();
    this.progressEmit({ phase: 'installing', message: 'Installing update and restarting…' });
    await this.rpc.request.applyUpdate();
  }

  /**
   * Subscribes to install progress.
   *
   * @param listener Called with each progress report.
   * @returns Function that unsubscribes the listener.
   */
  onInstallProgress(listener: StandaloneUpdateProgressListener): () => void {
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
  }

  /**
   * Receives one progress report streamed by the Bun process.
   *
   * @param progress Progress report.
   */
  progressReceive(progress: UpdateInstallProgress): void {
    this.progressEmit(progress);
    if (progress.phase === 'ready') this.downloadWaiterSettle(null);
    if (progress.phase === 'failed') this.downloadWaiterSettle(new Error(progress.message));
  }

  /**
   * Starts the background download and waits for its ready or failed report.
   *
   * @returns Promise that resolves once the bundle is ready.
   */
  private downloadUntilReady(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.downloadWaiter = { resolve, reject };
      this.rpc.request.downloadUpdate().catch((error: unknown) => {
        this.downloadWaiterSettle(error instanceof Error ? error : new Error('The update download could not start.'));
      });
    });
  }

  /**
   * Resolves or rejects the waiting download.
   *
   * @param error Failure, or null when the download is ready.
   */
  private downloadWaiterSettle(error: Error | null): void {
    const waiter = this.downloadWaiter;
    this.downloadWaiter = null;
    if (!waiter) return;
    if (error) waiter.reject(error);
    else waiter.resolve();
  }

  /**
   * Sends one progress report to every listener.
   *
   * @param progress Progress report.
   */
  private progressEmit(progress: UpdateInstallProgress): void {
    for (const listener of this.progressListeners) listener(progress);
  }
}
