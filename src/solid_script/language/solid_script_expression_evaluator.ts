import type { SolidScriptArgument, SolidScriptBinding, SolidScriptExpression } from './solid_script_ast.js';
import { solidScriptArithmeticBinary } from './solid_script_arithmetic.js';
import { SOLID_SCRIPT_FUNCTIONS_BUILTIN } from './solid_script_functions_builtin.js';
import { SolidScriptScope } from './solid_script_scope.js';
import {
  SOLID_SCRIPT_LIST_LIMIT,
  solidScriptValueNumber,
  solidScriptValueShow,
  solidScriptValueTruthy,
  type SolidScriptValue,
} from './solid_script_value.js';

/** Vector member names and their indices. */
const SOLID_SCRIPT_MEMBERS: Readonly<Record<string, number>> = { x: 0, y: 1, z: 2 };

/** Evaluates expressions of the solid script language. */
export class SolidScriptExpressionEvaluator {
  /**
   * Creates the expression evaluator.
   *
   * @param tick Counts one step of work: each loop round and function call.
   * @param userCall Works out a function the script defines, or returns null
   *   when it defines none of that name.
   */
  constructor(
    private readonly tick: () => void = () => {},
    private readonly userCall: (
      name: string,
      values: readonly SolidScriptValue[],
    ) => { value: SolidScriptValue } | null = () => null,
  ) {}

  /**
   * Evaluates an expression.
   *
   * @param expression Expression.
   * @param scope Scope for names.
   * @returns Value.
   */
  evaluate(expression: SolidScriptExpression, scope: SolidScriptScope): SolidScriptValue {
    switch (expression.kind) {
      case 'number':
      case 'string':
      case 'boolean':
        return expression.value;
      case 'undef':
        return undefined;
      case 'variable':
        return this.evaluateVariable(expression.name, scope);
      case 'vector':
        return expression.items.map((item) => this.evaluate(item, scope));
      case 'call':
        return this.evaluateCall(expression.name, expression.args, scope);
      default:
        return this.evaluateCompound(expression, scope);
    }
  }

  /**
   * Evaluates operators, calls, ranges and comprehensions.
   *
   * @param expression Expression.
   * @param scope Scope.
   * @returns Value.
   */
  private evaluateCompound(expression: SolidScriptExpression, scope: SolidScriptScope): SolidScriptValue {
    switch (expression.kind) {
      case 'unary':
        return this.evaluateUnary(expression.operator, this.evaluate(expression.operand, scope));
      case 'binary':
        return this.evaluateBinary(expression.operator, expression.left, expression.right, scope);
      case 'ternary': {
        const truthy = solidScriptValueTruthy(this.evaluate(expression.condition, scope));
        return this.evaluate(truthy ? expression.whenTrue : expression.whenFalse, scope);
      }
      case 'index':
        return this.evaluateIndex(this.evaluate(expression.target, scope), this.evaluate(expression.index, scope));
      case 'member':
        return this.evaluateIndex(this.evaluate(expression.target, scope), SOLID_SCRIPT_MEMBERS[expression.name]);
      case 'range':
        return this.rangeValues(expression, scope);
      case 'comprehension':
        return this.bindingsWalk(expression.bindings, scope, (inner) => [this.evaluate(expression.body, inner)]);
      default:
        return undefined;
    }
  }

  /**
   * Applies a prefix operator.
   *
   * @param operator Operator symbol.
   * @param value Operand.
   * @returns Result.
   */
  private evaluateUnary(operator: string, value: SolidScriptValue): SolidScriptValue {
    if (operator === '!') return !solidScriptValueTruthy(value);
    if (operator === '+') return value;
    return solidScriptArithmeticBinary('*', -1, value);
  }

  /**
   * Applies a binary operator, short-circuiting logic operators.
   *
   * @param operator Operator symbol.
   * @param left Left expression.
   * @param right Right expression.
   * @param scope Scope.
   * @returns Result.
   */
  private evaluateBinary(
    operator: string,
    left: SolidScriptExpression,
    right: SolidScriptExpression,
    scope: SolidScriptScope,
  ): SolidScriptValue {
    const leftValue = this.evaluate(left, scope);
    if (operator === '&&' && !solidScriptValueTruthy(leftValue)) return false;
    if (operator === '||' && solidScriptValueTruthy(leftValue)) return true;
    return solidScriptArithmeticBinary(operator, leftValue, this.evaluate(right, scope));
  }

