import { solidScriptDebugStepLimitSet } from '@/solid_script/debug/solid_script_debug_steps.js';
import {
  solidScriptDebugBreakpointLines,
  solidScriptDebugBreakpoints,
} from '@/solid_script/debug/solid_script_debug_breakpoints.js';
import type { SolidScriptBreak } from '@/solid_script/language/solid_script_machine.js';
import { solidScriptProgramRun, type SolidScriptProgramOptions } from '@/solid_script/language/solid_script_program.js';
import type { SolidScriptEditorSession } from './solid_script_editor_session.js';

/** Whether a script is being stepped through. */
export type SolidScriptDebuggerState = 'stopped' | 'paused' | 'playing';

/** Time between steps while playing, in ms. */
const SOLID_SCRIPT_DEBUGGER_STEP_MS = 400;

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
    const inputs = this.session.inputs();
    if (this.atBreak !== null) return { breakpoints: { lines: this.breakLines, pauseAt: this.atBreak + 1 }, inputs };
    return { stepLimit: this.step, inputs };
  }

  /**
   * Returns the lines of every step built so far, for tracing.
   *
   * @returns 0-based line indices.
   */
  passedLines(): number[] {
    return this.state === 'stopped' ? [] : this.lines.slice(0, this.step).map((line) => line - 1);
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
    this.timer = setInterval(() => this.advance(), SOLID_SCRIPT_DEBUGGER_STEP_MS);
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
    const document = this.session.document();
    this.breakLines = solidScriptDebugBreakpointLines(
      document,
      solidScriptDebugBreakpoints(this.session.node, this.session.stepId),
    );
    const run = solidScriptProgramRun(document, {
      breakpoints: { lines: this.breakLines, pauseAt: 0 },
      inputs: this.session.inputs(),
    });
    this.lines = run.steps.slice(0, run.error ? 0 : undefined);
    this.breaks = run.error ? [] : run.breaks;
    this.step = 0;
    this.passed = 0;
    this.atBreak = null;
    const found = this.lines.length > 0 || this.breaks.length > 0;
    if (found) this.state = 'paused';
    return found;
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
  private timerClear(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
}
