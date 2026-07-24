import type {
  GitHubRelease,
  GitHubReleaseAsset
} from './update_types.js';

/** GitHub Releases API endpoint for the AiWorldEd repository. */
export const GITHUB_LATEST_RELEASE_URL =
  'https://api.github.com/repos/Henry00IS/AiWorldEd/releases/latest';

/** Public release page used when no executable host bridge is available. */
export const GITHUB_RELEASES_PAGE_URL =
  'https://github.com/Henry00IS/AiWorldEd/releases';

/** Small client for the public GitHub Releases API. */
export class GitHubReleaseClient {
  private readonly request: typeof fetch;

  /**
   * Creates a GitHub release client.
   * @param request Fetch implementation used for API requests.
   */
  constructor(request: typeof fetch = fetch) {
    this.request = request;
  }

  /**
   * Fetches the latest published release.
   * @returns Normalized latest release data.
   * @throws Error when GitHub cannot provide a valid release response.
   */
  async fetchLatestRelease(): Promise<GitHubRelease | null> {
    const response = await this.request(GITHUB_LATEST_RELEASE_URL, {
      headers: { Accept: 'application/vnd.github+json' }
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}.`);
    return parseReleasePayload(await response.json());
  }
}

/**
 * Converts the GitHub API shape into the updater's smaller release shape.
 * @param payload Unknown GitHub JSON response.
 * @returns Normalized release.
 * @throws Error when the payload lacks a release tag.
 */
function parseReleasePayload(payload: unknown): GitHubRelease {
  if (!isRecord(payload) || typeof payload.tag_name !== 'string') {
    throw new Error('GitHub returned an invalid release payload.');
  }
  return {
    tagName: payload.tag_name,
    title: typeof payload.name === 'string' && payload.name ? payload.name : payload.tag_name,
    releasePageUrl: typeof payload.html_url === 'string' ? payload.html_url : GITHUB_RELEASES_PAGE_URL,
    notes: typeof payload.body === 'string' ? payload.body : '',
    assets: parseAssets(payload.assets)
  };
}

/**
 * Parses only valid downloadable asset entries from a GitHub response.
 * @param value Unknown assets property.
 * @returns Valid release assets.
 */
function parseAssets(value: unknown): GitHubReleaseAsset[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((asset) => parseAsset(asset));
}

/**
 * Parses one release asset or discards it when required fields are absent.
 * @param value Unknown asset value.
 * @returns One valid asset or an empty list.
 */
function parseAsset(value: unknown): GitHubReleaseAsset[] {
  if (!isRecord(value)) return [];
  if (typeof value.name !== 'string' || typeof value.browser_download_url !== 'string') return [];
  return [{
    name: value.name,
    browserDownloadUrl: value.browser_download_url,
    size: typeof value.size === 'number' ? value.size : 0
  }];
}

/**
 * Narrows unknown JSON values to object records.
 * @param value Unknown JSON value.
 * @returns True for non-null object records.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
