import type { PlayerSystem, PlayerSystemHost } from './player_system.js';
import { PlayerSystem as PlayerSystemImpl } from './player_system.js';

/**
 * Creates and returns the player system for the editor layout.
 *
 * @param host Layout host dependencies.
 * @returns Live player system instance.
 */
export function setupPlayerLayout(host: PlayerSystemHost): PlayerSystem {
  return new PlayerSystemImpl(host);
}
