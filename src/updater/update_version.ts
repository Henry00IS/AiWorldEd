/**
 * Compares two release versions after removing an optional leading v.
 * @param firstVersion First version string.
 * @param secondVersion Second version string.
 * @returns Negative when first is older, zero when equal, positive when newer.
 */
export function compareUpdateVersions(firstVersion: string, secondVersion: string): number {
  const first = parseVersion(firstVersion);
  const second = parseVersion(secondVersion);
  if (!first || !second) return firstVersion.localeCompare(secondVersion);
  return compareNumericParts(first, second) || comparePreRelease(first, second);
}

/**
 * Reports whether a release version is newer than the installed version.
 * @param installedVersion Current application version.
 * @param releaseVersion Version from GitHub Releases.
 * @returns True when the release is newer.
 */
export function isNewerUpdateVersion(installedVersion: string, releaseVersion: string): boolean {
  return compareUpdateVersions(releaseVersion, installedVersion) > 0;
}

interface ParsedVersion {
  numbers: [number, number, number];
  preRelease: string | null;
}

/**
 * Parses a strict three-part semantic version with an optional v prefix.
 * @param version Candidate version string.
 * @returns Parsed version or null when invalid.
 */
function parseVersion(version: string): ParsedVersion | null {
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/i.exec(version.trim());
  if (!match) return null;
  return {
    numbers: [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)],
    preRelease: match[4] ?? null
  };
}

/**
 * Compares the numeric portions of two parsed versions.
 * @param first First parsed version.
 * @param second Second parsed version.
 * @returns Numeric version ordering.
 */
function compareNumericParts(first: ParsedVersion, second: ParsedVersion): number {
  for (let index = 0; index < first.numbers.length; index++) {
    const difference = first.numbers[index] - second.numbers[index];
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * Applies semantic-version stable-versus-prerelease ordering.
 * @param first First parsed version.
 * @param second Second parsed version.
 * @returns Prerelease ordering.
 */
function comparePreRelease(first: ParsedVersion, second: ParsedVersion): number {
  if (first.preRelease === second.preRelease) return 0;
  if (first.preRelease === null) return 1;
  if (second.preRelease === null) return -1;
  return first.preRelease.localeCompare(second.preRelease);
}
