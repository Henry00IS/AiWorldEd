import { describe, expect, it } from 'vitest';
import {
  CONFIG_COLLABORATION_URL_DEVELOPMENT,
  CONFIG_COLLABORATION_URL_KEY,
  CONFIG_COLLABORATION_URL_PRODUCTION,
  configCollaborationUrlDefault,
  configCollaborationUrlGet,
  type ConfigCollaborationStorage,
} from '@/collaboration/config/config_collaboration_server.js';
import {
  CONFIG_COLLABORATION_URL_LINK_PARAMETER,
  configCollaborationUrlFromBuild,
  configCollaborationUrlFromLink,
} from '@/collaboration/config/config_collaboration_url_source.js';

/**
 * Creates an in-memory storage holding one stored relay URL.
 *
 * @param storedUrl URL saved in the settings dialog.
 * @returns Storage.
 */
function storageWithUrl(storedUrl: string): ConfigCollaborationStorage {
  const values = new Map<string, string>([[CONFIG_COLLABORATION_URL_KEY, storedUrl]]);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

/**
 * Builds a query string carrying a relay link parameter.
 *
 * @param relayUrl Relay URL to link to.
 * @returns Query string such as `?relay=...`.
 */
function linkSearch(relayUrl: string): string {
  return `?${new URLSearchParams({ [CONFIG_COLLABORATION_URL_LINK_PARAMETER]: relayUrl }).toString()}`;
}

/** Relay URL sources for self-hosting: `?relay=` links and the build override. */
describe('config_collaboration_url_source', () => {
  const selfHostedUrl = 'wss://relay.example.test:8443';

  it('reads a ws or wss relay from the link and ignores other schemes', () => {
    expect(configCollaborationUrlFromLink(linkSearch(selfHostedUrl))).toBe(selfHostedUrl);
    expect(configCollaborationUrlFromLink(linkSearch('ws://localhost:8081'))).toBe('ws://localhost:8081');
    expect(configCollaborationUrlFromLink(linkSearch('https://relay.example.test'))).toBeNull();
    expect(configCollaborationUrlFromLink(linkSearch('not a url'))).toBeNull();
    expect(configCollaborationUrlFromLink('?other=1')).toBeNull();
    expect(configCollaborationUrlFromLink('')).toBeNull();
  });

  it('reads a valid build override and ignores empty or invalid values', () => {
    expect(configCollaborationUrlFromBuild(` ${selfHostedUrl} `)).toBe(selfHostedUrl);
    expect(configCollaborationUrlFromBuild('')).toBeNull();
    expect(configCollaborationUrlFromBuild('http://relay.example.test')).toBeNull();
  });

  it('uses the build override as the default instead of the official relays', () => {
    expect(configCollaborationUrlDefault(false, selfHostedUrl)).toBe(selfHostedUrl);
    expect(configCollaborationUrlDefault(true, selfHostedUrl)).toBe(selfHostedUrl);
    expect(configCollaborationUrlDefault(false, null)).toBe(CONFIG_COLLABORATION_URL_PRODUCTION);
    expect(configCollaborationUrlDefault(true, null)).toBe(CONFIG_COLLABORATION_URL_DEVELOPMENT);
  });

  it('prefers the link over the stored setting and the stored setting over the default', () => {
    const storage = storageWithUrl('wss://stored.example.test/ws');
    expect(configCollaborationUrlGet(storage, false, selfHostedUrl)).toBe(selfHostedUrl);
    expect(configCollaborationUrlGet(storage, false, null)).toBe('wss://stored.example.test/ws');
    expect(configCollaborationUrlGet(null, false, selfHostedUrl)).toBe(selfHostedUrl);
  });
});
