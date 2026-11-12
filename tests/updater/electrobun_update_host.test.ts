import { describe, expect, it, vi } from 'vitest';
import {
  ElectrobunUpdateHost,
  type ElectrobunUpdateHostOptions,
  type ElectrobunUpdaterApi,
  type ElectrobunUpdaterStatus,
} from '@/updater/electrobun_update_host.js';
import type { UpdateInstallProgress } from '@/updater/update_types.js';

const LATEST_HASH = 'latest-bundle-hash';

describe('ElectrobunUpdateHost update checks', () => {
  it('gives up on a check attempt that never answers and retries it after a backoff', async () => {
    const waits: number[] = [];
    const checkForUpdate = vi
      .fn<ElectrobunUpdaterApi['checkForUpdate']>()
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockResolvedValueOnce(updateCheckAvailable());
    const host = createHost({ updater: createUpdater({ checkForUpdate }), waits });

    const result = await host.checkForUpdate();

    expect(checkForUpdate).toHaveBeenCalledTimes(2);
    expect(waits).toEqual([1000]);
    expect(result).toEqual({ currentVersion: '1.0.0', latestVersion: '1.1.0', updateAvailable: true });
  });

  it('retries three times with growing backoffs and then says GitHub did not respond', async () => {
    const waits: number[] = [];
    const checkForUpdate = vi.fn<ElectrobunUpdaterApi['checkForUpdate']>(() => new Promise(() => undefined));
    const host = createHost({ updater: createUpdater({ checkForUpdate }), waits });

    const result = await host.checkForUpdate();

    expect(checkForUpdate).toHaveBeenCalledTimes(4);
    expect(waits).toEqual([1000, 3000, 9000]);
    expect(result.updateAvailable).toBe(false);
    expect(result.error).toMatch(/GitHub didn't respond/);
  });

  it('retries a check that fails and reports that GitHub could not be reached', async () => {
    const waits: number[] = [];
    const checkForUpdate = vi.fn<ElectrobunUpdaterApi['checkForUpdate']>(async () => ({
      ...updateCheckAvailable(),
      updateAvailable: false,
      error: 'Failed to fetch update info',
    }));
    const host = createHost({ updater: createUpdater({ checkForUpdate }), waits });

    const result = await host.checkForUpdate();

    expect(checkForUpdate).toHaveBeenCalledTimes(4);
    expect(result.error).toMatch(/Couldn't reach GitHub/);
  });

  it('keeps every attempt and backoff inside the renderer request time limit', () => {
    const policy = ElectrobunUpdateHost.CHECK_RETRY_POLICY;
    const attemptCount = policy.retryDelaysMs.length + 1;
    const worstCaseMs =
      attemptCount * policy.attemptTimeoutMs + policy.retryDelaysMs.reduce((total, delay) => total + delay, 0);

    expect(policy.attemptTimeoutMs).toBe(20000);
    expect(policy.retryDelaysMs).toEqual([1000, 3000, 9000]);
    expect(worstCaseMs).toBeLessThan(120000);
  });
});

describe('ElectrobunUpdateHost downloads and installs', () => {
  it('streams download progress and reports ready only once the bundle is on disk', async () => {
    const progress: UpdateInstallProgress[] = [];
    let statusListener: ((entry: ElectrobunUpdaterStatus) => void) | null = null;
    const downloadUpdate = vi.fn(async () => {
      statusListener?.({ status: 'download-progress', message: 'Downloading', details: { progress: 40 } });
    });
    const updater = createUpdater({
      downloadUpdate,
      onStatusChange: (listener) => {
        statusListener = listener;
      },
    });
    const host = createHost({ updater, progress, downloadedHashes: new Set([LATEST_HASH]) });

    await host.checkForUpdate();
    await host.downloadUpdate();
    await host.downloadSettled();

    expect(downloadUpdate).toHaveBeenCalledOnce();
    expect(progress).toContainEqual({ phase: 'downloading', message: 'Downloading update… 40%', percent: 40 });
    expect(progress.at(-1)).toEqual({ phase: 'ready', message: 'Update downloaded.', percent: 100 });
    expect(statusListener).toBeNull();
  });

  it('retries a download that ends without the bundle and fails with a clear message', async () => {
    const progress: UpdateInstallProgress[] = [];
    const waits: number[] = [];
    const downloadUpdate = vi.fn(async () => undefined);
    const host = createHost({ updater: createUpdater({ downloadUpdate }), progress, waits });

    await host.checkForUpdate();
    await host.downloadUpdate();
    await host.downloadSettled();

    expect(downloadUpdate).toHaveBeenCalledTimes(4);
    expect(waits).toEqual([1000, 3000, 9000]);
    expect(progress).toContainEqual({
      phase: 'downloading',
      message: 'Download failed. Retrying (2 of 4)…',
      percent: 0,
    });
    expect(progress.at(-1)?.phase).toBe('failed');
    expect(progress.at(-1)?.message).toMatch(/couldn't be downloaded/);
  });

  it('fails a download attempt that receives nothing for 2 minutes and retries it', async () => {
    const progress: UpdateInstallProgress[] = [];
    const waits: number[] = [];
    const timeouts: number[] = [];
    const downloadUpdate = vi
      .fn<ElectrobunUpdaterApi['downloadUpdate']>()
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockResolvedValueOnce(undefined);
    const updater = createUpdater({ downloadUpdate });
    const host = createHost({ updater, progress, waits, timeouts, downloadedHashes: new Set([LATEST_HASH]) });

    await host.checkForUpdate();
    await host.downloadUpdate();
    await host.downloadSettled();

    expect(downloadUpdate).toHaveBeenCalledTimes(2);
    expect(timeouts).toContain(120000);
    expect(waits).toEqual([1000]);
    expect(progress.at(-1)?.phase).toBe('ready');
  });

  it('keeps a slow download going as long as bytes keep arriving', async () => {
    let statusListener: ((entry: ElectrobunUpdaterStatus) => void) | null = null;
    let finish = () => undefined as void;
    const downloadUpdate = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const updater = createUpdater({ downloadUpdate, onStatusChange: (listener) => (statusListener = listener) });
    const timers = timersManual();
    const host = createHost({ updater, downloadedHashes: new Set([LATEST_HASH]), timers });
    await host.checkForUpdate();
    await host.downloadUpdate();
    await vi.waitFor(() => expect(downloadUpdate).toHaveBeenCalledOnce());
    for (const percent of [10, 20, 30]) {
      statusListener!({ status: 'download-progress', message: 'Downloading', details: { progress: percent } });
    }
    expect(timers.live().map((timer) => timer.timeoutMs)).toEqual([120000]);
    finish();
    await host.downloadSettled();
    expect(downloadUpdate).toHaveBeenCalledOnce();
    expect(timers.live()).toEqual([]);
  });

  it('does not count a patch download or apply, which reports no progress, as a stall', async () => {
    let statusListener: ((entry: ElectrobunUpdaterStatus) => void) | null = null;
    let finish = () => undefined as void;
    const downloadUpdate = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const updater = createUpdater({ downloadUpdate, onStatusChange: (listener) => (statusListener = listener) });
    const timers = timersManual();
    const host = createHost({ updater, downloadedHashes: new Set([LATEST_HASH]), timers });
    await host.checkForUpdate();
    await host.downloadUpdate();
    await vi.waitFor(() => expect(downloadUpdate).toHaveBeenCalledOnce());
    for (const status of ['fetching-patch', 'downloading-patch', 'applying-patch', 'decompressing']) {
      statusListener!({ status, message: status });
      expect(timers.live()).toEqual([]);
    }
    statusListener!({ status: 'patch-applied', message: 'applied' });
    expect(timers.live().map((timer) => timer.timeoutMs)).toEqual([120000]);
    finish();
    await host.downloadSettled();
    expect(downloadUpdate).toHaveBeenCalledOnce();
  });

  it('refuses to download before a check found an update', async () => {
    const host = createHost({});

    await expect(host.downloadUpdate()).rejects.toThrow(/Check for updates/);
  });

  it('refuses to apply an update that is not fully downloaded', async () => {
    const applyUpdate = vi.fn(async () => undefined);
    const host = createHost({ updater: createUpdater({ applyUpdate }) });

    await host.checkForUpdate();

    await expect(host.applyUpdate()).rejects.toThrow(/isn't downloaded/);
    expect(applyUpdate).not.toHaveBeenCalled();
  });

  it('reports an apply that returns without restarting instead of doing nothing', async () => {
    const applyUpdate = vi.fn(async () => undefined);
    const host = createHost({ updater: createUpdater({ applyUpdate }), downloadedHashes: new Set([LATEST_HASH]) });

    await host.checkForUpdate();
    await host.downloadUpdate();
    await host.downloadSettled();

    await expect(host.applyUpdate()).rejects.toThrow(/couldn't be installed/);
    expect(applyUpdate).toHaveBeenCalledOnce();
  });
});

/**
 * Builds an update check payload that offers a newer bundle.
 *
 * @returns Electrobun check result with an available update.
 */
function updateCheckAvailable() {
  return { version: '1.1.0', hash: LATEST_HASH, updateAvailable: true, error: '' };
}

/**
 * Builds a fake Electrobun updater with overridable methods.
 *
 * @param overrides Methods replacing the default fakes.
 * @returns Fake updater API.
 */
function createUpdater(overrides: Partial<ElectrobunUpdaterApi>): ElectrobunUpdaterApi {
  return {
    getLocalInfo: async () => ({ version: '1.0.0', hash: 'current-bundle-hash' }),
    checkForUpdate: async () => updateCheckAvailable(),
    downloadUpdate: async () => undefined,
    applyUpdate: async () => undefined,
    onStatusChange: () => undefined,
    ...overrides,
  };
}

/**
 * Builds a host with instant fake timers and recorded progress.
 *
 * @param settings Updater, recorded progress, recorded waits and time limits,
 *   the bundle hashes that count as downloaded, and timers fired by hand
 *   instead of instantly.
 * @returns Update host under test.
 */
function createHost(settings: {
  updater?: ElectrobunUpdaterApi;
  progress?: UpdateInstallProgress[];
  waits?: number[];
  timeouts?: number[];
  downloadedHashes?: Set<string>;
  timers?: TimersManual;
}): ElectrobunUpdateHost {
  const options: ElectrobunUpdateHostOptions = {
    updater: settings.updater ?? createUpdater({}),
    progressSend: (entry) => settings.progress?.push(entry),
    bundleIsDownloaded: async (hash) => settings.downloadedHashes?.has(hash) ?? false,
    wait: async (milliseconds) => {
      settings.waits?.push(milliseconds);
    },
    attemptTimeoutStart:
      settings.timers?.start ??
      ((onTimeout, timeoutMs) => {
        settings.timeouts?.push(timeoutMs);
        const timer = setTimeout(onTimeout, 0);
        return () => clearTimeout(timer);
      }),
  };
  return new ElectrobunUpdateHost(options);
}

/** A timer the test fires by hand. */
interface TimerManual {
  timeoutMs: number;
  onTimeout: () => void;
  cancelled: boolean;
}

/** Timers that only run out when the test says so. */
interface TimersManual {
  start: NonNullable<ElectrobunUpdateHostOptions['attemptTimeoutStart']>;
  live: () => TimerManual[];
}

/**
 * Builds timers that never run out on their own.
 *
 * @returns Timer starter and the timers not cancelled yet.
 */
function timersManual(): TimersManual {
  const timers: TimerManual[] = [];
  return {
    start: (onTimeout, timeoutMs) => {
      const timer = { timeoutMs, onTimeout, cancelled: false };
      timers.push(timer);
      return () => void (timer.cancelled = true);
    },
    live: () => timers.filter((timer) => !timer.cancelled),
  };
}
