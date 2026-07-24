import { describe, expect, it, vi } from 'vitest';
import {
  GITHUB_LATEST_RELEASE_URL,
  GitHubReleaseClient
} from '../../src/updater/github_release_client.js';

describe('GitHubReleaseClient', () => {
  it('requests the latest release endpoint and normalizes release assets', async () => {
    const request = vi.fn(async () => createResponse(200, {
      tag_name: 'v1.4.0',
      name: 'AiWorldEd 1.4.0',
      html_url: 'https://github.com/Henry00IS/AiWorldEd/releases/tag/v1.4.0',
      body: 'Bug fixes',
      assets: [{
        name: 'AiWorldEd-windows.exe',
        browser_download_url: 'https://github.com/Henry00IS/AiWorldEd/releases/download/v1.4.0/AiWorldEd-windows.exe',
        size: 100
      }]
    }));
    const client = new GitHubReleaseClient(request as unknown as typeof fetch);

    const release = await client.fetchLatestRelease();

    expect(request).toHaveBeenCalledWith(GITHUB_LATEST_RELEASE_URL, {
      headers: { Accept: 'application/vnd.github+json' }
    });
    expect(release?.tagName).toBe('v1.4.0');
    expect(release?.assets[0].browserDownloadUrl).toContain('/releases/download/');
  });

  it('treats GitHub 404 as an empty release list', async () => {
    const request = vi.fn(async () => createResponse(404, {}));
    const client = new GitHubReleaseClient(request as unknown as typeof fetch);
    expect(await client.fetchLatestRelease()).toBeNull();
  });
});

/**
 * Creates the small response surface used by the release client.
 * @param status HTTP status returned by the fake request.
 * @param payload JSON payload returned by the fake request.
 * @returns Minimal response object.
 */
function createResponse(status: number, payload: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => payload
  } as Response;
}
