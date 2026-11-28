import { SOLID_SCRIPT_REPEAT_ROUNDS_MAX, solidScriptLimitCount } from './solid_script_limits.js';

/** A Stop Loop or Next Round on its way out of the loops around it. */
interface SolidScriptLoopJump {
  /** Loops still to leave, counting the one that takes the jump. */
  levels: number;
  /** True for Next Round: the last loop left goes on with its next round. */
  next: boolean;
}

/**
 * Keeps how deep the running line sits in Repeat, For Each and While loops of
 * its own Function or part, and carries a Stop Loop or Next Round out through
 * them.
 */
export class SolidScriptLoopControl {
  private depth = 0;
  private frames = 0;
  private jump: SolidScriptLoopJump | null = null;

  /**
   * Tells whether a Stop Loop or Next Round is leaving loops, so the lines
   * between it and its loop do not run.
   *
   * @returns True while one is.
   */
  get jumping(): boolean {
    return this.jump !== null;
  }

  /**
   * Runs the rounds of one loop until a round says there is none left, the run
   * stops, or a Stop Loop or Next Round ends it.
   *
   * @param round Runs one round by its number from 0; false when there was no
   *   round left to run.
   * @param halted Tells whether the run stopped, by a mistake, Stop Script or
   *   Return.
   */
  rounds(round: (index: number) => boolean, halted: () => boolean): void {
    this.depth += 1;
    try {
      for (let index = 0; round(index); index++) if (halted() || !this.jumpLanded()) return;
    } finally {
      this.depth -= 1;
    }
  }

  /**
   * Starts a Stop Loop or Next Round out of a number of loops around the line.
   *
   * @param label Block name, for messages.
   * @param levels Loops to leave, from 1.
   * @param next True for Next Round.
   */
  jumpStart(label: string, levels: number, next: boolean): void {
    if (!Number.isInteger(levels) || levels < 1)
      throw new Error(`Levels needs a whole number of 1 or more, such as 1, not ${levels}`);
    if (this.depth === 0) throw new Error(this.jumpOutsideMessage(label));
    if (levels > this.depth)
      throw new Error(
        `Levels is ${levels}, but this line is inside ${this.depth === 1 ? 'only 1 loop' : `only ${this.depth} loops`}${this.frames > 0 ? ' of its Function or part' : ''}`,
      );
    this.jump = { levels, next };
  }

  /**
   * Builds the message of a Stop Loop or Next Round outside any loop.
   *
   * @param label Block name.
   * @returns Message.
   */
  private jumpOutsideMessage(label: string): string {
    if (this.frames === 0) return `${label} only works inside a Repeat, For Each or While`;
    return `${label} only works inside a Repeat, For Each or While of the same Function or part; it cannot leave a loop around the line that runs it`;
  }

  /**
   * Starts a Function or part: loops around its caller do not count inside.
   *
   * @returns Depth to give back to frameLeave.
   */
  frameEnter(): number {
    const outer = this.depth;
    this.depth = 0;
    this.frames += 1;
    return outer;
  }

  /**
   * Ends a Function or part, back in the loops around its caller.
   *
   * @param outer Depth frameEnter gave.
   */
  frameLeave(outer: number): void {
    this.depth = outer;
    this.frames -= 1;
    this.jump = null;
  }

  /**
   * Lets a loop take the jump on its way out after a round.
   *
   * @returns True when the loop goes on with its next round.
   */
  private jumpLanded(): boolean {
    const jump = this.jump;
    if (jump === null) return true;
    if (jump.levels > 1) {
      jump.levels -= 1;
      return false;
    }
    this.jump = null;
    return jump.next;
  }
}

/**
 * Tells whether a While runs another round: its condition holds, within the
 * round limit.
 *
 * @param index Number of the round about to run, from 0.
 * @param holds Works out the condition.
 * @returns True when the round runs.
 */
export function solidScriptWhileHolds(index: number, holds: () => boolean): boolean {
  if (!holds()) return false;
  if (index < SOLID_SCRIPT_REPEAT_ROUNDS_MAX) return true;
  throw new Error(
    `While ran ${solidScriptLimitCount(SOLID_SCRIPT_REPEAT_ROUNDS_MAX)} rounds and its Condition is still Yes; change a value inside so it turns No, or end it with Stop Loop`,
  );
}
