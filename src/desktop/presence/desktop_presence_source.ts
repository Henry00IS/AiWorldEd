import type { EditorSettingsStore } from '@/settings/store/editor_settings_store.js';

/** Scene values the desktop presence reporter reads from the editor. */
export interface DesktopPresenceSnapshot {
  levelName: string | null;
  projectName: string | null;
  brushCount: number;
}

/** Editor surfaces needed to report desktop presence. */
export interface DesktopPresenceSource {
  /**
   * Returns the current level name, project name, and brush count.
   *
   * @returns Presence snapshot.
   */
  capture(): DesktopPresenceSnapshot;
  /**
   * Returns the live settings store, or null before it exists.
   *
   * @returns Settings store, or null.
   */
  settingsStore(): EditorSettingsStore | null;
}

/** Listener that receives the editor presence source when the layout starts. */
export type DesktopPresenceAttachListener = (source: DesktopPresenceSource) => void;

let desktopPresenceAttachListener: DesktopPresenceAttachListener | null = null;

/**
 * Registers the listener that receives the editor presence source, or clears it
 * when null.
 *
 * @param listener Listener, or null to unregister.
 */
export function desktopPresenceAttachRegister(listener: DesktopPresenceAttachListener | null): void {
  desktopPresenceAttachListener = listener;
}

/**
 * Hands the editor presence source to the registered listener, if any.
 *
 * @param source Editor presence source.
 */
export function desktopPresenceAttach(source: DesktopPresenceSource): void {
  desktopPresenceAttachListener?.(source);
}
