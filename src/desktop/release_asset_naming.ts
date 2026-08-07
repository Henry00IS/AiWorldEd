/** Supported Electrobun OS tokens that appear in artifact prefixes. */
export type ElectrobunArtifactOs = 'win' | 'linux' | 'macos';

/** Supported architecture tokens that appear in artifact prefixes. */
export type ElectrobunArtifactArch = 'x64' | 'arm64';

/** Human-facing platform label used in public download names. */
export type PublicReleasePlatform = 'Win' | 'Linux' | 'MacOS';

/** Parsed identity of one Electrobun-produced release artifact. */
export interface ParsedElectrobunArtifact {
  channel: string;
  os: ElectrobunArtifactOs;
  arch: ElectrobunArtifactArch;
  kind: 'setup' | 'portable' | 'update-json' | 'patch' | 'unknown';
  fileName: string;
}

/**
 * Maps an Electrobun OS token to the public platform label.
 *
 * @param os Electrobun OS token from an artifact prefix.
 * @returns Public platform label for download file names.
 */
export function toPublicReleasePlatform(os: ElectrobunArtifactOs): PublicReleasePlatform {
  if (os === 'win') return 'Win';
  if (os === 'linux') return 'Linux';
  return 'MacOS';
}

/**
 * Builds the human-facing Setup archive name for a versioned release.
 *
 * @param version Release version such as "1.0.42".
 * @param os Electrobun OS token.
 * @param arch Architecture token.
 * @param extension Archive extension without a leading dot, default "zip".
 * @returns File name such as "AiWorldEd-1.0.42-Win-x64-Setup.zip".
 */
export function buildPublicSetupFileName(
  version: string,
  os: ElectrobunArtifactOs,
  arch: ElectrobunArtifactArch,
  extension: string = 'zip',
): string {
  return `AiWorldEd-${version}-${toPublicReleasePlatform(os)}-${arch}-Setup.${extension}`;
}

/**
 * Builds the human-facing Portable archive name for a versioned release.
 *
 * @param version Release version such as "1.0.42".
 * @param os Electrobun OS token.
 * @param arch Architecture token.
 * @param extension Archive extension without a leading dot, default "tar.zst".
 * @returns File name such as "AiWorldEd-1.0.42-Win-x64-Portable.tar.zst".
 */
export function buildPublicPortableFileName(
  version: string,
  os: ElectrobunArtifactOs,
  arch: ElectrobunArtifactArch,
  extension: string = 'tar.zst',
): string {
  return `AiWorldEd-${version}-${toPublicReleasePlatform(os)}-${arch}-Portable.${extension}`;
}

/**
 * Builds the Electrobun auto-update metadata file name for a platform.
 *
 * Electrobun's native updater hard-codes this pattern, so it must stay stable.
 *
 * @param channel Build channel such as "stable".
 * @param os Electrobun OS token.
 * @param arch Architecture token.
 * @returns File name such as "stable-win-x64-update.json".
 */
export function buildElectrobunUpdateJsonFileName(
  channel: string,
  os: ElectrobunArtifactOs,
  arch: ElectrobunArtifactArch,
): string {
  return `${channel}-${os}-${arch}-update.json`;
}

/**
 * Builds the Electrobun auto-update portable tarball name for a platform.
 *
 * Electrobun's native updater hard-codes this pattern, so it must stay stable.
 *
 * @param channel Build channel such as "stable".
 * @param os Electrobun OS token.
 * @param arch Architecture token.
 * @param appFileName Sanitized app file name such as "AiWorldEd".
 * @returns File name such as "stable-win-x64-AiWorldEd.tar.zst".
 */
export function buildElectrobunPortableFileName(
  channel: string,
  os: ElectrobunArtifactOs,
  arch: ElectrobunArtifactArch,
  appFileName: string = 'AiWorldEd',
): string {
  const bundleSuffix = os === 'macos' ? `${appFileName}.app.tar.zst` : `${appFileName}.tar.zst`;
  return `${channel}-${os}-${arch}-${bundleSuffix}`;
}

/**
 * Parses an Electrobun artifact file name into platform/kind metadata.
 *
 * @param fileName File name from desktop_artifacts/.
 * @returns Parsed metadata, or null when the name is not recognized.
 */
export function parseElectrobunArtifactFileName(fileName: string): ParsedElectrobunArtifact | null {
  const match = /^(?<channel>[^-]+)-(?<os>win|linux|macos)-(?<arch>x64|arm64)-(?<rest>.+)$/i.exec(fileName);
  if (!match?.groups) return null;
  const channelGroup = match.groups['channel'];
  const osGroup = match.groups['os'];
  const archGroup = match.groups['arch'];
  const restGroup = match.groups['rest'];
  if (!channelGroup || !osGroup || !archGroup || !restGroup) return null;
  const channel = channelGroup.toLowerCase();
  const os = osGroup.toLowerCase() as ElectrobunArtifactOs;
  const arch = archGroup.toLowerCase() as ElectrobunArtifactArch;
  const rest = restGroup.toLowerCase();
  return {
    channel,
    os,
    arch,
    kind: classifyElectrobunArtifactRest(rest),
    fileName,
  };
}

/**
 * Classifies the suffix after the platform prefix.
 *
 * @param rest Lowercase remainder of the artifact file name.
 * @returns Artifact kind: setup, portable, update-json, patch, or unknown.
 */
function classifyElectrobunArtifactRest(rest: string): ParsedElectrobunArtifact['kind'] {
  if (rest === 'update.json' || rest.endsWith('-update.json')) return 'update-json';
  if (rest.endsWith('.patch')) return 'patch';
  if (rest.includes('setup')) return 'setup';
  if (rest.endsWith('.tar.zst') || rest.endsWith('.app.tar.zst')) return 'portable';
  return 'unknown';
}

/**
 * Returns true when a release asset should be published for auto-update.
 *
 * @param kind Parsed artifact kind.
 * @returns True for update metadata and portable update payloads.
 */
export function isElectrobunUpdaterArtifactKind(kind: ParsedElectrobunArtifact['kind']): boolean {
  return kind === 'update-json' || kind === 'portable';
}
