import {
  SolidScriptEvaluator,
  type SolidScriptEvaluation,
  type SolidScriptPresetParsed,
  type SolidScriptRun,
} from './solid_script_evaluator.js';
import { solidScriptErrorLine, solidScriptErrorText } from './solid_script_error.js';
import { SolidScriptParser } from './solid_script_parser.js';

/** Largest accepted source text in characters. */
const SOLID_SCRIPT_SOURCE_LIMIT = 4000000;

/** How far a program runs. */
export interface SolidScriptProgramOptions {
  /** Primitives to build, for stepping through a program; all by default. */
  stepLimit?: number;
  /** Names every line can read, such as a script's inputs and variables. */
  presets?: readonly SolidScriptPreset[];
}

/** A name defined before the first line: an input or a script variable. */
export interface SolidScriptPreset {
  /** Variable name. */
  name: string;
  /** Value as code text; it may use the presets before it. */
  code: string;
  /** Where the name comes from, for messages, such as "Input". */
  origin: string;
  /** True when no line may set it again. */
  readOnly: boolean;
}

/**
 * Parses and evaluates solid script source of the supported subset.
 *
 * @param source Solid script source text.
 * @param options Step limit.
 * @returns Shapes, echo messages and the line of every primitive step.
 */
export function solidScriptProgramEvaluate(
  source: string,
  options: SolidScriptProgramOptions = {},
): SolidScriptEvaluation {
  const run = solidScriptProgramRun(source, options);
  if (run.error) throw new Error(run.error.message);
  return run;
}

/**
 * Runs solid script source and stops at the first mistake: the result keeps
 * what the lines before the failing one built, and names the line and the
 * problem. Nothing is ever skipped silently.
 *
 * @param source Solid script source text.
 * @param options Step limit.
 * @returns Shapes so far, echo messages, steps and the error, if any.
 */
export function solidScriptProgramRun(source: string, options: SolidScriptProgramOptions = {}): SolidScriptRun {
  try {
    if (source.length > SOLID_SCRIPT_SOURCE_LIMIT)
      throw new Error(`the script is longer than ${SOLID_SCRIPT_SOURCE_LIMIT} characters`);
    const statements = new SolidScriptParser(source).parseProgram();
    const presets = (options.presets ?? []).map(solidScriptPresetParse);
    return new SolidScriptEvaluator(options.stepLimit).evaluateProgram(statements, presets);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failure = { line: solidScriptErrorLine(message), message, text: solidScriptErrorText(message) };
    return { shapes: [], messages: [], steps: [], variables: [], error: failure };
  }
}

/**
 * Parses the value of a preset.
 *
 * @param preset Preset.
 * @returns Preset with its parsed value.
 */
function solidScriptPresetParse(preset: SolidScriptPreset): SolidScriptPresetParsed {
  try {
    return { ...preset, value: new SolidScriptParser(preset.code).parseValue() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${preset.origin} "${preset.name}": ${message.replace(/^line \d+: /, '')}`);
  }
}
