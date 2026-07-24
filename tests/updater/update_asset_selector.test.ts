import { describe, expect, it } from 'vitest';
import { selectStandaloneUpdateAsset } from '../../src/updater/update_asset_selector.js';
import type { GitHubReleaseAsset } from '../../src/updater/update_types.js';

describe('standalone update asset selection', () => {
  it('selects the Windows installer and ignores checksums and source archives', () => {
    const assets = createAssets(
      'AiWorldEd-windows-portable.exe',
      'AiWorldEd-windows-installer.exe',
      'AiWorldEd-linux.AppImage',
      'AiWorldEd-sha256.txt',
      'AiWorldEd-source.zip'
    );
    expect(selectStandaloneUpdateAsset(assets, 'windows')?.name).toBe(
      'AiWorldEd-windows-installer.exe'
    );
  });

  it('selects native macOS and Linux packages only for their platform', () => {
    const assets = createAssets(
      'AiWorldEd-macos.dmg',
      'AiWorldEd-linux.AppImage',
      'AiWorldEd-windows.exe'
    );
    expect(selectStandaloneUpdateAsset(assets, 'macos')?.name).toBe('AiWorldEd-macos.dmg');
    expect(selectStandaloneUpdateAsset(assets, 'linux')?.name).toBe('AiWorldEd-linux.AppImage');
  });

  it('returns null when a release has no executable for the current platform', () => {
    const assets = createAssets('AiWorldEd-source.zip', 'AiWorldEd-sha256.txt');
    expect(selectStandaloneUpdateAsset(assets, 'windows')).toBeNull();
  });
});

/**
 * Creates independent release asset records for each selection scenario.
 * @param names Asset names to materialize.
 * @returns Release asset records.
 */
function createAssets(...names: string[]): GitHubReleaseAsset[] {
  return names.map((name, index) => ({
    name,
    browserDownloadUrl: `https://github.com/Henry00IS/AiWorldEd/releases/download/test/${name}`,
    size: index + 1
  }));
}
