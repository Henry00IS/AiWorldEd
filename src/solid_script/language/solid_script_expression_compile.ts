import type { SolidScriptExpression } from './solid_script_ast.js';
import {
  SOLID_SCRIPT_FUNCTION_DOCS,
  solidScriptFunctionArguments,
  type SolidScriptFunctionArgument,
} from './solid_script_function_docs.js';
import { solidScriptKindFits, solidScriptKindOf, solidScriptKindsWords } from './solid_script_kinds.js';
import { solidScriptArithmeticBinary } from './solid_script_arithmetic.js';
import type { SolidScriptExpressionEvaluator } from './solid_script_expression_evaluator.js';
import { SOLID_SCRIPT_FUNCTIONS_BUILTIN } from './solid_script_functions_builtin.js';
import { solidScriptHits, solidScriptHitsBox } from './solid_script_hits.js';
import { solidScriptFunctionKey, solidScriptFunctionSpelling, solidScriptNameKey } from './solid_script_name_key.js';
import { SOLID_SCRIPT_VECTOR_AXES } from './solid_script_members.js';
import { solidScriptSystemBareHint } from './solid_script_system_names.js';
import type { SolidScriptScope } from './solid_script_scope.js';
import { solidScriptValueShow, solidScriptValueTruthy, type SolidScriptValue } from './solid_script_value.js';

/** A formula turned into a JavaScript closure. */
export type SolidScriptCompiled = (
  evaluator: SolidScriptExpressionEvaluator,
  scope: SolidScriptScope,
) => SolidScriptValue;

/** Values of the bracketed parts of one field formula while it runs. */
export interface SolidScriptSlotFrame {
  values: readonly SolidScriptValue[];
}

/** Frames of slot nodes, so a compiled slot reads its formula's values. */
const SOLID_SCRIPT_SLOT_FRAMES = new WeakMap<SolidScriptExpression, SolidScriptSlotFrame>();

/**
 * Makes a slot node that reads one value of a field formula's frame.
 *
 * @param index Slot index.
 * @param frame Frame holding the values while the formula runs.
 * @returns Slot node.
 */
export function solidScriptSlotNode(index: number, frame: SolidScriptSlotFrame): SolidScriptExpression {
  const node: SolidScriptExpression = { kind: 'slot', index };
  SOLID_SCRIPT_SLOT_FRAMES.set(node, frame);
  return node;
}

/** Official Vector axis members by name key, in X, Y, Z order. */
const SOLID_SCRIPT_MEMBERS: Readonly<Record<string, number>> = Object.fromEntries(
  SOLID_SCRIPT_VECTOR_AXES.map((axis, index) => [solidScriptNameKey(axis), index]),
);

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
    case 'slot':
      return solidScriptCompileSlot(expression);
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
 * Compiles a slot read: the value its formula put in its frame.
 *
 * @param expression Slot node.
 * @returns Closure.
 */
function solidScriptCompileSlot(expression: Extract<SolidScriptExpression, { kind: 'slot' }>): SolidScriptCompiled {
  const frame = SOLID_SCRIPT_SLOT_FRAMES.get(expression);
  if (!frame) throw new Error('a bracketed part of a formula was read outside its field');
  const index = expression.index;
  return () => frame.values[index];
}

/**
 * Compiles a variable read: one walk out through the scopes.
 *
 * @param name Variable name.
 * @returns Closure.
 */
function solidScriptCompileVariable(written: string): SolidScriptCompiled {
  const name = solidScriptNameKey(written);
  const hinted = solidScriptSystemBareHint(written);
  return (evaluator, scope) => {
    const home = scope.variableHome(name);
    if (home) return home.variableOwn(name);
    if (hinted && !evaluator.scriptWrites(name)) throw new Error(hinted);
    return evaluator.variableMissing(name, scope);
  };
}

/**
 * Tells that a built-in function cannot work with the values it was given, and
 * how it is written.
 *
 * @param name Function name as shown.
 * @param key Built-in function key.
 * @param values Values it was given.
 * @returns Error.
 */
function solidScriptCompileCallMistake(name: string, key: string, values: readonly SolidScriptValue[]): Error {
  const usage = SOLID_SCRIPT_FUNCTION_DOCS[key]?.usage;
  const given = values.map(solidScriptValueShow).join(', ') || 'no values';
  return new Error(`${name}() cannot use ${given}${usage ? `; write it as ${usage}` : ''}`);
}

/**
 * Runs a built-in function, including Hits and HitsBox which need the boxes of
 * the running script.
 *
 * @param key Stored name, such as hits.
 * @param builtin Ordinary implementation.
 * @param values Evaluated arguments.
 * @param evaluator Running evaluator.
 * @returns Result, or undefined when the values do not fit.
 */
function solidScriptCompileBuiltin(
  key: string,
  builtin: (args: SolidScriptValue[]) => SolidScriptValue,
  values: readonly SolidScriptValue[],
  evaluator: SolidScriptExpressionEvaluator,
): SolidScriptValue {
  if (key === 'hits') return solidScriptHits(values, (items) => evaluator.bounds(items));
  if (key === 'hits_box') return solidScriptHitsBox(values, (items) => evaluator.bounds(items));
  return builtin([...values]);
}

/**
 * Compiles a call; built-in functions are looked up once.
 *
 * @param written Function name as written.
 * @param args Compiled arguments.
 * @returns Closure.
 */
