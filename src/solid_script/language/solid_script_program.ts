import { solidScriptNameDotProblem } from './solid_script_name_rules.js';
import { solidScriptFieldCheck } from './solid_script_field.js';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import {
  solidScriptBlockTree,
  type SolidScriptBlockNode,
  type SolidScriptTreeLine,
} from './solid_script_block_tree.js';
import type { SolidScriptCommand } from '@/solid_script/commands/solid_script_command.js';
import { solidScriptErrorLine } from './solid_script_error.js';
import { solidScriptSystemValues, type SolidScriptRunContext } from './solid_script_system.js';
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
  /** Where the script runs, for Run.Context; a generator when not given. */
  context?: SolidScriptRunContext;
  /** Size of the generator box, for Box.Width and the others. */
  box?: readonly [number, number, number];
  /** Breakpoint lines to record, and the hit to pause at, for the debugger. */
  breakpoints?: SolidScriptBreakpoints;
  /** True to count and time every line, for the editor. */
  profile?: boolean;
}

/** The lines of a script to run. */
export interface SolidScriptProgram {
  blocks: readonly SolidScriptTreeLine[];
}

/**
 * Checks every line before anything runs, so a mistake such as a name with a
 * stray dot stops the script at once, at its line.
 *
 * @param program Lines of the script.
 * @returns Problem with its 1-based line, or null.
 */
export function solidScriptProgramProblem(program: SolidScriptProgram): { line: number; message: string } | null {
  for (const [index, block] of program.blocks.entries()) {
    const command = solidScriptCommandFind(block.command);
    if (!command || block.off === true) continue;
    for (const parameter of command.parameters) {
      const text = command.valueText(block.values, parameter.key);
      const problem =
        parameter.type === 'name' || parameter.type === 'target'
          ? solidScriptNameDotProblem(text, 'set')
          : parameter.type === 'text'
            ? ''
            : solidScriptFieldCheck(text);
      if (problem) return { line: index + 1, message: `${parameter.label}: ${problem}` };
    }
  }
  return null;
}

/** Checked block trees of scripts, by their lines, which edits never change. */
const SOLID_SCRIPT_PROGRAM_TREES = new WeakMap<
  readonly SolidScriptTreeLine[],
  SolidScriptBlockNode<SolidScriptCommand>[]
>();

/**
 * Checks the lines of a script and builds their block tree, once per script: a
 * generator runs the same script again whenever its box or inputs change.
 *
 * @param program Lines of the script.
 * @returns Top-level lines.
 */
function solidScriptProgramLines(program: SolidScriptProgram): SolidScriptBlockNode<SolidScriptCommand>[] {
  const known = SOLID_SCRIPT_PROGRAM_TREES.get(program.blocks);
  if (known) return known;
  const problem = solidScriptProgramProblem(program);
  if (problem) throw new Error(`line ${problem.line}: ${problem.message}`);
  const lines = solidScriptBlockTree(program.blocks, solidScriptCommandFind);
  SOLID_SCRIPT_PROGRAM_TREES.set(program.blocks, lines);
  return lines;
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
    const lines = solidScriptProgramLines(program);
    const system = solidScriptSystemValues(options.context ?? 'generator', options.box ?? null);
    return new SolidScriptMachine(
      options.stepLimit,
      options.breakpoints ?? null,
      options.inputs,
      system,
      options.profile === true,
    ).run(lines);
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
      profile: new Map(),
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
    const lines = solidScriptProgramLines(program);
    const system = solidScriptSystemValues('handler', null);
    return new SolidScriptMachine(Number.POSITIVE_INFINITY, null, inputs, system).handle(lines, event);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      inputs: {},
      removed: [],
      notices: [],
      messages: [],
      error: solidScriptFailure(solidScriptErrorLine(message), message),
    };
  }
}
