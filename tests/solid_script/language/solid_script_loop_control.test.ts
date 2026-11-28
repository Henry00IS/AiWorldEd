import { describe, expect, it } from 'vitest';
import { SolidScriptLoopControl, solidScriptWhileHolds } from '@/solid_script/language/solid_script_loop_control.js';
import { SOLID_SCRIPT_REPEAT_ROUNDS_MAX } from '@/solid_script/language/solid_script_limits.js';

/**
 * Runs a loop of a number of rounds, calling a step each round.
 *
 * @param loops Loop control.
 * @param count Rounds.
 * @param step Runs one round by its number.
 */
function loop(loops: SolidScriptLoopControl, count: number, step: (index: number) => void): void {
  loops.rounds(
    (index) => {
      if (index >= count) return false;
      if (!loops.jumping) step(index);
      return true;
    },
    () => false,
  );
}

describe('SolidScriptLoopControl', () => {
  it('runs every round when nothing jumps', () => {
    const seen: number[] = [];
    loop(new SolidScriptLoopControl(), 3, (index) => seen.push(index));
    expect(seen).toEqual([0, 1, 2]);
  });

  it('carries a two-level stop out of both loops and a two-level next to the outer next round', () => {
    const loops = new SolidScriptLoopControl();
    const seen: string[] = [];
    loop(loops, 3, (outer) =>
      loop(loops, 3, (inner) => {
        seen.push(`${outer}${inner}`);
        if (inner === 1) loops.jumpStart('Next Round', 2, true);
      }),
    );
    expect(seen).toEqual(['00', '01', '10', '11', '20', '21']);
    expect(loops.jumping).toBe(false);
  });

  it('counts only the loops inside a Function or part, and restores the outer ones after it', () => {
    const loops = new SolidScriptLoopControl();
    loop(loops, 1, () => {
      const outer = loops.frameEnter();
      expect(() => loops.jumpStart('Stop Loop', 1, false)).toThrow('of the same Function or part');
      loops.frameLeave(outer);
      expect(() => loops.jumpStart('Stop Loop', 1, false)).not.toThrow();
    });
    expect(loops.jumping).toBe(false);
  });

  it('stops a While at the round limit and not before', () => {
    expect(solidScriptWhileHolds(SOLID_SCRIPT_REPEAT_ROUNDS_MAX - 1, () => true)).toBe(true);
    expect(solidScriptWhileHolds(SOLID_SCRIPT_REPEAT_ROUNDS_MAX, () => false)).toBe(false);
    expect(() => solidScriptWhileHolds(SOLID_SCRIPT_REPEAT_ROUNDS_MAX, () => true)).toThrow('While ran 10,000 rounds');
  });
});