function solidScriptCompileCall(written: string, args: readonly SolidScriptCompiled[]): SolidScriptCompiled {
  const found = solidScriptBuiltinFind(written);
  const builtin = found ? SOLID_SCRIPT_FUNCTIONS_BUILTIN[found] : undefined;
  const name = found ? solidScriptFunctionSpelling(found) : solidScriptNameKey(written);
  if (found === 'parse')
    return (evaluator, scope) => {
      if (args.length !== 1) throw new Error('Parse(text) takes one text');
      return evaluator.parseText(args[0]!(evaluator, scope), scope);
    };
  const inputs = found ? solidScriptFunctionArguments(found) : [];
  const more = inputs.find((input) => input.name === '...');
  return (evaluator, scope) => {
    const values = new Array<SolidScriptValue>(args.length);
    for (let index = 0; index < args.length; index++) values[index] = args[index]!(evaluator, scope);
    if (!found || !builtin) return evaluator.callUser(name, values);
    solidScriptCompileInputsCheck(name, inputs, more, values);
    const result = solidScriptCompileBuiltin(found, builtin, values, evaluator);
    if (result === undefined && found !== 'is_undef') throw solidScriptCompileCallMistake(name, found, values);
    return result;
  };
}

/**
 * Stops a call of a built-in function given a value of a kind one of its inputs
 * does not take, in the words its declared kinds give.
 *
 * @param name Function name as shown.
 * @param inputs Its inputs with their kinds.
 * @param more The input that takes any number of further values, if it has one.
 * @param values Values given.
 */
function solidScriptCompileInputsCheck(
  name: string,
  inputs: readonly SolidScriptFunctionArgument[],
  more: SolidScriptFunctionArgument | undefined,
  values: readonly SolidScriptValue[],
): void {
  for (let index = 0; index < values.length; index++) {
    const input = inputs[index] ?? more;
    if (!input || input.type === 'Any') continue;
    const kind = solidScriptKindOf(values[index]);
    if (!solidScriptKindFits(input.type, kind))
      throw new Error(
        `${name}() needs ${solidScriptKindsWords(input.type)} for ${solidScriptFunctionSpelling(input.name)}, not ${/^[AEIOU]/.test(kind) ? 'an' : 'a'} ${kind}: ${solidScriptValueShow(values[index])}`,
      );
  }
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
 * Compiles a member read: a built-in value such as $Time.Year when the first
 * name is not a variable, otherwise .X, .Y or .Z of a vector.
 *
 * @param expression Member node.
 * @returns Closure.
 */
function solidScriptCompileMember(expression: Extract<SolidScriptExpression, { kind: 'member' }>): SolidScriptCompiled {
  const target = solidScriptExpressionCompiled(expression.target);
  const index = SOLID_SCRIPT_MEMBERS[solidScriptNameKey(expression.name)];
  const path = solidScriptCompileMemberPath(expression);
  return (evaluator, scope) => {
    const builtIn = path ? solidScriptCompileSystemRead(evaluator, scope, path.root, path.dotted) : undefined;
    return builtIn !== undefined ? builtIn : evaluator.evaluateIndex(target(evaluator, scope), index);
  };
}

/**
 * Reads the dotted name of a member chain, such as $Math.Pi.
 *
 * @param expression Member node.
 * @returns Root and dotted keys, or null when the start is not a name.
 */
function solidScriptCompileMemberPath(
  expression: Extract<SolidScriptExpression, { kind: 'member' }>,
): { root: string; dotted: string } | null {
  const names: string[] = [];
  let part: SolidScriptExpression = expression;
  while (part.kind === 'member') {
    names.unshift(part.name);
    part = part.target;
  }
  if (part.kind !== 'variable') return null;
  const root = solidScriptNameKey(part.name);
  return { root, dotted: solidScriptNameKey([root, ...names].join('.')) };
}

/**
 * Reads a built-in value written as $Math.Pi, or tells the user to add the $
 * when the same name is written without it.
 *
 * @param evaluator Formula evaluator.
 * @param scope Scope of the running formula.
 * @param root First name, folded, such as $math or math.
 * @param dotted Whole name, folded, such as $math.pi.
 * @returns Built-in value, or undefined when this is not a built-in value.
 */
function solidScriptCompileSystemRead(
  evaluator: SolidScriptExpressionEvaluator,
  scope: SolidScriptScope,
  root: string,
  dotted: string,
): SolidScriptValue | undefined {
  if (scope.variableHas(root)) return undefined;
  if (root.startsWith('$')) return evaluator.systemRead(dotted.slice(1));
  const hinted = solidScriptSystemBareHint(dotted);
  if (hinted && !evaluator.scriptWrites(root)) throw new Error(hinted);
  return undefined;
}

/** Built-in function names by key, made on first use. */
let solidScriptBuiltinKeys: Map<string, string> | null = null;

/**
 * Finds a built-in function whatever its case and underscores, such as
 * CharacterCode for character_code.
 *
 * @param name Name as written.
 * @returns Stored name, or undefined for none.
 */
export function solidScriptBuiltinFind(name: string): string | undefined {
  solidScriptBuiltinKeys ??= new Map(
    Object.keys(SOLID_SCRIPT_FUNCTIONS_BUILTIN).map((stored) => [solidScriptFunctionKey(stored), stored]),
  );
  return solidScriptBuiltinKeys.get(solidScriptFunctionKey(name));
}
