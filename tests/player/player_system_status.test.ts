import { describe, expect, it, vi } from 'vitest';
import { PLAYER_SYSTEM_SPAWN_SET_STATUS, playerSystemSpawnPlaced } from '@/player/player_system.js';

/** Status bar feedback of the figurine spawn. */
describe('player_system status', () => {
  it('replaces the drag hint once the figurine placed a spawn', () => {
    const refresh = vi.fn();
    const shown: string[] = ['Drag the figurine into the scene to set a play spawn'];
    playerSystemSpawnPlaced(refresh, (message) => shown.push(message));
    expect(refresh).toHaveBeenCalledOnce();
    expect(shown.at(-1)).toBe(PLAYER_SYSTEM_SPAWN_SET_STATUS);
  });
});
