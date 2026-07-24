import type {
  StandalonePlatform,
  StandaloneUpdateInstallRequest
} from './update_types.js';

/** Host bridge exposed by a standalone executable shell. */
export interface StandaloneUpdaterBridge {
  /** Optional host platform override for asset selection. */
  platform?: StandalonePlatform;
  /** Downloads, verifies, replaces, and restarts the standalone executable. */
  installUpdate(request: StandaloneUpdateInstallRequest): Promise<void> | void;
}

declare global {
  interface Window {
    aiworldedStandaloneUpdater?: StandaloneUpdaterBridge;
  }
}

/**
 * Returns the host bridge when the editor is running as a standalone build.
 * @returns Standalone bridge, or null in a normal browser build.
 */
export function getStandaloneUpdaterBridge(): StandaloneUpdaterBridge | null {
  if (typeof window === 'undefined') return null;
  const bridge = window.aiworldedStandaloneUpdater;
  return bridge && typeof bridge.installUpdate === 'function' ? bridge : null;
}

/**
 * Detects the platform used when a host bridge omits an explicit platform.
 * @returns Best-effort standalone platform guess.
 */
export function detectStandalonePlatform(): StandalonePlatform {
  const platform = typeof navigator === 'undefined'
    ? ''
    : `${navigator.userAgent} ${navigator.platform}`.toLowerCase();
  if (platform.includes('mac')) return 'macos';
  if (platform.includes('linux')) return 'linux';
  return 'windows';
}
