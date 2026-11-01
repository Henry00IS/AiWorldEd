import { getStandaloneUpdaterBridge } from './bridge_standalone_updater.js';

/**
 * Where the editor is running:
 *
 * - `desktop`: the Electrobun desktop app (`views://` origin, standalone updater
 *   bridge present).
 * - `debug`: a local debug session (the Vite dev server or a preview on this
 *   machine, served from a localhost address).
 * - `hosted`: the published site (GitHub Pages) or any other remote host.
 */
export type RuntimeEnvironmentKind = 'desktop' | 'debug' | 'hosted';

/** Page facts the detection reads; tests pass their own. */
export interface RuntimeEnvironmentInput {
  /** Page protocol, e.g. `http:`, `https:` or `views:`. */
  protocol: string;
  /** Page host name. */
  hostname: string;
  /** Whether the standalone updater bridge is installed (desktop shell). */
  standaloneBridge: boolean;
}

/**
 * Reads the detection input from the running page, using the same standalone
 * bridge lookup as the updater.
 *
 * @returns Detection input (empty protocol and host outside a browser).
 */
export function runtimeEnvironmentInputCurrent(): RuntimeEnvironmentInput {
  const location = typeof window === 'undefined' ? undefined : window.location;
  return {
    protocol: location?.protocol ?? '',
    hostname: location?.hostname ?? '',
    standaloneBridge: getStandaloneUpdaterBridge() !== null,
  };
}

/**
 * Returns whether a host name is this machine.
 *
 * @param hostname Page host name.
 * @returns True for localhost addresses.
 */
export function runtimeEnvironmentHostnameLocal(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost')
  );
}

/**
 * Classifies where the editor runs. The desktop app always counts as desktop,
 * even though its webview origin is not a web host.
 *
 * @param input Page facts; defaults to the running page.
 * @returns Environment kind.
 */
export function runtimeEnvironmentDetect(
  input: RuntimeEnvironmentInput = runtimeEnvironmentInputCurrent(),
): RuntimeEnvironmentKind {
  if (input.standaloneBridge || input.protocol === 'views:') return 'desktop';
  if (runtimeEnvironmentHostnameLocal(input.hostname)) return 'debug';
  return 'hosted';
}

/**
 * Returns whether the editor runs as a local debug session.
 *
 * @param input Page facts; defaults to the running page.
 * @returns True for the local dev server.
 */
export function runtimeEnvironmentDebugIs(input: RuntimeEnvironmentInput = runtimeEnvironmentInputCurrent()): boolean {
  return runtimeEnvironmentDetect(input) === 'debug';
}
