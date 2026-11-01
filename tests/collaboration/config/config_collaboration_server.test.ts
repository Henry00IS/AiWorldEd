import { describe, expect, it } from 'vitest';
import {
  CONFIG_COLLABORATION_URL_DEVELOPMENT,
  CONFIG_COLLABORATION_URL_KEY,
  CONFIG_COLLABORATION_URL_PRODUCTION,
  configCollaborationDevelopmentDefault,
  configCollaborationNameGet,
  configCollaborationNameSet,
  configCollaborationUrlGet,
  configCollaborationUrlSet,
  configCollaborationUrlValid,
  type ConfigCollaborationStorage,
} from '@/collaboration/config/config_collaboration_server.js';

/**
 * Creates an in-memory storage.
 *
 * @returns Storage and its backing map.
 */
function storageCreate(): { storage: ConfigCollaborationStorage; map: Map<string, string> } {
  const map = new Map<string, string>();
  const storage: ConfigCollaborationStorage = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
  return { storage, map };
}

/** Server URL configuration: defaults per build, validation and persistence. */
describe('config_collaboration_server', () => {
  it('defaults to the dev relay in development and the public relay in production', () => {
    expect(configCollaborationUrlGet(null, true)).toBe(CONFIG_COLLABORATION_URL_DEVELOPMENT);
    expect(configCollaborationUrlGet(null, false)).toBe(CONFIG_COLLABORATION_URL_PRODUCTION);
  });

  it('accepts only ws and wss URLs', () => {
    expect(configCollaborationUrlValid('wss://example.test/ws')).toBe(true);
    expect(configCollaborationUrlValid('ws://127.0.0.1:9/ws')).toBe(true);
    expect(configCollaborationUrlValid('https://example.test/ws')).toBe(false);
    expect(configCollaborationUrlValid('not a url')).toBe(false);
  });

  it('stores a valid override, rejects an invalid one and clears on empty input', () => {
    const { storage, map } = storageCreate();
    const custom = 'wss://relay.example.test/ws';
    expect(configCollaborationUrlSet(storage, ` ${custom} `)).toBe(true);
    expect(configCollaborationUrlGet(storage, true)).toBe(custom);
    expect(configCollaborationUrlSet(storage, 'ftp://x')).toBe(false);
    expect(configCollaborationUrlGet(storage, true)).toBe(custom);
    expect(configCollaborationUrlSet(storage, '  ')).toBe(true);
    expect(map.has(CONFIG_COLLABORATION_URL_KEY)).toBe(false);
  });

  it('ignores a corrupted stored URL', () => {
    const { storage, map } = storageCreate();
    map.set(CONFIG_COLLABORATION_URL_KEY, 'garbage');
    expect(configCollaborationUrlGet(storage, false)).toBe(CONFIG_COLLABORATION_URL_PRODUCTION);
  });

  it('persists the display name', () => {
    const { storage } = storageCreate();
    expect(configCollaborationNameGet(storage)).toBe('');
    configCollaborationNameSet(storage, 'Alice');
    expect(configCollaborationNameGet(storage)).toBe('Alice');
    configCollaborationNameSet(storage, '  A name stored by an older version ');
    expect(configCollaborationNameGet(storage)).toBe('A name store');
  });

  it('uses the dev relay only for a local debug session', () => {
    const page = (protocol: string, hostname: string, standaloneBridge = false) => ({
      protocol,
      hostname,
      standaloneBridge,
    });
    expect(CONFIG_COLLABORATION_URL_DEVELOPMENT).toBe('wss://aiworlded.00labs.net/wsdev');
    expect(CONFIG_COLLABORATION_URL_PRODUCTION).toBe('wss://aiworlded.00labs.net/ws');
    expect(configCollaborationDevelopmentDefault(page('http:', 'localhost'))).toBe(true);
    expect(configCollaborationDevelopmentDefault(page('http:', '127.0.0.1'))).toBe(true);
    expect(configCollaborationDevelopmentDefault(page('https:', 'henry00is.github.io'))).toBe(false);
    expect(configCollaborationDevelopmentDefault(page('views:', 'main_ui', true))).toBe(false);
  });
});
