import type { McpToolResult } from './mcp_protocol_types.js';
import { solidScriptExpressionParse } from '@/solid_script/language/solid_script_expression_parse.js';
import { SolidScriptExpressionEvaluator } from '@/solid_script/language/solid_script_expression_evaluator.js';
import { SolidScriptScope } from '@/solid_script/language/solid_script_scope.js';
import { solidScriptSystemValues } from '@/solid_script/language/solid_script_system.js';

/** Longest expression accepted. */
const MCP_CALCULATE_LENGTH_MAX = 200;

/**
 * Evaluates a formula safely (no eval) with the SolidScript formula language,
 * the same one script fields use: + - * / %, comparisons, brackets, decimals,
 * ^, PI and Math.Tau, Math.E and the other Math values, every number and vector
 * function of formulas (sqrt, sin in degrees, remap, smoothstep, wrap, snap,
 * lerp, ...), and vectors such as [1, 2, 3] * 2. E.g. "20+(0.5*12)" gives 26.
 *
 * @param expression User expression string.
 * @returns Tool result with the number or vector.
 */
export function calculateExpression(expression: string): McpToolResult {
  const trimmed = expression.trim();
  if (!trimmed) return { ok: false, message: 'expression is empty' };
  if (trimmed.length > MCP_CALCULATE_LENGTH_MAX)
    return { ok: false, message: `expression is too long (max ${MCP_CALCULATE_LENGTH_MAX} chars)` };
  try {
    const constants = solidScriptSystemValues('assistant', null, false);
    const value = new SolidScriptExpressionEvaluator(undefined, undefined, (name) =>
      name.startsWith('Math.') ? constants.get(name) : undefined,
    ).evaluate(solidScriptExpressionParse(trimmed), new SolidScriptScope(null));
    const finite = (entry: unknown): boolean => typeof entry === 'number' && Number.isFinite(entry);
    if (!finite(value) && !(Array.isArray(value) && value.length > 0 && value.every(finite)))
      return { ok: false, message: 'result is not a finite number or vector' };
    return { ok: true, message: 'Calculated', data: { expression: trimmed, value } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `Invalid expression: ${message}` };
  }
}
