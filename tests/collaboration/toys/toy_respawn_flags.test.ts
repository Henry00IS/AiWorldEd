import { describe, expect, it } from 'vitest';
import { TOY_RESPAWN_FLAG_MS, ToyRespawnFlags } from '@/collaboration/toys/toy_respawn_flags.js';
import type { PlayerBallState } from '@/player/ball/player_ball_link.js';

/**
 * Builds a resting ball.
 *
 * @param id Ball id.
 * @param spawn Spawn count.
 * @returns State.
 */
function ball(id: number, spawn = 0): PlayerBallState {
  return {
    id,
    spawn,
    position: [0, 0, 0],
    velocity: [0, 0, 0],
    sleeping: true,
    rolling: false,
    bounces: 0,
    strength: 0,
  };
}

describe('ToyRespawnFlags', () => {
  it('flags a toy for a while after its spawn count changed, also in frames that do not list it', () => {
    const flags = new ToyRespawnFlags();
    expect(flags.outgoing([ball(1, 1), ball(2, 1)], 0)).toBe(0b11);
    expect(flags.outgoing([], TOY_RESPAWN_FLAG_MS - 1)).toBe(0b11);
    expect(flags.outgoing([ball(1, 1), ball(2, 1)], TOY_RESPAWN_FLAG_MS)).toBe(0);
    expect(flags.outgoing([ball(2, 2)], 1000)).toBe(0b10);
    expect(flags.outgoing([ball(1, 1), ball(2, 2)], 1000 + TOY_RESPAWN_FLAG_MS)).toBe(0);
  });

  it('counts a new life per sender and id each time a flag turns on, however many frames repeat it', () => {
    const flags = new ToyRespawnFlags();
    const lives = (sender: number, bits: number, ids: number[]): (number | undefined)[] => {
      const balls = ids.map((id) => ball(id));
      flags.incoming(sender, bits, balls);
      return balls.map((state) => state.spawn);
    };
    expect(lives(3, 0b0001, [1])).toEqual([1]);
    expect(lives(3, 0b0001, [1])).toEqual([1]);
    expect(lives(3, 0b1000, [1, 4])).toEqual([1, 1]);
    expect(lives(3, 0, [1, 4])).toEqual([1, 1]);
    expect(lives(3, 0b0001, [1, 4])).toEqual([2, 1]);
    expect(lives(5, 0, [1])).toEqual([0]);
    flags.forget(3);
    expect(lives(3, 0, [1])).toEqual([0]);
  });
});
