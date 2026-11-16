import type { SolidScriptBinding, SolidScriptExpression } from './solid_script_ast.js';
import { solidScriptArithmeticBinary } from './solid_script_arithmetic.js';
import { solidScriptExpressionCompiled, type SolidScriptCompiled } from './solid_script_expression_compile.js';
import { SolidScriptScope } from './solid_script_scope.js';
import {
  SOLID_SCRIPT_LIST_LIMIT,
  solidScriptValueNumber,
  solidScriptValueShow,
  solidScriptValueTruthy,
  type SolidScriptValue,
} from './solid_script_value.js';

/** Evaluates expressions of the solid script language. */
export class SolidScriptExpressionEvaluator {
  /**
   * Creates the expression evaluator.
   *
   * @param tick Counts one step of work: each loop round and function call.
   * @param userCall Works out a function the script defines, or returns null
   *   when it defines none of that name.
   * @param system Reads a built-in value by name.
   * @param shown Spells a name key for a message, as it was written.
   */
  constructor(
    private readonly tick: () => void = () => {},
    private readonly userCall: (
      name: string,
      values: readonly SolidScriptValue[],
    ) => { value: SolidScriptValue } | null = () => null,
    private readonly system: (name: string) => SolidScriptValue = () => undefined,
    private readonly shown: (key: string) => string = (key) => key,
  ) {}

  /**
   * Evaluates an expression. Each formula is turned into JavaScript closures
   * once, kept with its parsed tree, and every later run calls them.
   *
   * @param expression Expression.
   * @param scope Scope for names.
   * @returns Value.
   */
  evaluate(expression: SolidScriptExpression, scope: SolidScriptScope): SolidScriptValue {
    return solidScriptExpressionCompiled(expression)(this, scope);
  }

  /**
   * Evaluates a compiled formula.
   *
   * @param formula Compiled formula.
   * @param scope Scope for names.
   * @returns Value.
   */
  evaluateCompiled(formula: SolidScriptCompiled, scope: SolidScriptScope): SolidScriptValue {
    return formula(this, scope);
  }

  /**
   * Evaluates a range or comprehension, which run seldom enough to walk.
   *
   * @param expression Range or comprehension.
   * @param scope Scope.
   * @returns Values.
   */
  evaluateWalked(expression: SolidScriptExpression, scope: SolidScriptScope): SolidScriptValue {
    if (expression.kind === 'range') return this.rangeValues(expression, scope);
    if (expression.kind === 'comprehension')
      return this.bindingsWalk(expression.bindings, scope, (inner) => [this.evaluate(expression.body, inner)]);
    return undefined;
  }

  /**
   * Applies a prefix operator.
   *
   * @param operator Operator symbol.
   * @param value Operand.
   * @returns Result.
   */
  evaluateUnary(operator: string, value: SolidScriptValue): SolidScriptValue {
    if (operator === '!') return !solidScriptValueTruthy(value);
    if (operator === '+') return value;
    return solidScriptArithmeticBinary('*', -1, value);
  }

  /**
   * Indexes a vector or string.
   *
   * @param target Indexed value.
   * @param index Index value.
   * @returns Entry, or undefined.
   */
  evaluateIndex(target: SolidScriptValue, index: SolidScriptValue): SolidScriptValue {
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
   * Reads a built-in value written with dots, such as Time.Year.
   *
   * @param name Dotted name.
   * @returns Value, or undefined when it is not a built-in value.
   */
  systemRead(name: string): SolidScriptValue {
    return this.system(name);
  }

  /**
   * Explains a name that is not defined, listing the names known at that point.
   *
   * @param name Variable name.
   * @param scope Scope.
   */
  variableMissing(name: string, scope: SolidScriptScope): never {
    const known = [...scope.variablesVisible().keys()].map(this.shown).sort();
    const listed = known.length > 0 ? `Known here: ${known.join(', ')}` : 'No variables are known here';
    throw new Error(`"${this.shown(name)}" is not a variable here. ${listed}`);
  }

  /**
   * Calls a function the script defines.
   *
   * @param name Function name.
   * @param values Evaluated arguments.
   * @returns Result.
   */
  callUser(name: string, values: readonly SolidScriptValue[]): SolidScriptValue {
    const result = this.userCall(name, values);
    if (!result) throw new Error(`unknown function ${this.shown(name)}(); add a Function block with this name`);
    return result.value;
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
  private bindingsWalk<T>(
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
