import { solidScriptDebugStepLimitSet } from '@/solid_script/debug/solid_script_debug_steps.js';
import { solidScriptDocumentSource } from '@/solid_script/document/solid_script_document_source.js';
import { solidScriptProgramEvaluate } from '@/solid_script/language/solid_script_program.js';
import type { SolidScriptEditorSession } from './solid_script_editor_session.js';

/** Whether a script is being stepped through. */
export type SolidScriptDebuggerState = 'stopped' | 'paused' | 'playing';

/** Time between steps while playing, in ms. */
const SOLID_SCRIPT_DEBUGGER_STEP_MS = 400;

/**
 * Steps through a script one solid at a time: the generator only builds the
 * solids reached so far, so the viewport shows the script being built. Nothing
 * of it is stored in the level.
 */
export class SolidScriptEditorDebugger {
  private state: SolidScriptDebuggerState = 'stopped';
  private lines: number[] = [];
  private step = 0;
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
   * Returns the line of the last solid built.
   *
   * @returns 0-based line, or null when stopped or before the first step.
   */
  line(): number | null {
    const line = this.state === 'stopped' ? undefined : this.lines[this.step - 1];
    return line === undefined ? null : line - 1;
  }

  /**
   * Returns the lines of every step built so far, for tracing.
   *
   * @returns 0-based line indices.
   */
  passedLines(): number[] {
    return this.state === 'stopped' ? [] : this.lines.slice(0, this.step).map((line) => line - 1);
  }

  /** Plays from the current step, or pauses while playing. */
  play(): void {
    if (this.state === 'playing') return this.pause();
    if (this.state === 'stopped' && !this.begin()) return;
    if (this.step >= this.lines.length) this.step = 0;
    this.state = 'playing';
    this.timer = setInterval(() => this.advance(), SOLID_SCRIPT_DEBUGGER_STEP_MS);
    this.apply();
  }

  /** Builds one more solid, starting a stopped script. */
  stepOnce(): void {
    if (this.state === 'stopped' && !this.begin()) return;
    this.timerClear();
    this.state = 'paused';
    if (this.step >= this.lines.length) this.step = 0;
    this.advance();
  }

  /** Stops and shows the whole script again. */
  stop(): void {
    if (this.state === 'stopped') return;
    this.timerClear();
    this.state = 'stopped';
    this.lines = [];
    this.step = 0;
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
   * Finds the solids of the script.
   *
   * @returns False when the script has none or does not run.
   */
  private begin(): boolean {
    try {
      this.lines = solidScriptProgramEvaluate(solidScriptDocumentSource(this.session.document())).steps;
    } catch {
      this.lines = [];
    }
    this.step = 0;
    if (this.lines.length > 0) this.state = 'paused';
    return this.lines.length > 0;
  }

  /** Builds the next solid, pausing after the last. */
  private advance(): void {
    if (this.step < this.lines.length) this.step++;
    if (this.step >= this.lines.length && this.state === 'playing') {
      this.timerClear();
      this.state = 'paused';
    }
    this.apply();
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
