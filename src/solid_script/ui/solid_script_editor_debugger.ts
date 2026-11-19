import { solidScriptDebugStepLimitSet } from '@/solid_script/debug/solid_script_debug_steps.js';
import {
  solidScriptDebugBreakpointLines,
  solidScriptDebugBreakpoints,
} from '@/solid_script/debug/solid_script_debug_breakpoints.js';
import type { SolidScriptBreak } from '@/solid_script/language/solid_script_machine_types.js';
import { solidScriptProgramRun, type SolidScriptProgramOptions } from '@/solid_script/language/solid_script_program.js';
import type { SolidScriptEditorSession } from './solid_script_editor_session.js';
import {
  SOLID_SCRIPT_EDITOR_DEBUG_SPEED_DEFAULT,
  solidScriptEditorDebugSpeedMs,
} from './solid_script_editor_debug_speed.js';

/** Whether a script is being stepped through. */
export type SolidScriptDebuggerState = 'stopped' | 'paused' | 'playing';

/**
 * Steps through a script one shape at a time and pauses at breakpoints: the
 * generator only builds the shapes reached so far, so the viewport shows the
 * script being built. Every position is a fresh run of the script on a new
 * machine. Nothing of it is stored in the level.
 *
 * - Start builds everything up to the next breakpoint, or the whole script.
 * - Debug builds one shape after the other and pauses at breakpoints; pressed
 *   again it pauses, or continues from a breakpoint.
 * - Step builds the next shape.
 * - Stop shows the whole script again.
 */
export class SolidScriptEditorDebugger {
  private state: SolidScriptDebuggerState = 'stopped';
  private lines: number[] = [];
  private breaks: SolidScriptBreak[] = [];
  private breakLines = new Set<number>();
  private step = 0;
  /** Breakpoint hits already passed. */
  private passed = 0;
  /** Index of the breakpoint hit paused at, or null. */
  private atBreak: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Time between steps while Debug plays, in ms. */
  private stepMs = solidScriptEditorDebugSpeedMs(SOLID_SCRIPT_EDITOR_DEBUG_SPEED_DEFAULT);

  /**
   * Creates the debugger.
   *
   * @param session Generator being debugged.
   * @param changed Runs after every step and state change.
   */
  constructor(
    private readonly session: SolidScriptEditorSession,
    private readonly changed: () => void,
  ) {}

  /**
   * Returns the state.
   *
   * @returns Stopped, paused or playing.
   */
  stateGet(): SolidScriptDebuggerState {
    return this.state;
  }

  /**
   * Returns the step shown and the step count.
   *
   * @returns Step number from 0 and count.
   */
  position(): { step: number; count: number } {
    return { step: this.step, count: this.lines.length };
  }

  /**
   * Returns the line of the last shape built, or of the breakpoint paused at.
   *
   * @returns 0-based line, or null when stopped or before the first step.
   */
  line(): number | null {
    if (this.state === 'stopped') return null;
    const line = this.atBreak !== null ? this.breaks[this.atBreak]?.line : this.lines[this.step - 1];
    return line === undefined ? null : line - 1;
  }

  /**
   * Returns whether the debugger waits at a breakpoint.
   *
   * @returns True at a breakpoint.
   */
  atBreakpoint(): boolean {
    return this.state !== 'stopped' && this.atBreak !== null;
  }

  /**
   * Returns how to run the script to see the state shown: up to the step, or
   * paused at the breakpoint.
   *
   * @returns Run options, or null when stopped.
   */
  runOptions(): SolidScriptProgramOptions | null {
    if (this.state === 'stopped') return null;
    const start = this.session.runStart();
    if (this.atBreak !== null) return { breakpoints: { lines: this.breakLines, pauseAt: this.atBreak + 1 }, ...start };
    return { stepLimit: this.step, ...start };
  }

  /**
   * Builds the whole script at once, or up to the next breakpoint, and shows
   * the result in the viewport.
   */
  start(): void {
    this.timerClear();
    if (this.state === 'stopped' && !this.begin()) return this.finish();
    this.breakLeave();
    const next = this.breaks[this.passed];
    if (!next) return this.finish();
    this.state = 'paused';
    this.step = next.steps;
    this.breakEnter();
  }

  /**
   * Builds the script one shape at a time, pauses while it does, or continues
   * from a breakpoint.
   */
  play(): void {
    if (this.state === 'playing') return this.pause();
    if (this.state === 'stopped' && !this.begin()) return;
    if (this.atBreak === null && this.step >= this.lines.length && this.passed >= this.breaks.length) {
      this.step = 0;
      this.passed = 0;
    }
    this.breakLeave();
    this.state = 'playing';
    this.timer = setInterval(() => this.advance(), this.stepMs);
    this.apply();
  }

  /** Builds one more shape, starting a stopped script. */
  stepOnce(): void {
    if (this.state === 'stopped' && !this.begin()) return;
    this.timerClear();
    this.state = 'paused';
    this.breakLeave();
    if (this.step >= this.lines.length) {
      this.step = 0;
      this.passed = 0;
    }
    this.step++;
    while ((this.breaks[this.passed]?.steps ?? Number.POSITIVE_INFINITY) < this.step) this.passed++;
    this.apply();
  }

