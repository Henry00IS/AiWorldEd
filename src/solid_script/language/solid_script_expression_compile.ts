import type { SolidScriptExpression } from './solid_script_ast.js';
import { solidScriptArithmeticBinary } from './solid_script_arithmetic.js';
import type { SolidScriptExpressionEvaluator } from './solid_script_expression_evaluator.js';
import { SOLID_SCRIPT_FUNCTIONS_BUILTIN } from './solid_script_functions_builtin.js';
import type { SolidScriptScope } from './solid_script_scope.js';
import { solidScriptValueShow, solidScriptValueTruthy, type SolidScriptValue } from './solid_script_value.js';

/** A formula turned into a JavaScript closure. */
export type SolidScriptCompiled = (
  evaluator: SolidScriptExpressionEvaluator,
  scope: SolidScriptScope,
) => SolidScriptValue;

/** Vector member names and their indices. */
const SOLID_SCRIPT_MEMBERS: Readonly<Record<string, number>> = { x: 0, y: 1, z: 2 };

/**
 * Closures by parsed formula; parsed formulas are kept with their fields, so
 * this lasts across runs.
 */
const SOLID_SCRIPT_COMPILED = new WeakMap<SolidScriptExpression, SolidScriptCompiled>();

/**
 * Returns the closure of a parsed formula, making it the first time.
 *
 * @param expression Parsed formula.
 * @returns Closure.
 */
export function solidScriptExpressionCompiled(expression: SolidScriptExpression): SolidScriptCompiled {
  let compiled = SOLID_SCRIPT_COMPILED.get(expression);
  if (!compiled) {
    compiled = solidScriptExpressionCompile(expression);
    SOLID_SCRIPT_COMPILED.set(expression, compiled);
  }
  return compiled;
}

/**
 * Turns one formula node into a closure.
 *
 * @param expression Node.
 * @returns Closure.
 */
function solidScriptExpressionCompile(expression: SolidScriptExpression): SolidScriptCompiled {
  switch (expression.kind) {
    case 'number':
    case 'string':
    case 'boolean': {
      const value = expression.value;
      return () => value;
    }
    case 'undef':
      return () => undefined;
    case 'slot': {
      const index = expression.index;
      return (evaluator) => evaluator.slotRead(index);
    }
    case 'variable':
      return solidScriptCompileVariable(expression.name);
    case 'vector': {
      const items = expression.items.map(solidScriptExpressionCompiled);
      return (evaluator, scope) => {
        const values = new Array<SolidScriptValue>(items.length);
        for (let index = 0; index < items.length; index++) values[index] = items[index]!(evaluator, scope);
        return values;
      };
    }
    case 'call':
      return solidScriptCompileCall(
        expression.name,
        expression.args.map((arg) => solidScriptExpressionCompiled(arg.value)),
      );
    case 'unary': {
      const operand = solidScriptExpressionCompiled(expression.operand);
      const operator = expression.operator;
      return (evaluator, scope) => evaluator.evaluateUnary(operator, operand(evaluator, scope));
    }
    case 'binary':
      return solidScriptCompileBinary(
        expression.operator,
        solidScriptExpressionCompiled(expression.left),
        solidScriptExpressionCompiled(expression.right),
      );
    case 'ternary': {
      const condition = solidScriptExpressionCompiled(expression.condition);
      const whenTrue = solidScriptExpressionCompiled(expression.whenTrue);
      const whenFalse = solidScriptExpressionCompiled(expression.whenFalse);
      return (evaluator, scope) =>
        solidScriptValueTruthy(condition(evaluator, scope)) ? whenTrue(evaluator, scope) : whenFalse(evaluator, scope);
    }
    case 'index': {
      const target = solidScriptExpressionCompiled(expression.target);
      const index = solidScriptExpressionCompiled(expression.index);
      return (evaluator, scope) => evaluator.evaluateIndex(target(evaluator, scope), index(evaluator, scope));
    }
    case 'member':
      return solidScriptCompileMember(expression);
    default:
      return (evaluator, scope) => evaluator.evaluateWalked(expression, scope);
  }
}

