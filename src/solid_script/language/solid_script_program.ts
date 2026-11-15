import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptBlockTree, type SolidScriptTreeLine } from './solid_script_block_tree.js';
import { solidScriptErrorLine } from './solid_script_error.js';
import {
  SolidScriptMachine,
  solidScriptFailure,
  type SolidScriptBreakpoints,
  type SolidScriptEvaluation,
  type SolidScriptEvent,
  type SolidScriptHandled,
  type SolidScriptRun,
} from './solid_script_machine.js';

/** Options of a run. */
export interface SolidScriptProgramOptions {
  /** Shapes to build; later shapes are only counted, for the debugger. */
  stepLimit?: number;
  /** Values defined before the first line, such as inspector inputs. */
  inputs?: Readonly<Record<string, string>>;
  /** Breakpoint lines to record, and the hit to pause at, for the debugger. */
  breakpoints?: SolidScriptBreakpoints;
}

/** The lines of a script to run. */
export interface SolidScriptProgram {
  blocks: readonly SolidScriptTreeLine[];
}

/**
 * Runs the lines of a script in a new machine and returns everything built
 * before the first mistake, with the mistake. Never throws.
 *
 * @param program Lines of the script.
 * @param options Step limit, breakpoints and input values.
 * @returns Run result.
 */
export function solidScriptProgramRun(
  program: SolidScriptProgram,
  options: SolidScriptProgramOptions = {},
): SolidScriptRun {
  try {
    const lines = solidScriptBlockTree(program.blocks, solidScriptCommandFind);
    return new SolidScriptMachine(options.stepLimit, options.breakpoints ?? null, options.inputs).run(lines);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      shapes: [],
      messages: [],
      steps: [],
      variables: [],
      breaks: [],
      paused: null,
      stack: [],
      error: solidScriptFailure(solidScriptErrorLine(message), message),
    };
  }
}

/**
 * Runs the lines of a script and throws on the first mistake.
 *
 * @param program Lines of the script.
 * @param options Step limit, breakpoints and input values.
 * @returns Shapes, output and steps.
 */
export function solidScriptProgramEvaluate(
  program: SolidScriptProgram,
  options: SolidScriptProgramOptions = {},
): SolidScriptEvaluation {
  const run = solidScriptProgramRun(program, options);
  if (run.error) throw new Error(run.error.message);
  return run;
}

/**
 * Runs the When Input Changes or When Button Pressed blocks of an inspector
 * event in a new machine, instead of the script. Never throws.
 *
 * @param program Lines of the script.
 * @param event Event that happened.
 * @param inputs Inspector values, with the new value of a changed input.
 * @returns Changed inputs, messages and the first mistake.
 */
export function solidScriptProgramHandle(
  program: SolidScriptProgram,
  event: SolidScriptEvent,
  inputs: Readonly<Record<string, string>>,
): SolidScriptHandled {
  try {
    const lines = solidScriptBlockTree(program.blocks, solidScriptCommandFind);
    return new SolidScriptMachine(Number.POSITIVE_INFINITY, null, inputs).handle(lines, event);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { inputs: {}, notices: [], messages: [], error: solidScriptFailure(solidScriptErrorLine(message), message) };
  }
}
