import { ScadEvaluator, type ScadEvaluation } from './scad_evaluator.js';
import { ScadParser } from './scad_parser.js';

/** Largest accepted source text in characters. */
const SCAD_SOURCE_LIMIT = 200000;

/**
 * Parses and evaluates OpenSCAD source of the supported subset.
 *
 * @param source OpenSCAD source text.
 * @returns Shapes and echo messages.
 */
export function scadProgramEvaluate(source: string): ScadEvaluation {
  if (source.length > SCAD_SOURCE_LIMIT) throw new Error(`source is longer than ${SCAD_SOURCE_LIMIT} characters`);
  return new ScadEvaluator().evaluateProgram(new ScadParser(source).parseProgram());
}