/**
 * Compiles a variable read: one walk out through the scopes.
 *
 * @param name Variable name.
 * @returns Closure.
 */
function solidScriptCompileVariable(name: string): SolidScriptCompiled {
  if (name === 'PI') return () => Math.PI;
  return (evaluator, scope) => {
    const home = scope.variableHome(name);
    return home ? home.variableOwn(name) : evaluator.variableMissing(name, scope);
  };
}

/**
 * Compiles a call; built-in functions are looked up once.
 *
 * @param name Function name.
 * @param args Compiled arguments.
 * @returns Closure.
 */
function solidScriptCompileCall(name: string, args: readonly SolidScriptCompiled[]): SolidScriptCompiled {
  const builtin = Object.hasOwn(SOLID_SCRIPT_FUNCTIONS_BUILTIN, name)
    ? SOLID_SCRIPT_FUNCTIONS_BUILTIN[name]
    : undefined;
  return (evaluator, scope) => {
    const values = new Array<SolidScriptValue>(args.length);
    for (let index = 0; index < args.length; index++) values[index] = args[index]!(evaluator, scope);
    if (!builtin) return evaluator.callUser(name, values);
    const result = builtin(values);
    if (result === undefined && name !== 'is_undef')
      throw new Error(`${name}() cannot use ${values.map(solidScriptValueShow).join(', ') || 'no values'}`);
    return result;
  };
}

/**
 * Compiles a binary operator, with a fast path for two numbers.
 *
 * @param operator Operator symbol.
 * @param left Compiled left side.
 * @param right Compiled right side.
 * @returns Closure.
 */
function solidScriptCompileBinary(
  operator: string,
  left: SolidScriptCompiled,
  right: SolidScriptCompiled,
): SolidScriptCompiled {
  if (operator === '&&')
    return (evaluator, scope) =>
      solidScriptValueTruthy(left(evaluator, scope)) && solidScriptValueTruthy(right(evaluator, scope));
  if (operator === '||')
    return (evaluator, scope) =>
      solidScriptValueTruthy(left(evaluator, scope)) || solidScriptValueTruthy(right(evaluator, scope));
  const general = (a: SolidScriptValue, b: SolidScriptValue): SolidScriptValue =>
    solidScriptArithmeticBinary(operator, a, b);
  const both = (fast: (a: number, b: number) => SolidScriptValue): SolidScriptCompiled => {
    return (evaluator, scope) => {
      const a = left(evaluator, scope);
      const b = right(evaluator, scope);
      return typeof a === 'number' && typeof b === 'number' ? fast(a, b) : general(a, b);
    };
  };
  switch (operator) {
    case '+':
      return both((a, b) => a + b);
    case '-':
      return both((a, b) => a - b);
    case '*':
      return both((a, b) => a * b);
    case '/':
      return both((a, b) => (b === 0 ? general(a, b) : a / b));
    case '<':
      return both((a, b) => a < b);
    case '<=':
      return both((a, b) => a <= b);
    case '>':
      return both((a, b) => a > b);
    case '>=':
      return both((a, b) => a >= b);
    default:
      return both(general);
  }
}

/**
 * Compiles a member read: a built-in value such as Time.Year when the first
 * name is not a variable, otherwise .x, .y or .z of a vector.
 *
 * @param expression Member node.
 * @returns Closure.
 */
function solidScriptCompileMember(expression: Extract<SolidScriptExpression, { kind: 'member' }>): SolidScriptCompiled {
  const target = solidScriptExpressionCompiled(expression.target);
  const index = SOLID_SCRIPT_MEMBERS[expression.name];
  const names: string[] = [];
  let part: SolidScriptExpression = expression;
  while (part.kind === 'member') {
    names.unshift(part.name);
    part = part.target;
  }
  const root = part.kind === 'variable' ? part.name : null;
  const dotted = root === null ? '' : [root, ...names].join('.');
  return (evaluator, scope) => {
    if (root !== null && !scope.variableHas(root)) {
      const builtIn = evaluator.systemRead(dotted);
      if (builtIn !== undefined) return builtIn;
    }
    return evaluator.evaluateIndex(target(evaluator, scope), index);
  };
}