  /**
   * Builds up to the next solid of some lines, after the step shown or else
   * from the top, and pauses there; breakpoints on the way are passed.
   *
   * @param first First 0-based line, such as the line at the cursor.
   * @param last Last 0-based line, the end of its block.
   * @returns False when those lines build no solid.
   */
  runTo(first: number, last: number): boolean {
    const wasStopped = this.state === 'stopped';
    if (wasStopped && !this.begin()) return false;
    const inside = (line: number): boolean => line - 1 >= first && line - 1 <= last;
    let index = this.lines.findIndex((line, at) => at >= this.step && inside(line));
    if (index < 0) index = this.lines.findIndex(inside);
    if (index < 0) {
      if (wasStopped) this.finish();
      return false;
    }
    this.timerClear();
    this.atBreak = null;
    this.state = 'paused';
    this.step = index + 1;
    this.passed = 0;
    while ((this.breaks[this.passed]?.steps ?? Number.POSITIVE_INFINITY) < this.step) this.passed++;
    this.apply();
    return true;
  }

  /**
   * Takes up breakpoints set or cleared while debugging: the hits are found
   * again, the ones before the step shown count as passed, and the hit paused
   * at stays while its breakpoint does.
   */
  breakpointsChanged(): void {
    if (this.state === 'stopped') return;
    const at = this.atBreak === null ? undefined : this.breaks[this.atBreak];
    this.breaksFind();
    const kept = at ? this.breaks.findIndex((hit) => hit.line === at.line && hit.steps === at.steps) : -1;
    this.atBreak = kept >= 0 ? kept : null;
    this.passed = this.breaks.filter((hit) => hit.steps < this.step).length;
    if (this.atBreak === null && at)
      // The breakpoint paused at is gone: the hits at this step up to it count as passed.
      this.passed = this.breaks.filter(
        (hit) => hit.steps < this.step || (hit.steps === this.step && hit.line <= at.line),
      ).length;
  }

  /** Stops debugging and shows the whole script again. */
  stop(): void {
    if (this.state !== 'stopped') this.finish();
  }

  /** Ends debugging and builds the whole script on a fresh machine. */
  private finish(): void {
    this.timerClear();
    this.state = 'stopped';
    this.lines = [];
    this.breaks = [];
    this.step = 0;
    this.passed = 0;
    this.atBreak = null;
    solidScriptDebugStepLimitSet(this.session.node, this.session.stepId, null);
    this.changed();
  }

  /** Pauses on the current step. */
  private pause(): void {
    this.timerClear();
    this.state = 'paused';
    this.changed();
  }

  /**
   * Runs the script once to find its shape steps and breakpoint hits.
   *
   * @returns False when the script stops before it builds or pauses at
   *   anything.
   */
  private begin(): boolean {
    const run = this.breaksFind();
    this.lines = run.steps.slice(0, run.error ? 0 : undefined);
    this.step = 0;
    this.passed = 0;
    this.atBreak = null;
    const found = this.lines.length > 0 || this.breaks.length > 0;
    if (found) this.state = 'paused';
    return found;
  }

  /**
   * Runs the script once with the breakpoints set now, to find their hits.
   *
   * @returns The run.
   */
  private breaksFind(): ReturnType<typeof solidScriptProgramRun> {
    const document = this.session.document();
    this.breakLines = solidScriptDebugBreakpointLines(
      document,
      solidScriptDebugBreakpoints(this.session.node, this.session.stepId),
    );
    const run = solidScriptProgramRun(document, {
      breakpoints: { lines: this.breakLines, pauseAt: 0 },
      ...this.session.runStart(),
      context: 'preview',
    });
    this.breaks = run.error ? [] : run.breaks;
    return run;
  }

  /**
   * Builds the next shape, or pauses at a breakpoint reached first; playing
   * stops after the last.
   */
  private advance(): void {
    this.breakLeave();
    if (this.breaks[this.passed]?.steps === this.step) return this.breakEnter(true);
    if (this.step < this.lines.length) {
      this.step++;
      return this.apply();
    }
    if (this.state === 'playing') this.finish();
  }

  /**
   * Waits at the next breakpoint hit.
   *
   * @param stopTimer True to stop playing.
   */
  private breakEnter(stopTimer = false): void {
    if (stopTimer) this.timerClear();
    this.state = 'paused';
    this.atBreak = this.passed;
    this.apply();
  }

  /** Moves past the breakpoint hit waited at, if any. */
  private breakLeave(): void {
    if (this.atBreak === null) return;
    this.passed = this.atBreak + 1;
    this.atBreak = null;
  }

  /** Shows the current step in the viewport. */
  private apply(): void {
    solidScriptDebugStepLimitSet(this.session.node, this.session.stepId, this.step);
    this.changed();
  }

  /** Stops the play timer. */
  /**
   * Sets how long Debug waits between steps while it plays; a run that is
   * playing goes on at the new speed at once.
   *
   * @param ms Milliseconds between steps.
   */
  stepMsSet(ms: number): void {
    this.stepMs = ms;
    if (this.state !== 'playing') return;
    this.timerClear();
    this.timer = setInterval(() => this.advance(), this.stepMs);
  }

  private timerClear(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
}
