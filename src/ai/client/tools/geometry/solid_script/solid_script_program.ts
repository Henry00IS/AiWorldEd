import { SolidScriptEvaluator, type SolidScriptEvaluation } from './solid_script_evaluator.js';
import { SolidScriptParser } from './solid_script_parser.js';

/** Largest accepted source text in characters. */
const SOLID_SCRIPT_SOURCE_LIMIT = 200000;

/**
 * Parses and evaluates solid script source of the supported subset.
 *
 * @param source Solid script source text.
 * @returns Shapes and echo messages.
 */
export function solidScriptProgramEvaluate(source: string): SolidScriptEvaluation {
  if (source.length > SOLID_SCRIPT_SOURCE_LIMIT)
    throw new Error(`source is longer than ${SOLID_SCRIPT_SOURCE_LIMIT} characters`);
  return new SolidScriptEvaluator().evaluateProgram(new SolidScriptParser(source).parseProgram());
}