  /**
   * Indexes a vector or string.
   *
   * @param target Indexed value.
   * @param index Index value.
   * @returns Entry, or undefined.
   */
  private evaluateIndex(target: SolidScriptValue, index: SolidScriptValue): SolidScriptValue {
    const position = solidScriptValueNumber(index);
    if (position === undefined) throw new Error(`a position must be a number, not ${solidScriptValueShow(index)}`);
    if (!Array.isArray(target) && typeof target !== 'string')
      throw new Error(`${solidScriptValueShow(target)} is not a list, so it has no position ${position}`);
    const entry = target[Math.floor(position)];
    if (entry === undefined)
      throw new Error(`position ${position} is outside ${solidScriptValueShow(target)}; positions start at 0`);
    return entry;
  }

  /**
   * Reads a variable; a name that is not defined is a mistake, so the error
   * lists the names known at that point.
   *
   * @param name Variable name.
   * @param scope Scope.
   * @returns Value.
   */
  private evaluateVariable(name: string, scope: SolidScriptScope): SolidScriptValue {
    if (name === 'PI') return Math.PI;
    if (scope.variableHas(name)) return scope.variableGet(name);
    const known = [...scope.variablesVisible().keys()].sort();
    const listed = known.length > 0 ? `Known here: ${known.join(', ')}` : 'No variables are known here';
    throw new Error(`"${name}" is not a variable here. ${listed}`);
  }

  /**
   * Calls a built-in function.
   *
   * @param name Function name.
   * @param args Call arguments.
   * @param scope Calling scope.
   * @returns Result.
   */
  private evaluateCall(name: string, args: SolidScriptArgument[], scope: SolidScriptScope): SolidScriptValue {
    const builtin = SOLID_SCRIPT_FUNCTIONS_BUILTIN[name];
    const values = args.map((arg) => this.evaluate(arg.value, scope));
    if (!builtin) {
      const result = this.userCall(name, values);
      if (!result) throw new Error(`unknown function ${name}(); define it with Define Function`);
      return result.value;
    }
    const result = builtin(values);
    if (result === undefined && name !== 'is_undef')
      throw new Error(`${name}() cannot use ${values.map(solidScriptValueShow).join(', ') || 'no values'}`);
    return result;
  }

  /**
   * Expands a range into its values.
   *
   * @param range Range expression.
   * @param scope Scope.
   * @returns Values.
   */
  private rangeValues(range: Extract<SolidScriptExpression, { kind: 'range' }>, scope: SolidScriptScope): number[] {
    const start = solidScriptValueNumber(this.evaluate(range.start, scope)) ?? 0;
    const end = solidScriptValueNumber(this.evaluate(range.end, scope)) ?? 0;
    const step = range.step ? (solidScriptValueNumber(this.evaluate(range.step, scope)) ?? 1) : 1;
    if (step === 0 || (end - start) / step > SOLID_SCRIPT_LIST_LIMIT) throw new Error('range too long');
    const values: number[] = [];
    for (let value = start; step > 0 ? value <= end + 1e-9 : value >= end - 1e-9; value += step) values.push(value);
    return values;
  }

  /**
   * Walks nested loop bindings and concatenates what the visitor returns.
   *
   * @param bindings Loop bindings, outermost first.
   * @param scope Enclosing scope.
   * @param visit Called with a scope holding one combination of loop values.
   * @returns Concatenated visitor results.
   */
  bindingsWalk<T>(
    bindings: SolidScriptBinding[],
    scope: SolidScriptScope,
    visit: (inner: SolidScriptScope) => T[],
  ): T[] {
    const [first, ...rest] = bindings;
    if (!first) return visit(scope);
    const source = this.evaluate(first.value, scope);
    const values = Array.isArray(source) ? source : [source];
    return values.flatMap((value) => {
      this.tick();
      const inner = new SolidScriptScope(scope);
      inner.variableDefine(first.name, value);
      return this.bindingsWalk(rest, inner, visit);
    });
  }
}
