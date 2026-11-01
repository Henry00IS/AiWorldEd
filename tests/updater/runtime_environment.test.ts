import { afterEach, describe, expect, it } from 'vitest';
import {
  runtimeEnvironmentDebugIs,
  runtimeEnvironmentDetect,
  runtimeEnvironmentHostnameLocal,
  runtimeEnvironmentInputCurrent,
  type RuntimeEnvironmentInput,
} from '@/updater/runtime_environment.js';

/**
 * Builds detection input.
 *
 * @param protocol Page protocol.
 * @param hostname Page host name.
 * @param standaloneBridge Whether the desktop updater bridge exists.
 * @returns Input.
 */
function page(protocol: string, hostname: string, standaloneBridge = false): RuntimeEnvironmentInput {
  return { protocol, hostname, standaloneBridge };
}

/**
 * Shared debug / hosted / desktop detection used by the updater bridge lookup
 * and collaboration.
 */
describe('runtime_environment', () => {
  afterEach(() => {
    delete window.aiworldedStandaloneUpdater;
  });

  it('treats the Vite dev server on localhost as a debug session', () => {
    expect(runtimeEnvironmentDetect(page('http:', 'localhost'))).toBe('debug');
    expect(runtimeEnvironmentDetect(page('http:', '127.0.0.1'))).toBe('debug');
    expect(runtimeEnvironmentDetect(page('http:', '[::1]'))).toBe('debug');
    expect(runtimeEnvironmentDetect(page('http:', 'app.localhost'))).toBe('debug');
    expect(runtimeEnvironmentDebugIs(page('http:', 'localhost'))).toBe(true);
  });

  it('treats the GitHub Pages site as hosted', () => {
    expect(runtimeEnvironmentDetect(page('https:', 'henry00is.github.io'))).toBe('hosted');
    expect(runtimeEnvironmentDebugIs(page('https:', 'henry00is.github.io'))).toBe(false);
    expect(runtimeEnvironmentHostnameLocal('aiworlded.00labs.net')).toBe(false);
  });

  it('treats the desktop app as desktop, by views:// origin or updater bridge', () => {
    expect(runtimeEnvironmentDetect(page('views:', 'main_ui'))).toBe('desktop');
    expect(runtimeEnvironmentDetect(page('views:', 'main_ui', true))).toBe('desktop');
    expect(runtimeEnvironmentDetect(page('http:', 'localhost', true))).toBe('desktop');
    expect(runtimeEnvironmentDebugIs(page('views:', 'main_ui', true))).toBe(false);
  });

  it('reads the running page and the same updater bridge as StandaloneUpdateService', () => {
    expect(runtimeEnvironmentInputCurrent()).toEqual({
      protocol: window.location.protocol,
      hostname: window.location.hostname,
      standaloneBridge: false,
    });
    window.aiworldedStandaloneUpdater = { installUpdate: () => undefined };
    expect(runtimeEnvironmentInputCurrent().standaloneBridge).toBe(true);
    expect(runtimeEnvironmentDetect()).toBe('desktop');
  });
});
