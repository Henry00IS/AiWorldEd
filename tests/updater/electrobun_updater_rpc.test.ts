import { describe, expect, it, vi } from 'vitest';
import { ElectrobunUpdaterBridge, type ElectrobunUpdaterRpcClient } from '@/updater/electrobun_updater_rpc.js';
import type { UpdateInstallProgress } from '@/updater/update_types.js';

describe('ElectrobunUpdaterBridge', () => {
  it('forwards native checks through the typed RPC client', async () => {
    const { rpc } = createRpc();
    const bridge = new ElectrobunUpdaterBridge(rpc);

    await expect(bridge.checkForUpdate()).resolves.toMatchObject({ latestVersion: '1.2.0', updateAvailable: true });
    expect(bridge.kind).toBe('electrobun');
  });

  it('applies the update only after the host reports the download ready', async () => {
    const { rpc, applyUpdate } = createRpc();
    const bridge = new ElectrobunUpdaterBridge(rpc);
    const progress: UpdateInstallProgress[] = [];
    bridge.onInstallProgress((entry) => progress.push(entry));

    const installing = bridge.installUpdate();
    await Promise.resolve();
    bridge.progressReceive({ phase: 'downloading', message: 'Downloading update… 50%', percent: 50 });
    expect(applyUpdate).not.toHaveBeenCalled();
    bridge.progressReceive({ phase: 'ready', message: 'Update downloaded.', percent: 100 });
    await installing;

    expect(applyUpdate).toHaveBeenCalledOnce();
    expect(progress.map((entry) => entry.phase)).toEqual(['downloading', 'ready', 'installing']);
  });

  it('rejects with the host message and never applies when the download fails', async () => {
    const { rpc, applyUpdate } = createRpc();
    const bridge = new ElectrobunUpdaterBridge(rpc);

    const installing = bridge.installUpdate();
    bridge.progressReceive({ phase: 'failed', message: "The update couldn't be downloaded." });

    await expect(installing).rejects.toThrow("The update couldn't be downloaded.");
    expect(applyUpdate).not.toHaveBeenCalled();
  });

  it('rejects when the host refuses to start the download', async () => {
    const { rpc } = createRpc({ downloadUpdate: vi.fn(async () => Promise.reject(new Error('Check first.'))) });
    const bridge = new ElectrobunUpdaterBridge(rpc);

    await expect(bridge.installUpdate()).rejects.toThrow('Check first.');
  });

  it('stops notifying a listener once it unsubscribes', () => {
    const bridge = new ElectrobunUpdaterBridge(createRpc().rpc);
    const listener = vi.fn();
    const unsubscribe = bridge.onInstallProgress(listener);

    unsubscribe();
    bridge.progressReceive({ phase: 'downloading', message: 'Downloading update…' });

    expect(listener).not.toHaveBeenCalled();
  });
});

/**
 * Builds a fake RPC client whose requests are spies.
 *
 * @param overrides Requests replacing the default spies.
 * @returns The client and its apply spy.
 */
function createRpc(overrides: Partial<ElectrobunUpdaterRpcClient['request']> = {}) {
  const applyUpdate = vi.fn(async () => undefined);
  const rpc: ElectrobunUpdaterRpcClient = {
    request: {
      checkForUpdate: vi.fn(async () => ({ currentVersion: '1.0.0', latestVersion: '1.2.0', updateAvailable: true })),
      downloadUpdate: vi.fn(async () => undefined),
      applyUpdate,
      ...overrides,
    },
  };
  return { rpc, applyUpdate };
}
