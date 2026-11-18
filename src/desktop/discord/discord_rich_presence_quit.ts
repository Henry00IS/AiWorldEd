/** Host surface that can clear Discord activity and disconnect. */
export interface DiscordRichPresenceQuitHost {
  /** Clears activity, closes the socket, and stops reconnecting. */
  quit(): void;
}

/** Event target that can subscribe to a named event. */
export interface DiscordRichPresenceQuitEvents {
  /**
   * Subscribes to a named event.
   *
   * @param name Event name.
   * @param handler Event callback.
   */
  on(name: string, handler: () => void): void;
}

/**
 * Clears Discord activity when the desktop window closes or the process exits.
 *
 * @param host Presence host to quit.
 * @param window Native desktop window.
 * @param processLike Process event target.
 */
export function discordRichPresenceQuitInstall(
  host: DiscordRichPresenceQuitHost,
  window: DiscordRichPresenceQuitEvents,
  processLike: DiscordRichPresenceQuitEvents,
): void {
  const quit = () => host.quit();
  window.on('close', quit);
  window.on('closed', quit);
  processLike.on('beforeExit', quit);
  processLike.on('SIGINT', quit);
  processLike.on('SIGTERM', quit);
  processLike.on('exit', quit);
}
