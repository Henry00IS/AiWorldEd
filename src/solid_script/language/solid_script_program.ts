import { SolidScriptEvaluator, type SolidScriptEvaluation } from './solid_script_evaluator.js';
import { SolidScriptParser } from './solid_script_parser.js';

/** Largest accepted source text in characters. */
const SOLID_SCRIPT_SOURCE_LIMIT = 200000;

/** How far a program runs. */
export interface SolidScriptProgramOptions {
  /** Primitives to build, for stepping through a program; all by default. */
  stepLimit?: number;
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
  if (source.length > SOLID_SCRIPT_SOURCE_LIMIT)
    throw new Error(`source is longer than ${SOLID_SCRIPT_SOURCE_LIMIT} characters`);
  const evaluator = new SolidScriptEvaluator(options.stepLimit);
  return evaluator.evaluateProgram(new SolidScriptParser(source).parseProgram());
}
