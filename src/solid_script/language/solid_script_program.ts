import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptBlockTree, type SolidScriptTreeLine } from './solid_script_block_tree.js';
import { solidScriptErrorLine } from './solid_script_error.js';
import {
  SolidScriptMachine,
  solidScriptFailure,
  type SolidScriptEvaluation,
  type SolidScriptPreset,
  type SolidScriptRun,
} from './solid_script_machine.js';

/** Options of a run. */
export interface SolidScriptProgramOptions {
  /** Shapes to build; later shapes are only counted, for the debugger. */
  stepLimit?: number;
  /** Values defined before the first line, such as inspector inputs. */
  presets?: readonly SolidScriptPreset[];
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
 * @param options Step limit and presets.
 * @returns Run result.
 */
export function solidScriptProgramRun(
  program: SolidScriptProgram,
  options: SolidScriptProgramOptions = {},
): SolidScriptRun {
  try {
    const lines = solidScriptBlockTree(program.blocks, solidScriptCommandFind);
    return new SolidScriptMachine(options.stepLimit).run(lines, options.presets);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      shapes: [],
      messages: [],
      steps: [],
      variables: [],
      error: solidScriptFailure(solidScriptErrorLine(message), message),
    };
  }
}

/**
 * Runs the lines of a script and throws on the first mistake.
 *
 * @param program Lines of the script.
 * @param options Step limit and presets.
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
