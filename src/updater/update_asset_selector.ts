import type {
  GitHubReleaseAsset,
  StandalonePlatform
} from './update_types.js';

/**
 * Selects the best executable asset for a standalone platform.
 * @param assets Release assets returned by GitHub.
 * @param platform Current standalone platform.
 * @returns Best matching executable asset, or null when none exists.
 */
export function selectStandaloneUpdateAsset(
  assets: readonly GitHubReleaseAsset[],
  platform: StandalonePlatform
): GitHubReleaseAsset | null {
  const candidates = assets.filter((asset) => isPlatformAsset(asset, platform));
  return candidates.sort(compareAssetPreference)[0] ?? null;
}

/**
 * Checks the platform-specific executable extension and name.
 * @param asset Candidate release asset.
 * @param platform Current standalone platform.
 * @returns True when the asset can target the platform.
 */
function isPlatformAsset(asset: GitHubReleaseAsset, platform: StandalonePlatform): boolean {
  const name = asset.name.toLowerCase();
  if (!isExecutableName(name, platform)) return false;
  if (isNonInstallableArchive(name)) return false;
  return hasPlatformMarker(name, platform) || !hasAnyPlatformMarker(name);
}

/**
 * Checks supported executable/archive extensions for one platform.
 * @param name Lowercase asset name.
 * @param platform Current standalone platform.
 * @returns True when the extension is supported.
 */
function isExecutableName(name: string, platform: StandalonePlatform): boolean {
  if (platform === 'windows') return name.endsWith('.exe');
  if (platform === 'macos') return name.endsWith('.dmg') || name.endsWith('.zip');
  return name.endsWith('.appimage') || name.endsWith('.tar.gz') || name.endsWith('.zip');
}

/**
 * Checks whether a release asset identifies its intended platform.
 * @param name Lowercase asset name.
 * @param platform Current standalone platform.
 * @returns True when a platform marker matches.
 */
function hasPlatformMarker(name: string, platform: StandalonePlatform): boolean {
  const markers = {
    windows: ['windows', 'win', 'win32', 'win64'],
    macos: ['macos', 'mac', 'darwin', 'osx'],
    linux: ['linux', 'ubuntu', 'appimage']
  } as const;
  return markers[platform].some((marker) => name.includes(marker));
}

/**
 * Rejects source bundles and checksum files that share archive extensions.
 * @param name Lowercase asset name.
 * @returns True when the asset is not installable.
 */
function isNonInstallableArchive(name: string): boolean {
  return name.includes('source') || name.includes('checksum') || name.includes('sha256');
}

/**
 * Checks whether an asset explicitly targets a different supported platform.
 * @param name Lowercase asset name.
 * @returns True when any platform marker is present.
 */
function hasAnyPlatformMarker(name: string): boolean {
  return ['windows', 'win', 'win32', 'win64', 'macos', 'mac', 'darwin', 'osx', 'linux', 'ubuntu', 'appimage'].some(
    (marker) => name.includes(marker)
  );
}

/**
 * Prefers installers and native image formats over generic archives.
 * @param firstAsset First candidate asset.
 * @param secondAsset Second candidate asset.
 * @returns Sort ordering with the preferred asset first.
 */
function compareAssetPreference(
  firstAsset: GitHubReleaseAsset,
  secondAsset: GitHubReleaseAsset
): number {
  return assetPreference(secondAsset) - assetPreference(firstAsset);
}

/**
 * Gives stable preference to assets that can be installed directly.
 * @param asset Candidate release asset.
 * @returns Preference score.
 */
function assetPreference(asset: GitHubReleaseAsset): number {
  const name = asset.name.toLowerCase();
  if (name.includes('setup') || name.includes('installer')) return 30;
  if (name.endsWith('.exe') || name.endsWith('.appimage') || name.endsWith('.dmg')) return 20;
  return 10;
}
