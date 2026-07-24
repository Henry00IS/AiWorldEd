import { describe, expect, it, vi } from 'vitest';
import { StandaloneUpdateService } from '../../src/updater/standalone_update_service.js';
import type {
  GitHubRelease,
  StandaloneUpdateInstallRequest
} from '../../src/updater/update_types.js';

describe('StandaloneUpdateService', () => {
  it('finds and installs a newer compatible executable through the host bridge', async () => {
    const release = createRelease('v1.2.0', 'AiWorldEd-windows-installer.exe');
    const installUpdate = vi.fn<(request: StandaloneUpdateInstallRequest) => Promise<void>>();
    const service = createService(release, { platform: 'windows', installUpdate });

    const result = await service.checkForUpdates();
    await service.installUpdate(result);

    expect(result.status).toBe('update-available');
    expect(installUpdate).toHaveBeenCalledWith({
      version: 'v1.2.0',
      downloadUrl: release.assets[0].browserDownloadUrl,
      fileName: 'AiWorldEd-windows-installer.exe',
      releasePageUrl: release.releasePageUrl
    });
  });

  it('reports no release and does not invent an update when GitHub has none', async () => {
    const service = createService(null, { platform: 'windows' });
    const result = await service.checkForUpdates();
    expect(result.status).toBe('no-release');
    expect(result.latestRelease).toBeUndefined();
  });

  it('does not call GitHub from a browser build that lacks an install bridge', async () => {
    const fetchLatestRelease = vi.fn(async () => createRelease('v9.0.0', 'AiWorldEd-windows.exe'));
    const service = new StandaloneUpdateService({
      client: { fetchLatestRelease },
      bridge: null,
      currentVersion: '1.0.0',
      platform: 'windows'
    });

    const result = await service.checkForUpdates();
    expect(result.status).toBe('unsupported');
    expect(fetchLatestRelease).not.toHaveBeenCalled();
  });
});

/**
 * Creates an updater with a deterministic release response and host bridge.
 * @param release Release returned by the fake client.
 * @param bridgeOptions Platform and install callback settings.
 * @returns Configured updater service.
 */
function createService(
  release: GitHubRelease | null,
  bridgeOptions: {
    platform: 'windows' | 'macos' | 'linux';
    installUpdate?: (request: StandaloneUpdateInstallRequest) => Promise<void>;
  }
): StandaloneUpdateService {
  return new StandaloneUpdateService({
    client: { fetchLatestRelease: async () => release },
    bridge: {
      platform: bridgeOptions.platform,
      installUpdate: bridgeOptions.installUpdate ?? (async () => undefined)
    },
    currentVersion: '1.0.0',
    platform: bridgeOptions.platform
  });
}

/**
 * Creates a release with an asset URL tied to the supplied asset name.
 * @param version Release tag.
 * @param assetName Executable asset name.
 * @returns Release metadata.
 */
function createRelease(version: string, assetName: string): GitHubRelease {
  return {
    tagName: version,
    title: `AiWorldEd ${version}`,
    releasePageUrl: 'https://github.com/Henry00IS/AiWorldEd/releases/tag/v1.2.0',
    notes: 'Test release notes',
    assets: [{
      name: assetName,
      browserDownloadUrl: `https://github.com/Henry00IS/AiWorldEd/releases/download/${version}/${assetName}`,
      size: 42
    }]
  };
}
