import { describe, expect, it, vi } from 'vitest';
import { createElectrobunUpdaterBridge } from '../../src/updater/electrobun_updater_rpc.js';

describe('createElectrobunUpdaterBridge', () => {
  it('forwards native checks and installs through the typed RPC client', async () => {
    const checkForUpdate = vi.fn(async () => ({
      currentVersion: '1.0.0',
      latestVersion: '1.2.0',
      updateAvailable: true,
    }));
    const installUpdate = vi.fn(async () => undefined);
    const toggleFullscreen = vi.fn(async () => true);
    const bridge = createElectrobunUpdaterBridge({
      request: { checkForUpdate, installUpdate, toggleFullscreen },
    });

    await expect(bridge.checkForUpdate?.()).resolves.toMatchObject({
      latestVersion: '1.2.0',
      updateAvailable: true,
    });
    await bridge.installUpdate({
      version: '1.2.0',
      downloadUrl: '',
      fileName: 'bundle',
      releasePageUrl: 'https://example.com/releases',
    });

    expect(bridge.kind).toBe('electrobun');
    expect(checkForUpdate).toHaveBeenCalledOnce();
    expect(installUpdate).toHaveBeenCalledOnce();
  });
});
